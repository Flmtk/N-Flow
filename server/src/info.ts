import type { FastifyInstance } from "fastify";
import { sql } from "./db.js";
import { anlagenOrdner } from "./ablage.js";
import { senden } from "./push.js";
import { brauche } from "./sitzung.js";
import { GraphFehler, graph, spEingerichtet, zielLaden } from "./sharepoint.js";

/**
 * Bereich „Info“ der Monteur-App aus SharePoint (Website der jeweiligen Umgebung):
 * - Neuigkeiten = Neuigkeitenbeiträge der Website (SharePoint › + Neu › Neuigkeitenbeitrag)
 * - Dokumente  = Ordner „Intranet“ in der Dokumentbibliothek (Herstellerunterlagen, Formulare, …)
 * - Unterlagen einer Anlage = Ordner „Unterlagen“ in der Kundenakte, dazu passende Herstellerunterlagen
 * N-Flow liest nur; Dateien werden über den Server ausgeliefert, damit Monteure kein SharePoint-Konto brauchen.
 */

type Daten = Record<string, unknown>;
interface Datei { id: string; name: string; groesse: number; geaendert: string; ordner: boolean; typ: string; url: string; pfad?: string }

const merke = new Map<string, { bis: number; wert: unknown }>();
async function zwischen<T>(schluessel: string, sekunden: number, holen: () => Promise<T>): Promise<T> {
  const z = merke.get(schluessel);
  if (z && z.bis > Date.now()) return z.wert as T;
  const wert = await holen();
  merke.set(schluessel, { bis: Date.now() + sekunden * 1000, wert });
  return wert;
}

function alsDatei(e: Record<string, unknown>): Datei {
  const f = e.file as { mimeType?: string } | undefined;
  const p = (e.parentReference as { path?: string } | undefined)?.path ?? "";
  return {
    id: String(e.id), name: String(e.name), groesse: Number(e.size ?? 0), geaendert: String(e.lastModifiedDateTime ?? ""),
    ordner: Boolean(e.folder), typ: f?.mimeType ?? "", url: String(e.webUrl ?? ""),
    pfad: decodeURIComponent(p.replace(/^.*root:\/?/, "")),
  };
}

const AUSWAHL = "$select=id,name,size,lastModifiedDateTime,folder,file,webUrl,parentReference&$top=200";

/** Inhalt eines Ordners unter „Intranet/…“ (leer, wenn es ihn nicht gibt) */
async function ordnerInhalt(pfad: string): Promise<Datei[]> {
  const z = await zielLaden();
  const teile = ["Intranet", ...pfad.split("/").filter((t) => t && t !== "." && t !== "..")].map(encodeURIComponent).join("/");
  try {
    const r = (await (await graph(`/drives/${z.laufwerk}/root:/${teile}:/children?${AUSWAHL}`)).json()) as { value: Record<string, unknown>[] };
    return r.value.map(alsDatei).sort((a, b) => Number(b.ordner) - Number(a.ordner) || a.name.localeCompare(b.name, "de"));
  } catch (e) {
    if (e instanceof GraphFehler && e.status === 404) return [];
    throw e;
  }
}

/** Neuigkeitenbeiträge der Website */
async function neuigkeiten() {
  const z = await zielLaden();
  const r = (await (await graph(`/sites/${z.seite}/pages/microsoft.graph.sitePage?$select=id,name,title,description,webUrl,createdDateTime,lastModifiedDateTime,promotionKind,createdBy&$top=100`)).json()) as { value: Record<string, unknown>[] };
  const alle = r.value.filter((p) => String(p.name ?? "").toLowerCase() !== "home.aspx");
  const news = alle.filter((p) => p.promotionKind === "newsPost");
  return (news.length ? news : alle)
    .map((p) => ({
      id: String(p.id), titel: String(p.title ?? p.name ?? ""), text: String(p.description ?? ""),
      datum: String(p.createdDateTime ?? p.lastModifiedDateTime ?? ""), url: String(p.webUrl ?? ""),
      von: String(((p.createdBy as { user?: { displayName?: string } } | undefined)?.user?.displayName) ?? ""),
    }))
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 30);
}

