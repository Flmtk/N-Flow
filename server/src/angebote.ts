import type { FastifyInstance } from "fastify";
import { config } from "./config.js";
import { sql } from "./db.js";
import { nummernZiehen } from "./routes/daten.js";
import { vormerken } from "./ablage.js";
import { pdfErzeugen } from "./druck.js";
import { mailSenden } from "./mail.js";
import { VON_INFO, VON_RECHNUNG, esc, firmaLaden, mailHtml } from "./mailvorlage.js";
import { protokolliere } from "./protokoll.js";
import { senden as pushSenden } from "./push.js";
import { rechteLaden, type Rolle } from "./rechte.js";
import { brauche, type Benutzer } from "./sitzung.js";

/**
 * Angebote der Geschäftsführung (Kalkulation).
 * Ablauf: Entwurf → Zur Freigabe → Freigegeben → Versendet (→ Angenommen / Abgelehnt).
 * Freigabe immer im Vier-Augen-Prinzip: wer ein Angebot erstellt oder zuletzt eingereicht hat, kann es nicht freigeben.
 * Nach der Freigabe: PDF erzeugen, in SharePoint ablegen (Warteschlange) und Mail von info@ an rechnung@ mit dem PDF.
 * Den Status ändern nur diese Routen; über /api/daten lässt er sich nicht setzen (siehe pruefe in daten.ts).
 */

type Daten = Record<string, unknown>;
export const ANGEBOT_GESCHUETZT = ["status", "erstellt", "eingereicht", "freigabe", "versendet", "ergebnis", "rev", "verlauf", "versand", "vertraege"] as const;

const jetzt = () => new Date().toISOString();
const wer = (b: Benutzer) => ({ von: b.id, name: b.name, zeit: jetzt() });
const eur = (x: number) => x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const datum = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

