import { config, microsoftAktiv } from "./config.js";
import { sql } from "./db.js";
import { graphToken } from "./mail.js";

/**
 * Ablage in SharePoint über Microsoft Graph.
 * Berechtigung: Anwendungsberechtigung „Sites.Selected“ und Schreibrecht nur auf die eine Website
 * (siehe docs/sharepoint.md). N-Flow sieht damit keine anderen Websites der Firma.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
export const SEITE = () => (process.env.SHAREPOINT_SEITE || "").trim().replace(/\/$/, "");
export const spEingerichtet = () => microsoftAktiv && Boolean(SEITE());

let ziel: { seite: string; laufwerk: string; webUrl: string } | null = null;

export class GraphFehler extends Error {
  constructor(public status: number, text: string) { super(text); }
}

export async function graph(pfad: string, init: RequestInit & { roh?: boolean } = {}): Promise<Response> {
  const r = await fetch(pfad.startsWith("http") ? pfad : GRAPH + pfad, {
    ...init,
    headers: { authorization: `Bearer ${await graphToken()}`, ...(init.roh ? {} : { "content-type": "application/json" }), ...(init.headers ?? {}) },
  });
  if (!r.ok) {
    let t = await r.text();
    try { t = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? t; } catch { /* Text lassen */ }
    if (r.status === 401 || r.status === 403) {
      throw new GraphFehler(r.status, "N-Flow hat keinen Zugriff auf die SharePoint-Website. In Entra fehlt „Sites.Selected“ mit Zustimmung oder die Freigabe für diese Website (siehe Anleitung).");
    }
    throw new GraphFehler(r.status, `SharePoint meldet ${r.status}: ${t.slice(0, 200)}`);
  }
  return r;
}

/** Website-ID und Dokumentbibliothek aus SHAREPOINT_SEITE (z. B. https://firma.sharepoint.com/sites/Service) */
export async function zielLaden(neu = false) {
  if (ziel && !neu) return ziel;
  if (!spEingerichtet()) throw new Error("SharePoint ist nicht eingerichtet (SHAREPOINT_SEITE in der .env fehlt).");
  const u = new URL(SEITE());
  const s = (await (await graph(`/sites/${u.hostname}:${u.pathname || "/"}`)).json()) as { id: string; webUrl: string };
  const d = (await (await graph(`/sites/${s.id}/drive`)).json()) as { id: string; webUrl: string };
  ziel = { seite: s.id, laufwerk: d.id, webUrl: d.webUrl };
  return ziel;
}