/** HTML eines SharePoint-Textblocks in einfache Absätze (nur Text, keine Auszeichnung) */
export function htmlZuText(html: string): string[] {
  const t = html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/tr)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.split("\n").map((z) => z.replace(/\s+/g, " ").trim()).filter(Boolean);
}

async function beitrag(id: string) {
  const z = await zielLaden();
  const p = (await (await graph(`/sites/${z.seite}/pages/${encodeURIComponent(id)}/microsoft.graph.sitePage?$expand=canvasLayout`)).json()) as Record<string, unknown>;
  const absaetze: string[] = [];
  const lay = p.canvasLayout as { horizontalSections?: { columns?: { webparts?: { innerHtml?: string }[] }[] }[] } | undefined;
  for (const s of lay?.horizontalSections ?? []) for (const c of s.columns ?? []) for (const w of c.webparts ?? []) if (w.innerHtml) absaetze.push(...htmlZuText(w.innerHtml));
  return { id, titel: String(p.title ?? ""), datum: String(p.createdDateTime ?? ""), url: String(p.webUrl ?? ""), absaetze };
}

/** Herstellerunterlagen passend zu Hersteller und Typ (Dateiname enthält z. B. „KB372“) */
async function herstellerUnterlagen(hersteller: string, typ: string): Promise<{ passend: Datei[]; ordner: string }> {
  if (!hersteller) return { passend: [], ordner: "" };
  const pfad = `Herstellerunterlagen/${hersteller}`;
  let liste = await ordnerInhalt(pfad);
  // eine Ebene Unterordner mitnehmen (z. B. Buderus/Logano)
  for (const o of liste.filter((d) => d.ordner).slice(0, 10)) liste = liste.concat(await ordnerInhalt(`${pfad}/${o.name}`));
  const dateien = liste.filter((d) => !d.ordner);
  const merkmale = typ.toLowerCase().split(/[\s/,]+/).filter((t) => t.length >= 3 && /\d/.test(t));
  const passend = merkmale.length ? dateien.filter((d) => merkmale.some((m) => d.name.toLowerCase().replace(/\s+/g, "").includes(m.replace(/\s+/g, "")))) : [];
  return { passend, ordner: pfad };
}

const NICHT_EINGERICHTET = { fehler: "SharePoint ist noch nicht eingerichtet.", eingerichtet: false };

