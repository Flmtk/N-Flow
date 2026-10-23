import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { sql } from "../db.js";
import { brauche } from "../sitzung.js";

/**
 * Kalenderabo (webcal) für iPhone und Outlook: Uhrzeit, Einsatzart, Anlagen-Nr., Adresse (Navigation,
 * auch in CarPlay) und in der Notiz Ansprechpartner und Telefon (Anruf per Siri-Kurzbefehl). Die Adresse enthält ein geheimes Token je Mitarbeiter.
 */

type Daten = Record<string, string | number | null>;

const ics = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const stempel = (datum: string, zeit: string) => datum.replace(/-/g, "") + "T" + zeit.replace(":", "") + "00";
function plusMinuten(zeit: string, min: number): string {
  const [h, m] = zeit.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + Math.round(min));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function tagDanach(datum: string): string {
  const d = new Date(datum + "T12:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Zeilen über 75 Byte nach RFC 5545 umbrechen (Folgezeile beginnt mit Leerzeichen) */
function falten(zeile: string): string {
  const teile: string[] = [];
  let akt = "", bytes = 0;
  for (const z of zeile) {
    const b = Buffer.byteLength(z);
    if (bytes + b > (teile.length ? 74 : 75)) { teile.push(akt); akt = ""; bytes = 0; }
    akt += z; bytes += b;
  }
  teile.push(akt);
  return teile.join("\r\n ");
}

/** Telefonnummer aus Freitext wie „Hr. Seibel (Hausmeister) 0171 445 22 10“ */
function nummerAus(text?: string | null): string | null {
  const m = String(text ?? "").match(/\+?\d[\d\s/()-]{4,}\d/);
  return m ? m[0].replace(/[\s/()-]/g, " ").replace(/\s+/g, " ").trim() : null;
}

/**
 * Notiz im Termin. Die erste Zeile „Anrufen: …“ ist die Nummer, die der iPhone-Kurzbefehl
 * „Ansprechpartner anrufen“ wählt: Ansprechpartner vor Ort, sonst Melder der Störung, sonst Kunde.
 */
function beschreibung(d: Daten, a?: { ansprech: string; zugang: string; tel: string; kunde: string }): string {
  const nr = nummerAus(a?.ansprech) ?? nummerAus(String(d.melder ?? "")) ?? nummerAus(a?.tel);
  return [
    nr ? `Anrufen: ${nr}` : "",
    a?.ansprech ? `Vor Ort: ${a.ansprech}` : "",
    d.melder ? `Gemeldet von: ${d.melder}` : "",
    a?.kunde ? `Kunde: ${a.kunde}${a.tel ? ", Tel. " + a.tel : ""}` : "",
    a?.zugang ? `Zugang: ${a.zugang}` : "",
    d.grund ? `Auftrag ${d.id}: ${d.grund}` : "",
  ].filter(Boolean).join("\n");
}

export async function kalenderRouten(app: FastifyInstance): Promise<void> {
  app.post("/api/ich/kalender", { preHandler: brauche("eigene") }, async (anfrage) => {
    const b = anfrage.benutzer!;
    let [m] = await sql<{ kalender_token: string | null }[]>`select kalender_token from mitarbeiter where id = ${b.id}`;
    if (!m.kalender_token) {
      const token = randomBytes(18).toString("base64url");
      await sql`update mitarbeiter set kalender_token = ${token} where id = ${b.id}`;
      m = { kalender_token: token };
    }
    const host = config.baseUrl.replace(/^https?:\/\//, "");
    return { adresse: `webcal://${host}/kal/${m.kalender_token}.ics` };
  });

  app.get<{ Params: { datei: string } }>("/kal/:datei", async (anfrage, antwort) => {
    const token = anfrage.params.datei.replace(/\.ics$/, "");
    const [m] = await sql<{ id: string; name: string }[]>`
      select id, name from mitarbeiter where kalender_token = ${token} and aktiv and not gesperrt`;
    if (!m) return antwort.code(404).send("Nicht gefunden");

    const ab = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const auftraege = await sql<{ d: Daten }[]>`
      select daten as d from daten where sammlung = 'auftraege' and not geloescht
        and daten->>'tech' = ${m.id} and daten->>'date' >= ${ab} and daten->>'status' <> 'storniert'`;
    const anlagen = new Map(
      (await sql<{ id: string; ort: string; str: string; plz: string; ansprech: string; zugang: string; tel: string; kunde: string }[]>`
        select a.id, a.daten->>'ort' as ort, a.daten->>'str' as str, a.daten->>'plz' as plz,
          a.daten->>'ansprech' as ansprech, a.daten->>'zugang' as zugang,
          k.daten->>'tel' as tel, concat_ws(', ', k.daten->>'name1', nullif(k.daten->>'name2', '')) as kunde
        from daten a left join daten k on k.sammlung = 'kunden' and k.id = a.daten->>'knr'
        where a.sammlung = 'anlagen'`)
        .map((a) => [a.id, a]),
    );
    const abw = await sql<{ d: Daten }[]>`
      select daten as d from daten where sammlung = 'abwesenheiten' and not geloescht
        and daten->>'tech' = ${m.id} and daten->>'bis' >= ${ab} and daten->>'status' <> 'abgelehnt'`;

    const z: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NOVIS Anlagentechnik//N-Flow//DE",
      `X-WR-CALNAME:${ics("N-Flow · " + m.name)}`, "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT30M"];
    const jetzt = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    for (const { d } of auftraege) {
      if (!d.date || !d.time) continue;
      const a = anlagen.get(String(d.nv));
      const ort = d.nv === "INTERN" ? "intern" : a?.ort ?? "";
      // Adresse als Ort: Apple Kalender und CarPlay bieten damit direkt die Navigation an
      const adresse = a ? [a.str, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
      z.push("BEGIN:VEVENT", `UID:${d.id}@n-flow`, `DTSTAMP:${jetzt}`,
        `DTSTART;TZID=Europe/Berlin:${stempel(String(d.date), String(d.time))}`,
        `DTEND;TZID=Europe/Berlin:${stempel(String(d.date), plusMinuten(String(d.time), Number(d.dauer || 1) * 60))}`,
        `SUMMARY:${ics(`${d.art} · ${d.nv === "INTERN" ? "intern" : d.nv} · ${ort}`)}`,
        ...(adresse ? [`LOCATION:${ics(adresse)}`] : []),
        `DESCRIPTION:${ics(beschreibung(d, a))}`,
        `URL:${config.baseUrl}/app/`, `STATUS:${d.status === "erledigt" ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT");
    }
    for (const { d } of abw) {
      const ganz = d.art === "Urlaub" || !d.zeit;
      z.push("BEGIN:VEVENT", `UID:${d.id}@n-flow`, `DTSTAMP:${jetzt}`);
      if (ganz) z.push(`DTSTART;VALUE=DATE:${String(d.von).replace(/-/g, "")}`, `DTEND;VALUE=DATE:${tagDanach(String(d.bis))}`);
      else {
        const [v, bis] = String(d.zeit).split("–");
        z.push(`DTSTART;TZID=Europe/Berlin:${stempel(String(d.von), v)}`, `DTEND;TZID=Europe/Berlin:${stempel(String(d.von), bis)}`);
      }
      z.push(`SUMMARY:${ics(`${d.art}${d.status === "offen" ? " (beantragt)" : ""}`)}`, "END:VEVENT");
    }
    z.push("END:VCALENDAR");
    return antwort.type("text/calendar; charset=utf-8").header("Cache-Control", "no-store").send(z.map(falten).join("\r\n") + "\r\n");
  });
}
