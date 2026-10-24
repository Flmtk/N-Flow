import type { FastifyInstance } from "fastify";
import webpush from "web-push";
import { sql } from "./db.js";
import { rechteLaden, type Rolle } from "./rechte.js";
import { brauche, type Benutzer } from "./sitzung.js";

/**
 * Push-Mitteilungen (Web Push). Funktioniert auf Android und auf dem iPhone,
 * sobald die App auf dem Home-Bildschirm liegt (iOS 16.4 oder neuer).
 * Die Schlüssel (VAPID) erzeugt der Server beim ersten Start selbst.
 */

export const ARTEN = {
  termine: "Neue oder geänderte Termine",
  vorschau: "Am Vorabend: Tour für morgen",
  genehmigung: "Urlaub und Block genehmigt oder abgelehnt",
  system: "Wartung und Updates von N-Flow",
  stoerung: "Neue Störmeldung über QR-Aufkleber (Büro)",
  info: "Neue Infos vom Büro (Bereich Info)",
} as const;
export type Art = keyof typeof ARTEN;

type Daten = Record<string, unknown>;
let bereit: Promise<string> | null = null;

function schluessel(): Promise<string> {
  bereit ??= (async () => {
    const [z] = await sql<{ wert: { publicKey: string; privateKey: string } }[]>`select wert from einstellungen where schluessel = 'vapid'`;
    let k = z?.wert;
    if (!k) {
      k = webpush.generateVAPIDKeys();
      await sql`insert into einstellungen (schluessel, wert) values ('vapid', ${sql.json(k)}) on conflict do nothing`;
      const [neu] = await sql<{ wert: typeof k }[]>`select wert from einstellungen where schluessel = 'vapid'`;
      k = neu.wert;
    }
    webpush.setVapidDetails("mailto:service@novis-anlagentechnik.de", k.publicKey, k.privateKey);
    return k.publicKey;
  })();
  return bereit;
}

/** Schickt eine Mitteilung an alle Geräte der Personen, die diese Art nicht abgeschaltet haben. */
export async function senden(ids: string[], art: Art, titel: string, text: string, ziel = "/app/"): Promise<void> {
  const liste = [...new Set(ids.filter(Boolean))];
  if (!liste.length) return;
  try {
    await schluessel();
    // Eigene Geräte und Geräte, auf denen jemand gerade „für“ diese Person arbeitet
    const abos = await sql<{ endpoint: string; schluessel: { p256dh: string; auth: string }; fuer_name: string | null }[]>`
      select p.endpoint, p.schluessel,
        case when p.mitarbeiter_id in ${sql(liste)} then null else f.name end as fuer_name
      from push_abos p join mitarbeiter m on m.id = p.mitarbeiter_id left join mitarbeiter f on f.id = p.fuer
      where (p.mitarbeiter_id in ${sql(liste)} or p.fuer in ${sql(liste)}) and m.aktiv and not m.gesperrt
        and coalesce((m.mitteilungen->>${art})::boolean, true)`;
    await Promise.all(abos.map(async (a) => {
      const nutzlast = JSON.stringify({ titel: a.fuer_name ? `${titel} (für ${a.fuer_name})` : titel, text, ziel, art });
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: a.schluessel }, nutzlast, { TTL: 6 * 3600, urgency: art === "stoerung" || art === "termine" ? "high" : "normal" });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sql`delete from push_abos where endpoint = ${a.endpoint}`;
      }
    }));
  } catch (e) {
    console.error("Push fehlgeschlagen", e);
  }
}

async function mitRecht(recht: "planung"): Promise<string[]> {
  const matrix = await rechteLaden();
  const rollen = (Object.keys(matrix) as Rolle[]).filter((r) => matrix[r][recht]);
  const z = await sql<{ id: string }[]>`select id from mitarbeiter where aktiv and not gesperrt and rolle in ${sql(rollen)}`;
  return z.map((x) => x.id);
}
export const planerIds = () => mitRecht("planung");

