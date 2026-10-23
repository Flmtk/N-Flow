import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { config, microsoftAktiv } from "../config.js";
import { sql } from "../db.js";
import { protokolliere } from "../protokoll.js";
import { sitzungAnlegen, sitzungBeenden } from "../sitzung.js";

/**
 * Anmeldung über Microsoft Entra ID (OpenID Connect, Code-Flow mit PKCE).
 * Nur Personen, die als Mitarbeiter angelegt und aktiv sind, kommen hinein.
 * Die Adressen in ADMIN_EMAILS werden beim ersten Mal als Geschäftsführung angelegt.
 */

const MS = () => `https://login.microsoftonline.com/${config.microsoft.mandant}`;
const RUECKSPRUNG = () => `${config.baseUrl}/auth/callback`;
const TEMP_COOKIE = "nflow_login";

let schluessel: ReturnType<typeof createRemoteJWKSet> | null = null;
const jwks = () => (schluessel ??= createRemoteJWKSet(new URL(`${MS()}/discovery/v2.0/keys`)));

const b64url = (b: Buffer) => b.toString("base64url");

function kuerzelAus(name: string): string {
  return name.split(/\s+/).map((t) => t[0] ?? "").join("").slice(0, 2).toUpperCase() || "??";
}

async function anmelden(
  email: string,
  name: string,
  geraet: string,
): Promise<{ id: string; name: string } | { fehler: string }> {
  const adresse = email.toLowerCase();
  let [m] = await sql<{ id: string; name: string; aktiv: boolean; gesperrt: boolean }[]>`
    select id, name, aktiv, gesperrt from mitarbeiter where lower(email) = ${adresse}`;

  if (!m && config.startAdmins.includes(adresse)) {
    [m] = await sql`
      insert into mitarbeiter (kuerzel, name, email, rolle)
      values (${kuerzelAus(name)}, ${name}, ${adresse}, 'Geschäftsführung')
      returning id, name, aktiv, gesperrt`;
    await protokolliere("System", "Mitarbeiter angelegt", `${name} (Start-Administrator)`);
  }
  if (!m) return { fehler: "Für diese Adresse ist in N-Flow kein Zugang angelegt." };
  if (!m.aktiv || m.gesperrt) return { fehler: "Dieser Zugang ist gesperrt." };
  await protokolliere(m.name, "Anmeldung", geraet.includes("Mobile") ? "App" : "Büro");
  return { id: m.id, name: m.name };
}

export async function anmeldungRouten(app: FastifyInstance): Promise<void> {
  app.get("/auth/login", async (anfrage, antwort) => {
    if (!microsoftAktiv) {
      return antwort.code(503).type("text/plain; charset=utf-8")
        .send("Die Microsoft-Anmeldung ist noch nicht eingerichtet (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET).");
    }
    const status = b64url(randomBytes(16));
    const nonce = b64url(randomBytes(16));
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());

    antwort.setCookie(TEMP_COOKIE, JSON.stringify({ status, nonce, verifier }), {
      path: "/auth", httpOnly: true, secure: config.produktion, sameSite: "lax", maxAge: 600, signed: true,
    });

    const url = new URL(`${MS()}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: config.microsoft.clientId,
      response_type: "code",
      redirect_uri: RUECKSPRUNG(),
      response_mode: "query",
      scope: "openid profile email offline_access User.Read",
      state: status,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return antwort.redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    "/auth/callback",
    async (anfrage, antwort) => {
      const zurueck = (text: string) => antwort.redirect(`/?hinweis=${encodeURIComponent(text)}`);
      if (anfrage.query.error) return zurueck("Die Anmeldung bei Microsoft wurde abgebrochen.");

      const roh = anfrage.cookies[TEMP_COOKIE];
      const geprueft = roh ? anfrage.unsignCookie(roh) : null;
      antwort.clearCookie(TEMP_COOKIE, { path: "/auth" });
      if (!geprueft?.valid || !geprueft.value) return zurueck("Die Anmeldung ist abgelaufen. Bitte erneut versuchen.");
      const temp = JSON.parse(geprueft.value) as { status: string; nonce: string; verifier: string };
      if (!anfrage.query.code || anfrage.query.state !== temp.status) return zurueck("Ungültige Antwort von Microsoft.");

      const tokenAntwort = await fetch(`${MS()}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.microsoft.clientId,
          client_secret: config.microsoft.clientSecret,
          grant_type: "authorization_code",
          code: anfrage.query.code,
          redirect_uri: RUECKSPRUNG(),
          code_verifier: temp.verifier,
        }),
      });
      if (!tokenAntwort.ok) {
        anfrage.log.warn({ status: tokenAntwort.status, body: await tokenAntwort.text() }, "Token-Abruf fehlgeschlagen");
        return zurueck("Microsoft hat die Anmeldung nicht bestätigt.");
      }
      const tokens = (await tokenAntwort.json()) as { id_token: string };

      const { payload } = await jwtVerify(tokens.id_token, jwks(), {
        issuer: `${MS()}/v2.0`,
        audience: config.microsoft.clientId,
      });
      if (payload.nonce !== temp.nonce) return zurueck("Ungültige Antwort von Microsoft.");

      const email = String(payload.email ?? payload.preferred_username ?? "");
      const name = String(payload.name ?? email);
      const ergebnis = await anmelden(email, name, anfrage.headers["user-agent"] ?? "");
      if ("fehler" in ergebnis) {
        await protokolliere(email || "unbekannt", "Anmeldung abgelehnt", ergebnis.fehler);
        return zurueck(ergebnis.fehler);
      }
      await sitzungAnlegen(antwort, ergebnis.id, anfrage.headers["user-agent"] ?? "");
      return antwort.redirect("/");
    },
  );

  app.post("/auth/logout", async (anfrage, antwort) => {
    await sitzungBeenden(anfrage, antwort);
    return { ok: true };
  });

  // Nur lokal zum Entwickeln: Anmeldung ohne Microsoft per ?email=
  if (config.devLogin) {
    app.get<{ Querystring: { email?: string } }>("/auth/dev", async (anfrage, antwort) => {
      const email = anfrage.query.email ?? config.startAdmins[0] ?? "";
      const ergebnis = await anmelden(email, email.split("@")[0].replace(".", " "), "dev");
      if ("fehler" in ergebnis) return antwort.code(403).send(ergebnis);
      await sitzungAnlegen(antwort, ergebnis.id, "dev");
      return antwort.redirect("/");
    });
  }
}