async function laden(id: string): Promise<Daten | null> {
  const [z] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'angebote' and id = ${id} and not geloescht`;
  return z?.d ?? null;
}
/** Ändert Felder eines Angebots und hängt einen Eintrag an den Verlauf */
async function aendern(id: string, teil: Daten, b: Benutzer, schritt: string): Promise<Daten> {
  const alt = (await laden(id))!;
  const verlauf = [...((alt.verlauf ?? []) as Daten[]), { schritt, ...wer(b) }];
  const [z] = await sql<{ d: Daten }[]>`update daten set daten = daten || ${sql.json({ ...teil, verlauf } as never)},
    version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${b.name}
    where sammlung = 'angebote' and id = ${id} returning daten as d`;
  return z.d;
}

/** Summen wie im Büro (Positionen + Nebenkosten), für Mail und Liste */
export function angebotSummen(a: Daten): { netto: number; brutto: number } {
  const zeilen = [...((a.positionen ?? []) as { menge?: number; ep?: number }[]), ...((a.neben ?? []) as { menge?: number; ep?: number }[])];
  const netto = zeilen.reduce((s, p) => s + Number(p.menge ?? 0) * Number(p.ep ?? 0), 0);
  const mwst = Number(a.mwst ?? 19);
  return { netto, brutto: netto * (1 + mwst / 100) };
}

async function geschaeftsfuehrung(ohne: string): Promise<string[]> {
  const m = await rechteLaden();
  const rollen = (Object.keys(m) as Rolle[]).filter((r) => m[r].kalkulation);
  const z = await sql<{ id: string }[]>`select id from mitarbeiter where aktiv and not gesperrt and rolle in ${sql(rollen)} and id::text <> ${ohne}`;
  return z.map((x) => x.id);
}

/** Nach der Freigabe: PDF, Mail an rechnung@, SharePoint. Gibt zurück, was geklappt hat. */
async function versandVorbereiten(id: string, a: Daten): Promise<{ mail: boolean; fehler?: string }> {
  await vormerken("angebot", id, 5);
  try {
    const pdf = await pdfErzeugen("angebot", id);
    const { netto, brutto } = angebotSummen(a);
    const k = (a.kunde ?? {}) as Daten;
    const gueltig = a.gueltigBis ? datum(String(a.gueltigBis)) : "–";
    const ablage = a.interessent ? "Angebote › Interessenten" : `Kunden › ${String(k.name ?? "")} › Angebote`;
    const basis = config.baseUrl;
    const html = mailHtml({
      titel: `Angebot ${id} bitte versenden`, anrede: "Hallo zusammen,",
      absaetze: ["das Angebot ist im Vier-Augen-Prinzip freigegeben. Bitte an den Kunden schicken und danach in N-Flow als versendet markieren."],
      fakten: [
        ["Kunde", esc(k.name ?? "") + (a.interessent ? " (Interessent)" : "")],
        ["Empfänger", esc([k.ansprech, k.mail].filter(Boolean).join(" · ") || "–")],
        ["Betreff", esc(a.betreff ?? "")],
        ["Summe", `${esc(eur(netto))} netto · ${esc(eur(brutto))} brutto`],
        ["Gültig bis", esc(gueltig)],
        ["Erstellt / Freigegeben", esc(`${(a.erstellt as Daten | undefined)?.name ?? "–"} / ${(a.freigabe as Daten | undefined)?.name ?? "–"}`)],
        ["Ablage SharePoint", esc(ablage)],
      ],
      nachher: basis ? [`<a href="${esc(basis)}/buero/#angebot=${encodeURIComponent(id)}" style="color:#C2510B">In N-Flow öffnen und als versendet markieren</a>`] : [],
      gruss: "N-Flow", absender: VON_INFO(), firma: await firmaLaden(), intern: true,
    });
    const rev = Number(a.rev ?? 1);
    await mailSenden({
      von: VON_INFO(), an: VON_RECHNUNG(), betreff: `Angebot ${id}${rev > 1 ? " Rev. " + rev : ""} bitte versenden – ${String(k.name ?? "")}`, html,
      anhaenge: [{ name: `${id}${rev > 1 ? "-Rev" + rev : ""}.pdf`, typ: "application/pdf", inhalt: pdf }],
    });
    return { mail: true };
  } catch (e) {
    return { mail: false, fehler: (e as Error).message };
  }
}


/** Angenommenes Angebot mit Wartungspauschalen (aus einer Anlagenaufnahme): Vertrag an den Anlagen eintragen,
 *  Interessent wird Kunde. Die Pauschale aus dem Angebot gilt als vertragliche Pauschale. */
async function wartungsvertraege(id: string, a: Daten, b: Benutzer): Promise<{ nv: string; vertrag: string; pausch: number }[]> {
  const pos = ((a.positionen ?? []) as Daten[]).filter((p) => p.typ === "k01" && p.nv);
  const aus: { nv: string; vertrag: string; pausch: number }[] = [];
  for (const p of pos) {
    const nv = String(p.nv);
    const [z] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'anlagen' and id = ${nv} and not geloescht`;
    if (!z) continue;
    const anl = z.d, auf = (anl.aufnahme ?? {}) as Daten;
    const vertrag = anl.vertrag && anl.vertrag !== "Nr. folgt" ? String(anl.vertrag) : (await nummernZiehen("W", 1))[0];
    const pausch = Math.round(Number(p.ep ?? 0) * 100) / 100;
    const teil: Daten = { vertrag, pausch, zyk: Number(anl.zyk ?? 12) || 12, betreuer: anl.betreuer ?? auf.von ?? null,
      aufnahme: { ...auf, status: "vertrag", angebot: id, vertragAb: jetzt().slice(0, 10) } };
    await sql`update daten set daten = daten || ${sql.json(teil as never)}, version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${b.name}
      where sammlung = 'anlagen' and id = ${nv}`;
    if (anl.knr) await sql`update daten set daten = daten || ${sql.json({ interessent: false } as never)}, version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${b.name}
      where sammlung = 'kunden' and id = ${String(anl.knr)} and (daten->>'interessent')::boolean is true`;
    await protokolliere(b.name, "Wartungsvertrag angelegt", `${vertrag} · Anlage ${nv} · ${eur(pausch)} netto aus Angebot ${id}`);
    aus.push({ nv, vertrag, pausch });
  }
  return aus;
}

