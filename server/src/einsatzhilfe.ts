import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { sql } from "./db.js";
import { mailSenden } from "./mail.js";
import { VON_INFO, esc, firmaLaden, mailHtml } from "./mailvorlage.js";
import { rechteLaden } from "./rechte.js";
import { brauche } from "./sitzung.js";

/**
 * Hilfen für den Monteur im Einsatz:
 * - Vorwerte: Nach jedem Bericht merkt sich die Anlage die letzte Messung (für den Vergleich beim nächsten Mal).
 * - Störungshilfe: Was war bei diesem Gerätetyp und dieser Störmeldung bisher die Ursache, welche Teile wurden getauscht?
 * - „Bin unterwegs“: SMS über seven.io (Absender NOVIS) oder, ohne Handynummer, E-Mail von info@.
 * - Messausdruck: Foto des Ausdrucks vom Abgasmessgerät per Texterkennung (tesseract) einlesen.
 */

type Daten = Record<string, unknown>;
type Zeile = Record<string, string>;

const leer = (v: unknown) => String(v ?? "").trim() === "";
const gefuellt = (z: Zeile) => Object.entries(z).some(([k, v]) => k !== "pkt" && k !== "azl" && !leer(v));

/* ---------- Vorwerte: letzte Messung an der Anlage merken ---------- */
export async function nachSpeichernWissen(s: string, _id: string, neu: Daten): Promise<void> {
  try {
    if (s !== "berichte" || !neu.nv) return;
    const d = (neu.daten ?? {}) as Daten, m = d.mess as Daten | undefined;
    if (!m || !m.typ) return;
    const zeilen = (seite: string) => (((m[seite] as Daten | undefined)?.rows ?? []) as Zeile[]).filter(gefuellt);
    const ver = zeilen("ver"), ang = zeilen("ang");
    if (!ver.length && !ang.length) return;
    const letzte = { datum: String(neu.datum ?? d.zd ?? ""), sb: String(neu.sb ?? ""), typ: String(m.typ), ang, ver };
    // Nur überschreiben, wenn dieser Bericht nicht älter ist als die gespeicherte Messung
    await sql`update daten set daten = jsonb_set(daten, '{letzteMessung}', ${sql.json(letzte as never)}),
      version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = 'N-Flow'
      where sammlung = 'anlagen' and not geloescht and daten->>'nv' = ${String(neu.nv)}
        and coalesce(daten->'letzteMessung'->>'datum', '') <= ${letzte.datum}`;
  } catch (e) {
    console.error("Vorwerte: Speichern fehlgeschlagen", e);
  }
}

/* ---------- Störungshilfe ---------- */
const codeNorm = (c: unknown) => String(c ?? "").toUpperCase().replace(/[\s\-_.:]/g, "");
const geraetVon = (a: Daten) => {
  const ger = String(a.ger ?? "").split(" ");
  return { hersteller: String(a.hersteller || ger[0] || "").trim(), typ: String(a.typ || ger.slice(1).join(" ") || "").trim() };
};
const gleich = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();

