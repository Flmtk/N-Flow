import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { sql } from "./db.js";
import { darf, type Recht, type Rolle } from "./rechte.js";
import { DRUCK_BENUTZER, DRUCK_COOKIE, druckSchluessel } from "./druck.js";

export const SITZUNGS_COOKIE = "nflow_sitzung";

export interface Benutzer {
  id: string;
  name: string;
  email: string;
  kuerzel: string;
  rolle: Rolle;
}

declare module "fastify" {
  interface FastifyRequest {
    benutzer?: Benutzer;
  }
}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function sitzungAnlegen(
  antwort: FastifyReply,
  mitarbeiterId: string,
  geraet: string,
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tage = config.sitzungTage;
  await sql`
    insert into sitzungen (token_hash, mitarbeiter_id, laeuft_ab, geraet)
    values (${hash(token)}, ${mitarbeiterId}, now() + ${tage + " days"}::interval, ${geraet.slice(0, 200)})`;
  await sql`update mitarbeiter set letzte_anmeldung = now() where id = ${mitarbeiterId}`;
  antwort.setCookie(SITZUNGS_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: config.produktion,
    sameSite: "lax",
    maxAge: tage * 24 * 3600,
  });
}

export async function sitzungBeenden(anfrage: FastifyRequest, antwort: FastifyReply): Promise<void> {
  const token = anfrage.cookies[SITZUNGS_COOKIE];
  if (token) await sql`delete from sitzungen where token_hash = ${hash(token)}`;
  antwort.clearCookie(SITZUNGS_COOKIE, { path: "/" });
}

/** Liest den angemeldeten Benutzer aus dem Cookie. Gesperrte oder ausgetretene Personen fliegen raus. */
export async function benutzerLaden(anfrage: FastifyRequest, antwort: FastifyReply): Promise<void> {
  // Interner PDF-Browser (druck.ts): nur vom Server selbst und nur lesend
  const druck = anfrage.cookies[DRUCK_COOKIE];
  if (druck) {
    if (druck !== druckSchluessel || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(anfrage.ip)) return;
    if (anfrage.method !== "GET" && anfrage.method !== "HEAD") {
      return antwort.code(403).send({ fehler: "Der Druckmodus darf nichts ändern." });
    }
    anfrage.benutzer = { ...DRUCK_BENUTZER };
    return;
  }
  const token = anfrage.cookies[SITZUNGS_COOKIE];
  if (!token) return;
  const [z] = await sql<Benutzer[]>`
    select m.id, m.name, m.email, m.kuerzel, m.rolle
    from sitzungen s join mitarbeiter m on m.id = s.mitarbeiter_id
    where s.token_hash = ${hash(token)} and s.laeuft_ab > now()
      and m.aktiv and not m.gesperrt`;
  if (z) anfrage.benutzer = z;
}

/** Vorab-Prüfung für Routen: angemeldet und – optional – mit einem bestimmten Recht. */
export function brauche(recht?: Recht) {
  return async (anfrage: FastifyRequest, antwort: FastifyReply) => {
    if (!anfrage.benutzer) {
      return antwort.code(401).send({ fehler: "Bitte anmelden." });
    }
    if (recht && !(await darf(anfrage.benutzer.rolle, recht))) {
      return antwort.code(403).send({ fehler: "Dafür fehlt die Berechtigung." });
    }
  };
}