export async function angebotRouten(app: FastifyInstance) {
  const route = (pfad: string, f: (b: Benutzer, id: string, a: Daten, body: Daten) => Promise<unknown>) =>
    app.post<{ Params: { id: string }; Body: Daten }>(`/api/angebote/:id/${pfad}`, { preHandler: brauche("kalkulation") }, async (anfrage, antwort) => {
      const id = anfrage.params.id, a = await laden(id);
      if (!a) return antwort.code(404).send({ fehler: "Angebot nicht gefunden." });
      try { return await f(anfrage.benutzer!, id, a, anfrage.body ?? {}); }
      catch (e) { const x = e as Error & { code?: number }; return antwort.code(x.code ?? 400).send({ fehler: x.message }); }
    });
  const nein = (text: string, code = 409) => Object.assign(new Error(text), { code });

  route("einreichen", async (b, id, a) => {
    if (a.status !== "entwurf") throw nein("Nur Entwürfe können eingereicht werden.");
    if (!((a.positionen ?? []) as unknown[]).length) throw nein("Das Angebot hat noch keine Positionen.", 400);
    const d = await aendern(id, { status: "pruef", eingereicht: wer(b) }, b, "Zur Freigabe eingereicht");
    await protokolliere(b.name, "Angebot zur Freigabe eingereicht", id);
    void pushSenden(await geschaeftsfuehrung(b.id), "freigabe", `Angebot ${id} zur Freigabe`, `${b.name}: ${String(a.betreff ?? "")}`, `/buero/#angebot=${encodeURIComponent(id)}`);
    return d;
  });

  route("zurueck", async (b, id, a, body) => {
    if (a.status !== "pruef") throw nein("Das Angebot liegt nicht zur Freigabe vor.");
    const anm = String(body.anmerkung ?? "").trim().slice(0, 1000);
    const d = await aendern(id, { status: "entwurf", anmerkung: anm ? { text: anm, ...wer(b) } : null }, b, anm ? "Zurückgegeben: " + anm : "Zurück in Bearbeitung");
    if (String((a.eingereicht as Daten | undefined)?.von ?? "") !== b.id)
      void pushSenden([String((a.eingereicht as Daten | undefined)?.von ?? "")], "freigabe", `Angebot ${id} zurückgegeben`, anm || "Bitte noch einmal ansehen.", `/buero/#angebot=${encodeURIComponent(id)}`);
    return d;
  });

  route("freigeben", async (b, id, a) => {
    if (a.status !== "pruef") throw nein("Das Angebot liegt nicht zur Freigabe vor.");
    const ersteller = String((a.erstellt as Daten | undefined)?.von ?? ""), einreicher = String((a.eingereicht as Daten | undefined)?.von ?? "");
    if (b.id === ersteller || b.id === einreicher) throw nein("Vier-Augen-Prinzip: Freigeben muss die andere Geschäftsführung.", 403);
    const tage = Number(a.gueltigTage ?? 30);
    const bis = new Date(Date.now() + tage * 86400000).toISOString().slice(0, 10);
    let d = await aendern(id, { status: "frei", freigabe: wer(b), gueltigBis: bis, datum: jetzt().slice(0, 10), anmerkung: null }, b, "Freigegeben");
    await protokolliere(b.name, "Angebot freigegeben", `${id} · ${eur(angebotSummen(a).netto)} netto`);
    const v = await versandVorbereiten(id, d);
    d = await aendern(id, { versand: { mail: v.mail, fehler: v.fehler ?? null, zeit: jetzt() } }, b, v.mail ? "Mail an rechnung@ gesendet" : "Mail an rechnung@ fehlgeschlagen");
    return { ...d, hinweis: v.mail ? null : v.fehler };
  });

  route("mail-wiederholen", async (b, id, a) => {
    if (a.status !== "frei") throw nein("Nur für freigegebene Angebote.");
    const v = await versandVorbereiten(id, a);
    const d = await aendern(id, { versand: { mail: v.mail, fehler: v.fehler ?? null, zeit: jetzt() } }, b, v.mail ? "Mail an rechnung@ gesendet" : "Mail an rechnung@ fehlgeschlagen");
    return { ...d, hinweis: v.mail ? null : v.fehler };
  });

  route("versendet", async (b, id, a) => {
    if (a.status !== "frei") throw nein("Nur freigegebene Angebote können als versendet markiert werden.");
    const d = await aendern(id, { status: "vers", versendet: wer(b) }, b, "An den Kunden versendet");
    await protokolliere(b.name, "Angebot versendet", id);
    return d;
  });

  route("ergebnis", async (b, id, a, body) => {
    if (!["vers", "angenommen", "abgelehnt"].includes(String(a.status))) throw nein("Erst nach dem Versand.");
    const ok = body.angenommen === true;
    let d = await aendern(id, { status: ok ? "angenommen" : "abgelehnt", ergebnis: { angenommen: ok, ...wer(b) } }, b, ok ? "Vom Kunden angenommen" : "Vom Kunden abgelehnt");
    await protokolliere(b.name, ok ? "Angebot angenommen" : "Angebot abgelehnt", id);
    if (ok && a.status !== "angenommen") {
      const vertraege = await wartungsvertraege(id, a, b);
      if (vertraege.length) d = await aendern(id, { vertraege }, b, "Wartungsvertrag angelegt: " + vertraege.map((v) => `${v.nv} (${v.vertrag})`).join(", "));
    }
    return d;
  });

  /** Neue Fassung: freigegebenes oder versendetes Angebot wieder bearbeiten (Rev. +1), braucht erneut eine Freigabe */
  route("neue-fassung", async (b, id, a) => {
    if (!["frei", "vers", "abgelehnt"].includes(String(a.status))) throw nein("Entwürfe kannst du direkt bearbeiten.");
    const d = await aendern(id, { status: "entwurf", rev: Number(a.rev ?? 1) + 1, freigabe: null, eingereicht: null, versendet: null, ergebnis: null, versand: null, erstellt: wer(b) }, b, `Neue Fassung Rev. ${Number(a.rev ?? 1) + 1}`);
    await protokolliere(b.name, "Angebot neue Fassung", id);
    return d;
  });
}