/* ---------- „Bin unterwegs“ ---------- */
/** Deutsche Handynummer (015x, 016x, 017x) in E.164, sonst null */
export function handynummer(nr: unknown): string | null {
  let t = String(nr ?? "").replace(/[^\d+]/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  if (t.startsWith("0")) t = "+49" + t.slice(1);
  return /^\+491[5-7]\d{7,10}$/.test(t) ? t : null;
}
const maske = (t: string) => t.length > 6 ? t.slice(0, 5) + " … " + t.slice(-3) : t;
function uhrzeitIn(minuten: number): string {
  const z = new Date(Date.now() + minuten * 60000);
  // auf 5 Minuten runden, das wirkt verlässlicher als eine krumme Zeit
  z.setMinutes(Math.round(z.getMinutes() / 5) * 5, 0, 0);
  return z.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

async function smsSenden(an: string, text: string): Promise<void> {
  const key = (process.env.SMS_API_KEY || "").trim();
  if (!key) throw new Error("SMS ist nicht eingerichtet.");
  const body = new URLSearchParams({ to: an, text, from: (process.env.SMS_ABSENDER || "NOVIS").trim().slice(0, 11) });
  const r = await fetch("https://gateway.seven.io/api/sms", {
    method: "POST", headers: { "X-Api-Key": key, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body,
    signal: AbortSignal.timeout(15000),
  });
  const j = (await r.json().catch(() => ({}))) as { success?: string };
  if (!r.ok || String(j.success) !== "100") throw new Error("SMS-Dienst meldet Fehler " + (j.success ?? r.status));
}

/* ---------- Messausdruck per Texterkennung ---------- */
function tesseract(bild: Buffer, sprache: string): Promise<string> {
  return new Promise((ok, nein) => {
    const p = spawn("tesseract", ["stdin", "stdout", "-l", sprache, "--psm", "6"], { stdio: ["pipe", "pipe", "pipe"] });
    let aus = "", fehler = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); nein(new Error("Texterkennung dauert zu lange")); }, 30000);
    p.stdout.on("data", (d) => (aus += d));
    p.stderr.on("data", (d) => (fehler += d));
    p.on("error", (e) => { clearTimeout(t); nein(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? ok(aus) : nein(new Error(fehler.trim() || "tesseract Fehler " + code)); });
    p.stdin.end(bild);
  });
}

/** Werte aus dem Ausdruck eines Abgasmessgeräts (testo, Wöhler, MRU …). Erkennt die üblichen Kürzel zeilenweise. */
export function messausdruckLesen(text: string): Record<string, string> {
  const w: Record<string, string> = {};
  const zahl = (s: string) => s.replace(",", ".");
  const muster: [string, RegExp][] = [
    ["co2", /\bC[O0]\s*[2₂z]\b[^\d\-]{0,14}(\d{1,2}[.,]\d{1,2})/i],
    ["o2", /(?<![CN])\b[O0]\s*[2₂z]\b[^\d\-]{0,14}(\d{1,2}[.,]\d{1,2})/i],
    ["nox", /\bN[O0]\s*x\b[^\d\-]{0,14}(\d{1,4})/i],
    ["co", /\bC[O0](?:\s*unv(?:erd)?\.?)?(?!\s*[2₂z])\b[^\d\-]{0,14}(\d{1,5})\s*(?:ppm)?/i],
    ["ta", /(?:Abgas\s*temp\.?|Abgastemperatur|\bAT\b|\bFT\b|T\s*Abg(?:as)?\.?)[^\d\-]{0,14}(\d{2,3}(?:[.,]\d)?)/i],
    ["tl", /(?:\bVT\b|\bLT\b|Verbr\.?\s*luft|Lufttemp\.?|Ansaug\w*|T\s*Luft|Raumtemp\.?)[^\d\-]{0,14}(-?\d{1,2}(?:[.,]\d)?)/i],
    ["qa", /\b[qg]\s*A\b[^\d\-]{0,14}(-?\d{1,2}[.,]\d{1,2})/i],
    ["lambda", /(?:Lambda|λ)[^\d]{0,10}(\d[.,]\d{1,3})/i],
    ["zug", /(?:\bZug\b|Draft)[^\d\-]{0,14}(-?\d{1,3}[.,]\d{1,3})/i],
  ];
  for (const zeile of text.split(/\r?\n/)) {
    for (const [k, re] of muster) {
      if (w[k]) continue;
      const m = zeile.match(re);
      if (m) w[k] = zahl(m[1]).replace(".", ",");
    }
  }
  // NO allein (ohne NOx) als NOx übernehmen, das zeigen viele Geräte so
  if (!w.nox) for (const zeile of text.split(/\r?\n/)) { const m = zeile.match(/\bN[O0]\b(?!\s*x)[^\d\-]{0,14}(\d{1,4})/i); if (m) { w.nox = m[1]; break; } }
  return w;
}


/** Typenschild: Hersteller, Typ, Seriennummer, Baujahr und Nennleistung aus dem erkannten Text herauslesen.
 *  Nur Vorschläge, der Monteur bestätigt jeden Wert. */
const HERSTELLER = ["Buderus", "Viessmann", "Vaillant", "Wolf", "Weishaupt", "Brötje", "Broetje", "Junkers", "Bosch", "Remeha", "Elco", "Hoval", "MHG",
  "De Dietrich", "Riello", "Giersch", "Rotex", "Intercal", "Windhager", "ÖkoFEN", "Hargassner", "Paradigma", "Ferroli", "Baxi", "Atlantic", "Stiebel Eltron", "Daikin"];
export function typenschildLesen(text: string): Record<string, string> {
  const w: Record<string, string> = {};
  const t = text.replace(/[|]/g, " ");
  const h = HERSTELLER.find((x) => new RegExp("\\b" + x.replace(/ö/i, "[oö]").replace(" ", "\\s*") + "\\b", "i").test(t));
  if (h) w.hersteller = h === "Broetje" ? "Brötje" : h;
  const zeilen = t.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  for (const z of zeilen) {
    if (!w.sernr) { const m = z.match(/(?:S\/N|SN|Ser(?:ien)?\.?[\s-]*(?:Nr|No|Nummer)\.?|Fabr(?:ik)?\.?[\s-]*Nr\.?|Herstell[\s-]*Nr\.?|Serial\s*(?:No|Number)?)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-\/ ]{4,24})/i); if (m) w.sernr = m[1].trim().replace(/\s+/g, ""); }
    if (!w.typ) { const m = z.match(/\b(?:Type|Typ|Modell|Model)\b\s*[:.]?\s*([A-Za-z0-9][\w\-\/., ]{2,30})/i); if (m) w.typ = m[1].trim(); }
    if (!w.baujahr) { const m = z.match(/(?:Baujahr|BJ|Herstell(?:ungs)?jahr|Year|Prod\.?)\s*[:.]?\s*((?:19|20)\d{2})/i); if (m) w.baujahr = m[1]; }
  }
  // Nennleistung: größter plausibler kW-Wert (bei Bereichen wie 4,7–25 kW der obere)
  const kw: number[] = [];
  for (const m of t.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:[-–]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*)?kW\b/gi)) {
    const x = Number((m[2] ?? m[1]).replace(",", ".")); if (x >= 3 && x <= 5000) kw.push(x);
  }
  if (kw.length) w.kw = String(Math.max(...kw)).replace(".", ",");
  if (!w.baujahr) { const m = t.match(/\b(19[89]\d|20[0-4]\d)\b/); if (m) w.baujahr = m[1]; }
  return w;
}

