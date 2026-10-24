import { sql } from "./db.js";
import { mailSenden } from "./mail.js";

/**
 * Fahrzeuglager: Jedes Fahrzeug hat einen Soll-Bestand (Artikel, Soll-Menge, Mindestmenge).
 * Verbucht ein Monteur im Servicebericht Material, wird es vom Bestand seines Fahrzeugs abgezogen.
 * Fällt ein Artikel auf oder unter die Mindestmenge, geht eine Mail an den Einkauf (einmal je Artikel,
 * bis wieder aufgefüllt ist).
 */

type Daten = Record<string, unknown>;
interface SollPos { nr: string; menge: number; min?: number }
interface Lager { soll?: SollPos[]; bestand?: Record<string, number>; bestellt?: Record<string, string> }

export const EINKAUF = () => (process.env.MAIL_EINKAUF || "einkauf@novis-anlagentechnik.de").trim();

function summe(liste: unknown): Record<string, number> {
  const s: Record<string, number> = {};
  for (const p of Array.isArray(liste) ? (liste as { nr?: string; menge?: unknown }[]) : []) {
    const m = Number(String(p.menge ?? 0).replace(",", "."));
    if (p.nr && m > 0) s[p.nr] = (s[p.nr] ?? 0) + m;
  }
  return s;
}

/** Bestand eines Artikels; ohne Eintrag gilt das Fahrzeug als voll bestückt (Soll-Menge). */
export const bestandVon = (l: Lager, p: SollPos) => (l.bestand && l.bestand[p.nr] != null ? Number(l.bestand[p.nr]) : Number(p.menge));
export const fehlt = (l: Lager) => (l.soll ?? []).filter((p) => bestandVon(l, p) <= Number(p.min ?? 0));

async function speichereLager(id: string, lager: Lager, wer: string) {
  await sql`update daten set daten = jsonb_set(daten, '{lager}', ${sql.json(lager as never)}),
    version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${wer}
    where sammlung = 'fahrzeuge' and id = ${id}`;
}

/** Nach dem Speichern eines Berichts: Material vom Fahrzeug abbuchen (bei Änderungen nur die Differenz). */
export async function nachSpeichernLager(s: string, id: string, neu: Daten): Promise<void> {
  try {
    if (s === "fahrzeuge") { await nachbestellungPruefen(id, true); return; }
    if (s !== "berichte" || !neu.tech) return;
    const [fz] = await sql<{ id: string }[]>`select id from daten where sammlung = 'fahrzeuge' and not geloescht and daten->>'fahrer' = ${String(neu.tech)} limit 1`;
    if (!fz) return;
    const jetzt = summe(neu.materialListe);
    const [b] = await sql<{ fahrzeug: string; positionen: Record<string, number> }[]>`select fahrzeug, positionen from lager_buchungen where bericht = ${id}`;
    const vorher = b && b.fahrzeug === fz.id ? b.positionen : {};
    const diff: Record<string, number> = {};
    for (const nr of new Set([...Object.keys(jetzt), ...Object.keys(vorher)])) {
      const d = (jetzt[nr] ?? 0) - (vorher[nr] ?? 0);
      if (d) diff[nr] = d;
    }
    if (!Object.keys(diff).length) return;
    await sql.begin(async (tx) => {
      const [z] = await tx<{ d: Daten }[]>`select daten as d from daten where sammlung = 'fahrzeuge' and id = ${fz.id} for update`;
      const lager: Lager = { ...((z.d.lager ?? {}) as Lager) };
      lager.bestand = { ...(lager.bestand ?? {}) };
      for (const [nr, d] of Object.entries(diff)) {
        const p = (lager.soll ?? []).find((x) => x.nr === nr);
        if (!p) continue; // gehört nicht zum Fahrzeugsortiment
        lager.bestand[nr] = Math.max(0, Math.round((bestandVon(lager, p) - d) * 100) / 100);
      }
      await tx`update daten set daten = jsonb_set(daten, '{lager}', ${tx.json(lager as never)}),
        version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = 'N-Flow Lager'
        where sammlung = 'fahrzeuge' and id = ${fz.id}`;
      await tx`insert into lager_buchungen (bericht, fahrzeug, positionen) values (${id}, ${fz.id}, ${tx.json(jetzt)})
        on conflict (bericht) do update set fahrzeug = excluded.fahrzeug, positionen = excluded.positionen, zeit = now()`;
    });
    await nachbestellungPruefen(fz.id, false);
  } catch (e) {
    console.error("Fahrzeuglager: Abbuchung fehlgeschlagen", e);
  }
}

/** Mail an den Einkauf für Artikel, die neu unter die Mindestmenge gefallen sind. */
export async function nachbestellungPruefen(fahrzeugId: string, nachHandaenderung: boolean): Promise<{ gesendet: number }> {
  const [z] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'fahrzeuge' and id = ${fahrzeugId} and not geloescht`;
  if (!z) return { gesendet: 0 };
  const fz = z.d, lager: Lager = { ...((fz.lager ?? {}) as Lager) };
  const bestellt = { ...(lager.bestellt ?? {}) };
  let geaendert = false;
  // Wieder aufgefüllt? Dann darf später erneut gemeldet werden.
  for (const p of lager.soll ?? []) if (bestellt[p.nr] && bestandVon(lager, p) > Number(p.min ?? 0)) { delete bestellt[p.nr]; geaendert = true; }
  const alle = fehlt(lager), neu = alle.filter((p) => !bestellt[p.nr]);
  if (neu.length) {
    const artikel = await sql<{ nr: string; bez: string }[]>`select daten->>'nr' as nr, daten->>'bez' as bez from daten where sammlung = 'artikel' and not geloescht`;
    const bez = (nr: string) => artikel.find((a) => a.nr === nr)?.bez ?? "";
    const [m] = await sql<{ name: string }[]>`select name from mitarbeiter where id::text = ${String(fz.fahrer ?? "")}`;
    const zeilen = alle.map((p) => {
      const b = bestandVon(lager, p), nach = Math.max(0, Number(p.menge) - b);
      return `${neu.includes(p) ? "NEU  " : "     "}${p.nr.padEnd(14)} ${bez(p.nr).slice(0, 38).padEnd(38)} Bestand ${String(b).padStart(4)}  Soll ${String(p.menge).padStart(4)}  → bestellen ${nach}`;
    });
    const text = `Hallo Einkauf,

im Fahrzeug ${fz.kennzeichen ?? ""} (${fz.modell ?? ""}${m ? ", " + m.name : ""}) wird Material knapp. Bitte nachbestellen:

${zeilen.join("\n")}

„NEU“ = seit der letzten Meldung unter die Mindestmenge gefallen.
Nach dem Auffüllen bitte in N-Flow unter Fahrzeuge › ${fz.kennzeichen ?? ""} › Lager „Aufgefüllt“ tippen.

N-Flow`;
    try {
      await mailSenden(EINKAUF(), `Nachbestellen: ${neu.length} Artikel für ${fz.kennzeichen ?? "Fahrzeug"}`, text);
      for (const p of neu) bestellt[p.nr] = new Date().toISOString();
      geaendert = true;
    } catch (e) {
      console.error("Nachbestellung: Mail fehlgeschlagen", (e as Error).message);
    }
  }
  if (geaendert) await speichereLager(fahrzeugId, { ...lager, bestellt }, nachHandaenderung ? "N-Flow Lager" : "N-Flow Lager");
  return { gesendet: neu.length };
}
