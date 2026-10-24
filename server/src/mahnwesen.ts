import { sql } from "./db.js";
import { mailSenden } from "./mail.js";

/**
 * Jeden Morgen um 7:30 Uhr: Mail an rechnung@ mit allen Rechnungen, die neu überfällig sind
 * oder bei denen die nächste Mahnstufe fällig wird. Je Rechnung und Stufe nur einmal.
 */

type Daten = Record<string, unknown>;
interface Stufe { name: string; tage: number; gebuehr: number }
const ZIEL = 14;
const STANDARD: Stufe[] = [{ name: "Zahlungserinnerung", tage: 7, gebuehr: 0 }, { name: "1. Mahnung", tage: 14, gebuehr: 5 }, { name: "2. Mahnung", tage: 14, gebuehr: 10 }];
export const RECHNUNG_MAIL = () => (process.env.MAIL_RECHNUNG || "rechnung@novis-anlagentechnik.de").trim();

const plusTage = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const deDatum = (d: string) => new Date(d + "T12:00").toLocaleDateString("de-DE");
const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export async function mahnPruefung(heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })): Promise<number> {
  const [pr] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'einstellungen' and id = 'preise'`;
  const stufen = ((((pr?.d?.preise ?? {}) as Daten).mahnung as { stufen?: Stufe[] } | undefined)?.stufen) ?? STANDARD;
  const rech = await sql<{ id: string; d: Daten }[]>`select id, daten as d from daten where sammlung = 'rechnungen' and not geloescht and daten->>'status' = 'offen'`;
  const mahn = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'mahnungen' and not geloescht`;
  const [g] = await sql<{ wert: Record<string, number> }[]>`select wert from einstellungen where schluessel = 'mahn_gemeldet'`;
  const gemeldet: Record<string, number> = { ...(g?.wert ?? {}) };
  const zeilen: string[] = [];
  for (const r of rech) {
    const faellig = plusTage(String(r.d.datum), ZIEL);
    if (faellig >= heute) continue;
    const M = mahn.map((m) => m.d).filter((m) => m.re === r.id).sort((a, b) => Number(a.stufe) - Number(b.stufe));
    // Stufe 0 = überfällig, n = n-te Mahnstufe fällig
    let stand = 0, naechste = "";
    if (M.length < stufen.length) {
      const basis = M.length ? String(M[M.length - 1].datum) : faellig;
      if (plusTage(basis, Number(stufen[M.length].tage) || 0) <= heute) { stand = M.length + 1; naechste = stufen[M.length].name; }
    }
    if ((gemeldet[r.id] ?? -1) >= stand) continue;
    gemeldet[r.id] = stand;
    const [a] = await sql<{ kunde: string }[]>`
      select coalesce(k.daten->>'name1', '') || coalesce(', ' || nullif(k.daten->>'name2', ''), '') as kunde
      from daten a left join daten k on k.sammlung = 'kunden' and k.id = a.daten->>'knr'
      where a.sammlung = 'anlagen' and a.id = ${String(r.d.nv ?? "")}`;
    const tage = Math.round((Date.parse(heute) - Date.parse(faellig)) / 864e5);
    zeilen.push(`${r.id}  ${(a?.kunde ?? "").slice(0, 34).padEnd(34)}  ${euro(Number(r.d.brutto ?? 0)).padStart(12)}  seit ${deDatum(faellig)} überfällig (${tage} T)${naechste ? "  →  " + naechste + " fällig" : M.length ? "  · " + M[M.length - 1].name + " vom " + deDatum(String(M[M.length - 1].datum)) : ""}`);
  }
  // bezahlte oder gelöschte Rechnungen aus der Merkliste nehmen
  const offen = new Set(rech.map((r) => r.id));
  for (const k of Object.keys(gemeldet)) if (!offen.has(k)) delete gemeldet[k];
  const merken = () => sql`insert into einstellungen (schluessel, wert) values ('mahn_gemeldet', ${sql.json(gemeldet)})
    on conflict (schluessel) do update set wert = excluded.wert, geaendert_am = now()`;
  if (!zeilen.length) { await merken(); return 0; }
  await mailSenden(RECHNUNG_MAIL(), `Überfällige Rechnungen: ${zeilen.length} neu`, `Guten Morgen,

diese Rechnungen sind überfällig oder eine Mahnstufe ist fällig:

${zeilen.join("\n")}

Mahnung erstellen: N-Flow › Rechnungen › Rechnung › Mahnstufe (oder Übersicht › Braucht Aufmerksamkeit).
Zahlungseingang erfasst? Dann in N-Flow „Bezahlt“ markieren, danach kommt keine Meldung mehr.

N-Flow`);
  await merken(); // erst nach erfolgreichem Versand, sonst morgen erneut
  return zeilen.length;
}

export function mahnwesenPlanen(): void {
  let zuletzt = "";
  setInterval(async () => {
    const jetzt = new Date();
    const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    const heute = jetzt.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
    if (uhr < "07:30" || zuletzt === heute) return;
    zuletzt = heute;
    try { await mahnPruefung(heute); } catch (e) { console.error("Mahnprüfung fehlgeschlagen", (e as Error).message); }
  }, 60_000);
}