export async function einsatzhilfeRouten(app: FastifyInstance) {
  /* Störungshilfe: frühere Fälle mit gleicher Störmeldung bei gleichem Gerätetyp (bzw. Hersteller) */
  app.get<{ Querystring: { nv?: string; code?: string } }>("/api/einsatz/stoerungshilfe", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    const nv = String(anfrage.query.nv ?? ""), code = codeNorm(anfrage.query.code);
    if (!nv) return antwort.code(400).send({ fehler: "Anlage fehlt" });
    const anl = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'anlagen' and not geloescht`;
    const geraet = new Map(anl.map((z) => [String(z.d.nv), geraetVon(z.d)]));
    const ich = geraet.get(nv);
    if (!ich) return antwort.code(404).send({ fehler: "Anlage nicht gefunden" });
    const ber = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'berichte' and not geloescht
      and daten->>'art' in ('Störung', 'Reparatur', 'Wartung') order by daten->>'datum' desc limit 2000`;
    const faelle = ber.map((z) => {
      const d = (z.d.daten ?? {}) as Daten, g = geraet.get(String(z.d.nv));
      return { z: z.d, d, g, code: codeNorm(d.fehlercode) };
    }).filter((x) => x.g && x.code && gleich(x.g.hersteller, ich.hersteller) && (!code || x.code === code));
    // gleicher Typ zuerst, dann gleicher Hersteller
    faelle.sort((a, b) => Number(gleich(b.g!.typ, ich.typ)) - Number(gleich(a.g!.typ, ich.typ)) || String(b.z.datum).localeCompare(String(a.z.datum)));
    const teile = new Map<string, number>();
    for (const f of faelle) for (const p of ((f.d.material ?? []) as { bez?: string }[])) if (p.bez && !/pauschal|anfahrt|kleinmaterial/i.test(p.bez)) teile.set(p.bez, (teile.get(p.bez) ?? 0) + 1);
    return {
      geraet: ich, code: code || null, anzahl: faelle.length,
      teile: [...teile].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([bez, anzahl]) => ({ bez, anzahl })),
      faelle: faelle.slice(0, 8).map((f) => ({
        datum: f.z.datum, sb: f.z.sb, geraet: `${f.g!.hersteller} ${f.g!.typ}`.trim(), gleicherTyp: gleich(f.g!.typ, ich.typ), dieseAnlage: String(f.z.nv) === nv,
        code: String(f.d.fehlercode ?? ""), ursache: String(f.d.diagnose ?? ""), arbeiten: String(f.d.arbeiten ?? "").slice(0, 400),
        teile: ((f.d.material ?? []) as { bez?: string }[]).map((p) => p.bez).filter(Boolean),
      })),
    };
  });

  /* „Bin unterwegs“: Kunde per SMS oder E-Mail informieren und am Auftrag vermerken */
  app.post<{ Body: { auftrag?: string; minuten?: number } }>("/api/einsatz/unterwegs", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    const b = anfrage.benutzer!, id = String(anfrage.body?.auftrag ?? ""), minuten = Math.max(5, Math.min(240, Math.round(Number(anfrage.body?.minuten) || 20)));
    const [o] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'auftraege' and id = ${id} and not geloescht`;
    if (!o) return antwort.code(404).send({ fehler: "Auftrag nicht gefunden" });
    const rechte = (await rechteLaden())[b.rolle];
    if (String(o.d.tech ?? "") !== b.id && !rechte?.planung) return antwort.code(403).send({ fehler: "Das ist nicht dein Auftrag." });
    const [a] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'anlagen' and not geloescht and daten->>'nv' = ${String(o.d.nv ?? "")}`;
    const [k] = a ? await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'kunden' and not geloescht and (id = ${String(a.d.knr ?? "")} or daten->>'nr' = ${String(a.d.knr ?? "")})` : [];
    if (!a || !k) return antwort.code(404).send({ fehler: "Kunde zum Auftrag nicht gefunden" });
    if (k.d.benachrichtigen === false) return antwort.code(409).send({ fehler: "Der Kunde möchte nicht benachrichtigt werden (Kundenakte)." });
    const [m] = await sql<{ name: string }[]>`select name from mitarbeiter where id::text = ${String(o.d.tech ?? b.id)}`;
    const vorname = String(m?.name ?? b.name).split(" ")[0];
    const ankunft = uhrzeitIn(minuten), firma = await firmaLaden();
    const handy = handynummer(k.d.mobil) ?? handynummer(k.d.tel), mail = String(k.d.mail ?? "").trim();
    const smsText = `NOVIS Anlagentechnik: Ihr Techniker ${vorname} ist unterwegs und kommt voraussichtlich gegen ${ankunft} Uhr.${firma.tel ? " Rückfragen: " + firma.tel : ""}`;
    let kanal: "sms" | "mail" | null = null, an = "", grund = "";
    if (handy && process.env.SMS_API_KEY) {
      try { await smsSenden(handy, smsText); kanal = "sms"; an = maske(handy); } catch (e) { grund = (e as Error).message; }
    }
    if (!kanal && /@/.test(mail)) {
      const ort = [a.d.str, [a.d.plz, a.d.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const html = mailHtml({
        titel: "Ihr Techniker ist unterwegs", anrede: "Guten Tag,",
        absaetze: [`unser Techniker <b>${esc(vorname)}</b> ist auf dem Weg zu Ihnen.`],
        fakten: [["Voraussichtliche Ankunft", `gegen ${esc(ankunft)} Uhr`], ["Anlage", esc(`${a.d.nv} · ${ort}`)]],
        nachher: ["Bitte sorgen Sie dafür, dass der Heizraum zugänglich ist. Falls etwas dazwischenkommt, rufen Sie uns gern an."],
        absender: VON_INFO(), firma,
      });
      try { await mailSenden({ von: VON_INFO(), an: mail, betreff: `Ihr Techniker kommt gegen ${ankunft} Uhr`, html }); kanal = "mail"; an = mail; } catch (e) { grund = grund || (e as Error).message; }
    }
    if (!kanal) return antwort.code(422).send({ fehler: grund || (handy ? "SMS ist auf dem Server noch nicht eingerichtet und beim Kunden ist keine E-Mail hinterlegt." : "Beim Kunden ist weder eine Handynummer noch eine E-Mail hinterlegt.") });
    const vermerk = { zeit: new Date().toISOString(), ankunft, kanal, an, von: b.id };
    await sql`update daten set daten = jsonb_set(daten, '{unterwegs}', ${sql.json(vermerk as never)}),
      version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${b.name}
      where sammlung = 'auftraege' and id = ${id}`;
    return { ok: true, kanal, an, ankunft };
  });

  /* Messausdruck: Foto rein, erkannte Werte raus (der Monteur bestätigt vor der Übernahme) */
  app.register(async (bereich) => {
    bereich.addContentTypeParser(["image/jpeg", "image/png", "image/webp"], { parseAs: "buffer", bodyLimit: 12 * 1024 * 1024 }, (_a, body, fertig) => fertig(null, body));
    bereich.post("/api/einsatz/messausdruck", { preHandler: brauche("eigene"), bodyLimit: 12 * 1024 * 1024 }, async (anfrage, antwort) => {
      const bild = anfrage.body as Buffer;
      if (!Buffer.isBuffer(bild) || bild.length < 1000) return antwort.code(400).send({ fehler: "Kein Bild erhalten" });
      let text = "";
      try { text = await tesseract(bild, (process.env.OCR_SPRACHE || "deu+eng").trim()); }
      catch (e) {
        const msg = (e as Error).message;
        if (/ENOENT/.test(msg)) return antwort.code(501).send({ fehler: "Texterkennung ist auf dem Server nicht installiert." });
        try { text = await tesseract(bild, "eng"); } catch { return antwort.code(500).send({ fehler: "Texterkennung fehlgeschlagen: " + msg }); }
      }
      return { werte: messausdruckLesen(text), text: text.slice(0, 3000) };
    });
    bereich.post("/api/einsatz/typenschild", { preHandler: brauche("eigene"), bodyLimit: 12 * 1024 * 1024 }, async (anfrage, antwort) => {
      const bild = anfrage.body as Buffer;
      if (!Buffer.isBuffer(bild) || bild.length < 1000) return antwort.code(400).send({ fehler: "Kein Bild erhalten" });
      let text = "";
      try { text = await tesseract(bild, (process.env.OCR_SPRACHE || "deu+eng").trim()); }
      catch (e) {
        const msg = (e as Error).message;
        if (/ENOENT/.test(msg)) return antwort.code(501).send({ fehler: "Texterkennung ist auf dem Server nicht installiert." });
        try { text = await tesseract(bild, "eng"); } catch { return antwort.code(500).send({ fehler: "Texterkennung fehlgeschlagen: " + msg }); }
      }
      return { werte: typenschildLesen(text), text: text.slice(0, 3000) };
    });
  });
}