export async function infoRouten(app: FastifyInstance): Promise<void> {
  const fehlerAntwort = (e: unknown) => ({ fehler: (e as Error).message, eingerichtet: spEingerichtet() });

  app.get("/api/info/neuigkeiten", { preHandler: brauche("eigene") }, async (_a, antwort) => {
    if (!spEingerichtet()) return antwort.code(503).send(NICHT_EINGERICHTET);
    try { return await zwischen("news", 300, neuigkeiten); } catch (e) { return antwort.code(502).send(fehlerAntwort(e)); }
  });

  app.get<{ Params: { id: string } }>("/api/info/neuigkeiten/:id", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    if (!spEingerichtet()) return antwort.code(503).send(NICHT_EINGERICHTET);
    try { return await zwischen("beitrag:" + anfrage.params.id, 300, () => beitrag(anfrage.params.id)); } catch (e) { return antwort.code(502).send(fehlerAntwort(e)); }
  });

  app.get<{ Querystring: { pfad?: string } }>("/api/info/ordner", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    if (!spEingerichtet()) return antwort.code(503).send(NICHT_EINGERICHTET);
    const pfad = String(anfrage.query.pfad ?? "");
    try { return await zwischen("ordner:" + pfad, 120, () => ordnerInhalt(pfad)); } catch (e) { return antwort.code(502).send(fehlerAntwort(e)); }
  });

  app.get<{ Querystring: { q?: string } }>("/api/info/suche", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    if (!spEingerichtet()) return antwort.code(503).send(NICHT_EINGERICHTET);
    const q = String(anfrage.query.q ?? "").replace(/'/g, "''").trim().slice(0, 80);
    if (q.length < 2) return [];
    try {
      const z = await zielLaden();
      const r = (await (await graph(`/drives/${z.laufwerk}/root/search(q='${encodeURIComponent(q)}')?${AUSWAHL}`)).json()) as { value: Record<string, unknown>[] };
      return r.value.map(alsDatei).filter((d) => !d.ordner && /^Intranet(\/|$)/.test(d.pfad ?? "")).slice(0, 50);
    } catch (e) { return antwort.code(502).send(fehlerAntwort(e)); }
  });

  /** Datei aus SharePoint ausliefern (nur aus „Intranet“ und den Kundenakten der Website) */
  app.get<{ Params: { id: string } }>("/api/info/datei/:id", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    if (!spEingerichtet()) return antwort.code(503).send(NICHT_EINGERICHTET);
    if (!/^[A-Za-z0-9!_-]{8,80}$/.test(anfrage.params.id)) return antwort.code(400).send({ fehler: "Ungültige Datei." });
    try {
      const z = await zielLaden();
      const e = alsDatei((await (await graph(`/drives/${z.laufwerk}/items/${anfrage.params.id}?${AUSWAHL.replace("&$top=200", "")}`)).json()) as Record<string, unknown>);
      if (e.ordner || !/^(Intranet|Kunden)(\/|$)/.test(e.pfad ?? "")) return antwort.code(404).send({ fehler: "Nicht gefunden." });
      const r = await graph(`/drives/${z.laufwerk}/items/${anfrage.params.id}/content`, { roh: true });
      const inhalt = Buffer.from(await r.arrayBuffer());
      return antwort
        .type(e.typ || "application/octet-stream")
        .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(e.name)}`)
        .header("cache-control", "private, max-age=3600")
        .send(inhalt);
    } catch (e) { return antwort.code(502).send(fehlerAntwort(e)); }
  });

  /** Unterlagen einer Anlage: Dateien aus SharePoint › Kundenakte › Anlage › Unterlagen und passende Herstellerunterlagen */
  app.get<{ Params: { nv: string } }>("/api/anlagen/:nv/unterlagen", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    const [a] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = 'anlagen' and id = ${anfrage.params.nv} and not geloescht`;
    if (!a) return antwort.code(404).send({ fehler: "Anlage nicht gefunden." });
    if (!spEingerichtet()) return { eingerichtet: false, akte: [], hersteller: [], herstellerOrdner: "" };
    try {
      return await zwischen("unterlagen:" + anfrage.params.nv, 120, async () => {
        const z = await zielLaden();
        let akte: Datei[] = [];
        if (a.d.knr) {
          const o = await anlagenOrdner(anfrage.params.nv);
          try {
            const r = (await (await graph(`/drives/${z.laufwerk}/items/${o.id}:/Unterlagen:/children?${AUSWAHL}`)).json()) as { value: Record<string, unknown>[] };
            akte = r.value.map(alsDatei).filter((d) => !d.ordner);
          } catch (e) { if (!(e instanceof GraphFehler && e.status === 404)) throw e; }
        }
        const h = await herstellerUnterlagen(String(a.d.hersteller ?? ""), String(a.d.typ ?? ""));
        return { eingerichtet: true, akte, hersteller: h.passend, herstellerOrdner: h.ordner };
      });
    } catch (e) { return antwort.code(502).send(fehlerAntwort(e)); }
  });
}

/** Alle 10 Minuten: neue Neuigkeiten als Mitteilung an alle aktiven Mitarbeiter */
export function infoBeobachten(): void {
  setInterval(async () => {
    if (!spEingerichtet()) return;
    try {
      merke.delete("news");
      const liste = await zwischen("news", 300, neuigkeiten);
      const [g] = await sql<{ wert: string[] }[]>`select wert from einstellungen where schluessel = 'info_gesehen'`;
      const gesehen = new Set(g?.wert ?? []);
      const neu = liste.filter((n) => !gesehen.has(n.id));
      await sql`insert into einstellungen (schluessel, wert) values ('info_gesehen', ${sql.json(liste.map((n) => n.id))})
        on conflict (schluessel) do update set wert = excluded.wert, geaendert_am = now()`;
      if (!g || !neu.length) return; // beim ersten Mal nur merken
      const alle = await sql<{ id: string }[]>`select id from mitarbeiter where aktiv and not gesperrt`;
      for (const n of neu.slice(0, 3)) await senden(alle.map((x) => x.id), "info", n.titel, n.text || "Neue Info vom Büro", "/app/#info");
    } catch (e) {
      console.error("Info-Abruf fehlgeschlagen", (e as Error).message);
    }
  }, 10 * 60_000);
}
