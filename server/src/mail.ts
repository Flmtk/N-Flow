import type { FastifyInstance } from "fastify";
import { config, microsoftAktiv } from "./config.js";
import { sql } from "./db.js";
import { protokolliere } from "./protokoll.js";
import { brauche } from "./sitzung.js";
import { pdfErzeugen } from "./druck.js";

/**
 * E-Mail-Versand über Microsoft Graph aus dem Service-Postfach.
 * Voraussetzung in Entra: App „N-Flow“ → API-Berechtigungen → Microsoft Graph →
 * Anwendungsberechtigung „Mail.Send“ mit Administratorzustimmung (siehe docs/entra-app.md).
 */

type Daten = Record<string, unknown>;
const ABSENDER = () => (process.env.MAIL_ABSENDER || "service@novis-anlagentechnik.de").trim();

let token: { wert: string; bis: number } | null = null;
export async function graphToken(): Promise<string> {
  if (token && token.bis > Date.now() + 60_000) return token.wert;
  const r = await fetch(`https://login.microsoftonline.com/${config.microsoft.mandant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.microsoft.clientId, client_secret: config.microsoft.clientSecret,
      grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default",
    }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error("Microsoft-Anmeldung für den Mailversand fehlgeschlagen: " + (j.error_description ?? r.status));
  token = { wert: j.access_token, bis: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.wert;
}

interface Anhang { name: string; typ: string; inhalt: string | Buffer }
export async function mailSenden(an: string, betreff: string, text: string, anhaenge: Anhang[] = []): Promise<void> {
  if (!microsoftAktiv) throw new Error("Microsoft ist nicht eingerichtet.");
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ABSENDER())}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${await graphToken()}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: betreff,
        body: { contentType: "Text", content: text },
        toRecipients: [{ emailAddress: { address: an } }],
        attachments: anhaenge.map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment", name: a.name, contentType: a.typ,
          contentBytes: (typeof a.inhalt === "string" ? Buffer.from(a.inhalt, "utf8") : a.inhalt).toString("base64"),
        })),
      },
      saveToSentItems: true,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 403) throw new Error("Microsoft erlaubt den Versand noch nicht. In Entra fehlt die Anwendungsberechtigung „Mail.Send“ mit Administratorzustimmung.");
    if (r.status === 404) throw new Error(`Das Postfach ${ABSENDER()} gibt es in Microsoft 365 nicht.`);
    throw new Error(`Versand fehlgeschlagen (${r.status}): ${t.slice(0, 200)}`);
  }
}

const ARTTEXT: Record<string, string> = {
  Wartung: "die Wartung Ihrer Heizungsanlage", Störung: "die Behebung der Störung an Ihrer Heizungsanlage",
  Reparatur: "die Reparatur an Ihrer Heizungsanlage", Folgeauftrag: "die vereinbarten Arbeiten an Ihrer Heizungsanlage",
  Inbetriebnahme: "die Inbetriebnahme Ihrer neuen Heizungsanlage", Umbau: "die vereinbarten Arbeiten an Ihrer Heizungsanlage",
};
function anredeFuer(kd: Daten): string {
  const name1 = String(kd.name1 ?? ""), name2 = String(kd.name2 ?? "");
  const firma = /gmbh|e\.v\.|eg\b|ag\b|kg\b|gbr|praxis|gemeinde|stadt|verwaltung|bäckerei|metzgerei|autohaus|wohnungsbau|kita/i.test(name1);
  return name2 && !firma ? (/ und /.test(name2) ? `Sehr geehrte Familie ${name1},` : `Guten Tag ${name2} ${name1},`) : "Sehr geehrte Damen und Herren,";
}
const zeitPlus = (t: string, min: number) => { const [h, m] = t.split(":").map(Number); const x = h * 60 + m + min; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const icsText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Text und Kalendereinladung der Terminbestätigung (wie im Büro als Vorschau) */
export async function terminbestaetigung(auftragId: string) {
  const [o] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'auftraege' and id = ${auftragId} and not geloescht`;
  if (!o) throw new Error("Auftrag nicht gefunden.");
  const d = o.d;
  if (!d.date || !d.time) throw new Error("Der Auftrag hat noch keinen Termin.");
  const [a] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'anlagen' and id = ${String(d.nv)}`;
  if (!a) throw new Error("Anlage nicht gefunden.");
  const [k] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'kunden' and id = ${String(a.d.knr ?? "")}`;
  const kd = k?.d ?? {};
  const [t] = await sql<{ name: string }[]>`select name from mitarbeiter where id::text = ${String(d.tech ?? "")}`;
  const [allg] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'einstellungen' and id = 'allgemein'`;
  const tel = ((allg?.d?.firma ?? {}) as Record<string, string>).tel || "";

  const name1 = String(kd.name1 ?? ""), name2 = String(kd.name2 ?? "");
  const firma = /gmbh|e\.v\.|eg\b|ag\b|kg\b|gbr|praxis|gemeinde|stadt|verwaltung|bäckerei|metzgerei|autohaus|wohnungsbau|kita/i.test(name1);
  const anrede = name2 && !firma ? (/ und /.test(name2) ? `Sehr geehrte Familie ${name1},` : `Guten Tag ${name2} ${name1},`) : "Sehr geehrte Damen und Herren,";
  const datum = new Date(String(d.date) + "T12:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const bis = zeitPlus(String(d.time), 60);
  const geraet = [a.d.hersteller, a.d.typ].filter(Boolean).join(" ") || String(a.d.ger ?? "");
  const adresse = `${a.d.str}, ${a.d.plz} ${a.d.ort}`;
  const betreff = `Terminbestätigung – ${d.art} am ${new Date(String(d.date) + "T12:00").toLocaleDateString("de-DE")}`;
  const text = `${anrede}

vielen Dank für Ihr Vertrauen. Gerne bestätigen wir Ihnen den Termin für ${ARTTEXT[String(d.art)] ?? "den Einsatz an Ihrer Heizungsanlage"}:

Datum: ${datum}
Ankunft unseres Technikers: zwischen ${d.time} und ${bis} Uhr
Techniker: ${t?.name ?? "wird noch festgelegt"}
Anlage: ${geraet}
Adresse: ${adresse}

Wir bitten Sie, den Zugang zum Heizraum zu ermöglichen. Sollte der Termin für Sie nicht passen, geben Sie uns bitte kurz Bescheid. Wir finden gemeinsam gern einen neuen Termin.

Über die angehängte Kalendereinladung können Sie den Termin direkt in Ihren Kalender übernehmen.

Mit freundlichen Grüßen
Ihr Service-Team der NOVIS Anlagentechnik

—
NOVIS Anlagentechnik GmbH i. G.
Bornweg 34a · 63599 Biebergemünd
Telefon: ${tel || "Service-Hotline (Nummer folgt)"}
E-Mail: ${ABSENDER()}
www.novis-anlagentechnik.de`;
  const dt = String(d.date).replace(/-/g, ""), st = String(d.time).replace(":", "") + "00", en = bis.replace(":", "") + "00";
  const stempel = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NOVIS Anlagentechnik//N-Flow//DE", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${d.id}@novis-anlagentechnik.de`, `DTSTAMP:${stempel}`, `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
    `DTSTART;TZID=Europe/Berlin:${dt}T${st}`, `DTEND;TZID=Europe/Berlin:${dt}T${en}`,
    `SUMMARY:${icsText(`NOVIS Techniker-Besuch: ${d.art}`)}`, `LOCATION:${icsText(adresse)}`,
    `DESCRIPTION:${icsText(`Ankunft unseres Technikers zwischen ${d.time} und ${bis} Uhr. Techniker: ${t?.name ?? "folgt"}. Anlage: ${geraet}. Fragen: ${ABSENDER()}${tel ? ", " + tel : ""}`)}`,
    `ORGANIZER;CN=NOVIS Service:mailto:${ABSENDER()}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${icsText("Morgen: NOVIS " + d.art)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n") + "\r\n";
  return { betreff, text, ics, an: String(kd.mail ?? ""), auftrag: d };
}

export async function mailRouten(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { auftrag: string; an?: string } }>("/api/mail/terminbestaetigung", { preHandler: brauche("planung") }, async (anfrage, antwort) => {
    try {
      const m = await terminbestaetigung(String(anfrage.body?.auftrag ?? ""));
      const test = Boolean(anfrage.body?.an);
      const an = (anfrage.body?.an || m.an).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(an)) return antwort.code(400).send({ fehler: "Beim Kunden ist keine gültige E-Mail-Adresse hinterlegt." });
      await mailSenden(an, (test ? "[Test] " : "") + m.betreff, m.text, [{ name: "Termin.ics", typ: "text/calendar", inhalt: m.ics }]);
      if (!test) {
        await sql`update daten set daten = daten || ${sql.json({ bestaetigt: new Date().toISOString(), bestaetigtAn: an })},
          version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${anfrage.benutzer!.name}
          where sammlung = 'auftraege' and id = ${String(m.auftrag.id)}`;
      }
      await protokolliere(anfrage.benutzer!.name, test ? "Testmail gesendet" : "Terminbestätigung gesendet", `${m.auftrag.id} an ${an}`);
      return { ok: true, an };
    } catch (e) {
      return antwort.code(502).send({ fehler: (e as Error).message });
    }
  });
  /** Rechnung als PDF (mit Servicebericht als Anlage) an den Kunden */
  app.post<{ Body: { re: string; an?: string } }>("/api/mail/rechnung", { preHandler: brauche("rechnungen") }, async (anfrage, antwort) => {
    try {
      const re = String(anfrage.body?.re ?? "");
      const [z] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'rechnungen' and id = ${re} and not geloescht`;
      if (!z) return antwort.code(404).send({ fehler: "Rechnung nicht gefunden." });
      const r = z.d;
      const [a] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'anlagen' and id = ${String(r.nv ?? "")}`;
      const [k] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'kunden' and id = ${String(a?.d.knr ?? "")}`;
      const kd = k?.d ?? {};
      const test = Boolean(anfrage.body?.an);
      const an = (anfrage.body?.an || String(kd.mail ?? "")).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(an)) return antwort.code(400).send({ fehler: "Beim Kunden ist keine gültige E-Mail-Adresse hinterlegt." });
      // Microsoft nimmt Mails bis etwa 3 MB an; bei vielen Fotos ohne Fotoseite senden
      let pdf = await pdfErzeugen("rechnung", re);
      if (pdf.length > 2.8 * 1024 * 1024) pdf = await pdfErzeugen("rechnung", re, { ohneFotos: true });
      const fmt = (d: unknown) => new Date(String(d) + "T12:00").toLocaleDateString("de-DE");
      const faellig = new Date(String(r.datum) + "T12:00"); faellig.setDate(faellig.getDate() + 14);
      const betrag = Number(r.brutto ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
      const [allg] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'einstellungen' and id = 'allgemein'`;
      const tel = ((allg?.d?.firma ?? {}) as Record<string, string>).tel || "";
      const text = `${anredeFuer(kd)}

vielen Dank für Ihren Auftrag. Anbei erhalten Sie unsere Rechnung ${re} vom ${fmt(r.datum)} über ${betrag} für die Arbeiten an Ihrer Heizungsanlage am ${fmt(r.leist)}. Der Servicebericht ${r.sb ?? ""} mit Messblatt ist der Rechnung als Anlage beigefügt.

Bitte überweisen Sie den Betrag bis zum ${faellig.toLocaleDateString("de-DE")} unter Angabe der Rechnungsnummer.

Bei Fragen sind wir gern für Sie da.

Mit freundlichen Grüßen
Ihr Service-Team der NOVIS Anlagentechnik

—
NOVIS Anlagentechnik GmbH i. G.
Bornweg 34a · 63599 Biebergemünd
Telefon: ${tel || "Service-Hotline (Nummer folgt)"}
E-Mail: ${ABSENDER()}
www.novis-anlagentechnik.de`;
      await mailSenden(an, `${test ? "[Test] " : ""}Rechnung ${re} – NOVIS Anlagentechnik`, text, [{ name: `${re}.pdf`, typ: "application/pdf", inhalt: pdf }]);
      if (!test) {
        await sql`update daten set daten = daten || ${sql.json({ versendet: new Date().toISOString(), versendetAn: an })},
          version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${anfrage.benutzer!.name}
          where sammlung = 'rechnungen' and id = ${re}`;
      }
      await protokolliere(anfrage.benutzer!.name, test ? "Testmail Rechnung" : "Rechnung versendet", `${re} an ${an}`);
      return { ok: true, an };
    } catch (e) {
      return antwort.code(502).send({ fehler: (e as Error).message });
    }
  });
  /** Mahnung als PDF (dazu die Rechnung ohne Fotoseite) an den Kunden */
  app.post<{ Body: { id: string; an?: string } }>("/api/mail/mahnung", { preHandler: brauche("rechnungen") }, async (anfrage, antwort) => {
    try {
      const id = String(anfrage.body?.id ?? "");
      const [z] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'mahnungen' and id = ${id} and not geloescht`;
      if (!z) return antwort.code(404).send({ fehler: "Mahnung nicht gefunden." });
      const m = z.d;
      const [a] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'anlagen' and id = ${String(m.nv ?? "")}`;
      const [k] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'kunden' and id = ${String(a?.d.knr ?? "")}`;
      const kd = k?.d ?? {};
      const test = Boolean(anfrage.body?.an);
      const an = (anfrage.body?.an || String(kd.mail ?? "")).trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(an)) return antwort.code(400).send({ fehler: "Beim Kunden ist keine gültige E-Mail-Adresse hinterlegt." });
      const pdf = await pdfErzeugen("mahnung", id);
      const re = String(m.re);
      const rechnung = await pdfErzeugen("rechnung", re, { ohneFotos: true });
      const fmt = (d: unknown) => new Date(String(d) + "T12:00").toLocaleDateString("de-DE");
      const betrag = Number(m.offen ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
      const [allg] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'einstellungen' and id = 'allgemein'`;
      const tel = ((allg?.d?.firma ?? {}) as Record<string, string>).tel || "";
      const text = `${anredeFuer(kd)}

anbei erhalten Sie unsere ${m.name} zur Rechnung ${re}. Der offene Betrag von ${betrag} ist bis zum ${fmt(m.frist)} fällig. Die Rechnung liegt zur Übersicht noch einmal bei.

Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos. Bei Fragen sind wir gern für Sie da.

Mit freundlichen Grüßen
Ihr Service-Team der NOVIS Anlagentechnik

—
NOVIS Anlagentechnik GmbH i. G.
Bornweg 34a · 63599 Biebergemünd
Telefon: ${tel || "Service-Hotline (Nummer folgt)"}
E-Mail: ${ABSENDER()}
www.novis-anlagentechnik.de`;
      await mailSenden(an, `${test ? "[Test] " : ""}${m.name} zur Rechnung ${re} – NOVIS Anlagentechnik`, text,
        [{ name: `${re} ${m.name}.pdf`, typ: "application/pdf", inhalt: pdf }, { name: `${re}.pdf`, typ: "application/pdf", inhalt: rechnung }]);
      if (!test) {
        await sql`update daten set daten = daten || ${sql.json({ versendet: new Date().toISOString(), versendetAn: an })},
          version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${anfrage.benutzer!.name}
          where sammlung = 'mahnungen' and id = ${id}`;
      }
      await protokolliere(anfrage.benutzer!.name, test ? "Testmail Mahnung" : "Mahnung versendet", `${id} an ${an}`);
      return { ok: true, an };
    } catch (e) {
      return antwort.code(502).send({ fehler: (e as Error).message });
    }
  });
}