const wochentag = (d: string) => new Date(d + "T12:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

async function ortVon(nv: unknown): Promise<string> {
  if (nv === "INTERN") return "intern";
  const [a] = await sql<{ ort: string }[]>`select daten->>'ort' as ort from daten where sammlung = 'anlagen' and id = ${String(nv)}`;
  return a?.ort ?? "";
}

/** Wird nach jedem Speichern aufgerufen und entscheidet, wer Bescheid bekommt. */
export async function nachSpeichern(s: string, id: string, alt: Daten | null, neu: Daten, b: Benutzer): Promise<void> {
  try {
    if (s === "auftraege") {
      const geaendert = !alt || alt.tech !== neu.tech || alt.date !== neu.date || alt.time !== neu.time;
      if (!geaendert) return;
      const beschr = async (d: Daten) => `${d.date ? wochentag(String(d.date)) + " " + (d.time ?? "") : ""} · ${d.art} · ${await ortVon(d.nv)}`;
      if (neu.tech && neu.tech !== b.id && neu.status === "geplant") {
        await senden([String(neu.tech)], "termine", alt?.tech === neu.tech ? "Termin geändert" : "Neuer Termin", await beschr(neu));
      }
      if (alt?.tech && alt.tech !== neu.tech && alt.tech !== b.id && alt.status === "geplant") {
        await senden([String(alt.tech)], "termine", "Termin abgegeben", `${await beschr(alt)} ist nicht mehr in deiner Tour (${id}).`);
      }
    } else if (s === "abwesenheiten" && alt && alt.status !== neu.status && neu.tech !== b.id && ["genehmigt", "abgelehnt"].includes(String(neu.status))) {
      const zeit = neu.von === neu.bis ? new Date(String(neu.von) + "T12:00").toLocaleDateString("de-DE") : `${new Date(String(neu.von) + "T12:00").toLocaleDateString("de-DE")} – ${new Date(String(neu.bis) + "T12:00").toLocaleDateString("de-DE")}`;
      await senden([String(neu.tech)], "genehmigung", `${neu.art} ${neu.status}`, `${zeit}${neu.zeit ? " · " + neu.zeit : ""}`);
    } else if (s === "einstellungen" && id === "allgemein") {
      const w = neu.wartung as { aktiv?: boolean; zeit?: string; datum?: string } | undefined;
      const wAlt = alt?.wartung as { aktiv?: boolean; datum?: string } | undefined;
      if (w?.aktiv && !(wAlt?.aktiv && wAlt.datum === w.datum)) {
        const alle = await sql<{ id: string }[]>`select id from mitarbeiter where aktiv and not gesperrt`;
        await senden(alle.map((x) => x.id), "system", `Wartung heute Nacht ${w.zeit ?? ""} Uhr`,
          "N-Flow wird aktualisiert und ist etwa eine Minute nicht erreichbar. Bitte offene Berichte vorher senden.");
      }
    }
  } catch (e) {
    console.error("Mitteilung nach Speichern fehlgeschlagen", e);
  }
}

/** Jeden Tag um 18 Uhr: Tour für morgen an jeden, der morgen Einsätze hat. */
export function vorschauPlanen(): void {
  let zuletzt = "";
  setInterval(async () => {
    const jetzt = new Date();
    const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    const heute = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    if (uhr !== "18:00" || zuletzt === heute) return;
    zuletzt = heute;
    const m = new Date(heute + "T12:00");
    m.setDate(m.getDate() + 1);
    const morgen = m.toISOString().slice(0, 10);
    const z = await sql<{ tech: string; anzahl: number; erster: string; nv: string }[]>`
      select daten->>'tech' as tech, count(*)::int as anzahl, min(daten->>'time') as erster,
        (array_agg(daten->>'nv' order by daten->>'time'))[1] as nv
      from daten where sammlung = 'auftraege' and not geloescht and daten->>'date' = ${morgen}
        and daten->>'status' = 'geplant' and daten->>'tech' is not null
      group by daten->>'tech'`;
    for (const x of z) {
      await senden([x.tech], "vorschau", `Morgen: ${x.anzahl} Einsatz${x.anzahl > 1 ? "e" : ""}`, `Erster um ${x.erster} Uhr in ${await ortVon(x.nv)}`);
    }
  }, 30_000);
}

export async function pushRouten(app: FastifyInstance): Promise<void> {
  app.get("/api/push/schluessel", { preHandler: brauche() }, async () => ({ schluessel: await schluessel() }));

  app.post<{ Body: { abo: { endpoint: string; keys: { p256dh: string; auth: string } }; geraet?: string; fuer?: string | null } }>(
    "/api/push/abo", { preHandler: brauche() }, async (anfrage, antwort) => {
      const a = anfrage.body?.abo;
      if (!a?.endpoint || !/^https:\/\//.test(a.endpoint) || !a.keys?.p256dh || !a.keys?.auth) return antwort.code(400).send({ fehler: "Ungültiges Abo." });
      // „Arbeiten für“ nur mit Recht Planung und nur für aktive Kollegen
      const b = anfrage.benutzer!;
      let fuer: string | null = null;
      const gewuenscht = String(anfrage.body.fuer ?? "");
      if (/^[0-9a-f-]{36}$/i.test(gewuenscht) && gewuenscht !== b.id && (await rechteLaden())[b.rolle].planung) {
        const [m] = await sql<{ id: string }[]>`select id from mitarbeiter where id = ${gewuenscht} and aktiv and not gesperrt`;
        fuer = m?.id ?? null;
      }
      await sql`
        insert into push_abos (endpoint, mitarbeiter_id, schluessel, geraet, fuer)
        values (${a.endpoint}, ${b.id}, ${sql.json(a.keys)}, ${String(anfrage.body.geraet ?? "").slice(0, 200)}, ${fuer})
        on conflict (endpoint) do update set mitarbeiter_id = excluded.mitarbeiter_id, schluessel = excluded.schluessel, fuer = excluded.fuer`;
      return { ok: true };
    });

  app.delete<{ Body: { endpoint: string } }>("/api/push/abo", { preHandler: brauche() }, async (anfrage) => {
    await sql`delete from push_abos where endpoint = ${anfrage.body?.endpoint ?? ""} and mitarbeiter_id = ${anfrage.benutzer!.id}`;
    return { ok: true };
  });

  app.get("/api/ich/mitteilungen", { preHandler: brauche() }, async (anfrage) => {
    const [m] = await sql<{ mitteilungen: Record<string, boolean>; geraete: number }[]>`
      select mitteilungen, (select count(*)::int from push_abos where mitarbeiter_id = m.id) as geraete from mitarbeiter m where id = ${anfrage.benutzer!.id}`;
    return { arten: ARTEN, einstellung: m.mitteilungen, geraete: m.geraete };
  });

  app.put<{ Body: Record<string, boolean> }>("/api/ich/mitteilungen", { preHandler: brauche() }, async (anfrage) => {
    const sauber: Record<string, boolean> = {};
    for (const k of Object.keys(ARTEN)) if (typeof anfrage.body?.[k] === "boolean") sauber[k] = anfrage.body[k];
    await sql`update mitarbeiter set mitteilungen = mitteilungen || ${sql.json(sauber)} where id = ${anfrage.benutzer!.id}`;
    return { ok: true };
  });

  app.post("/api/push/test", { preHandler: brauche() }, async (anfrage) => {
    const b = anfrage.benutzer!;
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from push_abos where mitarbeiter_id = ${b.id}`;
    const abos = await sql<{ endpoint: string; schluessel: { p256dh: string; auth: string } }[]>`select endpoint, schluessel from push_abos where mitarbeiter_id = ${b.id}`;
    await schluessel();
    let ok = 0;
    for (const a of abos) {
      try { await webpush.sendNotification({ endpoint: a.endpoint, keys: a.schluessel }, JSON.stringify({ titel: "Test erfolgreich", text: "Mitteilungen funktionieren auf diesem Handy.", ziel: "/app/" })); ok++; }
      catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await sql`delete from push_abos where endpoint = ${a.endpoint}`; }
    }
    return { geraete: n.n, gesendet: ok };
  });
}