/** Zeichen, die SharePoint in Datei- und Ordnernamen nicht erlaubt */
export function sauber(name: string): string {
  return name.replace(/["*:<>?/\\|#%]/g, "-").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 120) || "unbenannt";
}
const pfadKodieren = (teile: string[]) => teile.map((t) => encodeURIComponent(sauber(t))).join("/");

interface Element { id: string; name: string; webUrl: string }

/**
 * Ordner mit festem Schlüssel (z. B. Kunde K-10001): beim ersten Mal anlegen, danach über die
 * gespeicherte ID wiederfinden und bei geändertem Namen umbenennen. So bleibt die Akte zusammen,
 * auch wenn sich der Kundenname ändert.
 */
export async function ordner(schluessel: string, eltern: string | null, name: string): Promise<Element> {
  const z = await zielLaden();
  const nameS = sauber(name);
  const [gem] = await sql<{ element_id: string; name: string }[]>`select element_id, name from ablage_ordner where schluessel = ${schluessel}`;
  if (gem) {
    try {
      if (gem.name !== nameS) {
        const e = (await (await graph(`/drives/${z.laufwerk}/items/${gem.element_id}`, { method: "PATCH", body: JSON.stringify({ name: nameS }) })).json()) as Element;
        await sql`update ablage_ordner set name = ${nameS} where schluessel = ${schluessel}`;
        return e;
      }
      return (await (await graph(`/drives/${z.laufwerk}/items/${gem.element_id}`)).json()) as Element;
    } catch (e) {
      if (!(e instanceof GraphFehler && e.status === 404)) throw e;
      await sql`delete from ablage_ordner where schluessel = ${schluessel}`; // im SharePoint gelöscht: neu anlegen
    }
  }
  const basis = eltern ? `/drives/${z.laufwerk}/items/${eltern}` : `/drives/${z.laufwerk}/root`;
  let e: Element;
  try {
    e = (await (await graph(`${basis}/children`, { method: "POST", body: JSON.stringify({ name: nameS, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) })).json()) as Element;
  } catch (x) {
    if (!(x instanceof GraphFehler && x.status === 409)) throw x;
    e = (await (await graph(`${basis}:/${encodeURIComponent(nameS)}`)).json()) as Element; // gibt es schon
  }
  await sql`insert into ablage_ordner (schluessel, element_id, name) values (${schluessel}, ${e.id}, ${nameS})
    on conflict (schluessel) do update set element_id = excluded.element_id, name = excluded.name`;
  return e;
}

/**
 * Legt eine Datei unter einem Ordner ab (Unterordner wie „Berichte“ entstehen automatisch).
 * Gleicher Name ersetzt die Datei, SharePoint behält die alte Fassung im Versionsverlauf.
 */
export async function hochladen(eltern: string | null, pfad: string[], inhalt: Buffer, typ: string): Promise<Element> {
  const z = await zielLaden();
  const basis = eltern ? `/drives/${z.laufwerk}/items/${eltern}:/${pfadKodieren(pfad)}` : `/drives/${z.laufwerk}/root:/${pfadKodieren(pfad)}`;
  if (inhalt.length <= 4 * 1024 * 1024) {
    const r = await graph(`${basis}:/content?@microsoft.graph.conflictBehavior=replace`, { method: "PUT", body: new Uint8Array(inhalt), roh: true, headers: { "content-type": typ } });
    return (await r.json()) as Element;
  }
  // Große Dateien in Stücken (Vielfaches von 320 KiB)
  const s = (await (await graph(`${basis}:/createUploadSession`, { method: "POST", body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }) })).json()) as { uploadUrl: string };
  const stueck = 320 * 1024 * 16;
  let letzte: Response | null = null;
  for (let von = 0; von < inhalt.length; von += stueck) {
    const teil = inhalt.subarray(von, Math.min(von + stueck, inhalt.length));
    letzte = await fetch(s.uploadUrl, { method: "PUT", body: new Uint8Array(teil), headers: { "content-range": `bytes ${von}-${von + teil.length - 1}/${inhalt.length}` } });
    if (!letzte.ok && letzte.status !== 202) throw new Error(`Hochladen abgebrochen (${letzte.status})`);
  }
  return (await letzte!.json()) as Element;
}

/** Für Administration → SharePoint */
export async function spStatus() {
  if (!microsoftAktiv) return { eingerichtet: false, ok: false, meldung: "Microsoft ist nicht eingerichtet." };
  if (!SEITE()) return { eingerichtet: false, ok: false, meldung: "In der .env fehlt SHAREPOINT_SEITE." };
  try {
    const z = await zielLaden(true);
    return { eingerichtet: true, ok: true, seite: SEITE(), bibliothek: z.webUrl, meldung: "Verbunden" };
  } catch (e) {
    return { eingerichtet: true, ok: false, seite: SEITE(), meldung: (e as Error).message };
  }
}

/**
 * Einmalige Freischaltung: N-Flow gibt sich selbst Schreibrecht auf die Website.
 * Klappt nur, solange die App vorübergehend „Sites.FullControl.All“ hat (danach wieder entfernen).
 */
export async function freischalten(): Promise<void> {
  const u = new URL(SEITE());
  const s = (await (await graph(`/sites/${u.hostname}:${u.pathname || "/"}`)).json()) as { id: string };
  await graph(`/sites/${s.id}/permissions`, {
    method: "POST",
    body: JSON.stringify({ roles: ["write"], grantedToIdentities: [{ application: { id: config.microsoft.clientId, displayName: "N-Flow" } }] }),
  });
  ziel = null;
}
