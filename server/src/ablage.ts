import type { FastifyInstance } from "fastify";
import { sql } from "./db.js";
import { pdfErzeugen, type DruckArt } from "./druck.js";
import { protokolliere } from "./protokoll.js";
import { brauche } from "./sitzung.js";
import { freischalten, hochladen, ordner, spEingerichtet, spStatus } from "./sharepoint.js";

/**
 * Automatische Ablage in SharePoint, Aufbau nach Kunde:
 *
 *   Kunden/K-10001 Müller, Hans/
 *     Kundenstammblatt.pdf
 *     Rechnungen/RE-2027-0007 2027-03-04.pdf
 *     NV-00012 Buderus GB192 (Hauptstr. 5, Gelnhausen)/
 *       Berichte/SB-2027-0001 Wartung 2027-03-04.pdf
 *       Fotos/SB-2027-0001 Foto 1.jpg
 *   Belege/2027/2027-03/2027-03-04 Tanken 89,40 EUR Frank Tetzlaff.jpg
 *   Intern/Berichte/…   (Einsätze ohne Kundenanlage)
 *
 * Jede Änderung setzt einen Eintrag in die Warteschlange. Ist SharePoint nicht erreichbar,
 * wird es später erneut versucht; nichts geht verloren.
 */

export type AblageArt = "kunde" | "bericht" | "rechnung" | "beleg" | "unterlage" | "mahnung" | "belegliste";
type Daten = Record<string, unknown>;

class Warten extends Error {}

/** Merkt ein Dokument zur Ablage vor. Kurze Verzögerung, damit mehrere Änderungen zusammenfallen. */
export async function vormerken(art: AblageArt, ref: string, sekunden = 30): Promise<void> {
  if (!ref) return;
  await sql`
    insert into ablage (art, ref, naechster) values (${art}, ${ref}, now() + ${sekunden + " seconds"}::interval)
    on conflict (art, ref) do update set status = 'offen', versuche = 0, fehler = null,
      naechster = now() + ${sekunden + " seconds"}::interval`;
}

async function kundeVonAnlage(nv: unknown): Promise<string | null> {
  if (!nv || nv === "INTERN") return null;
  const [a] = await sql<{ knr: string | null }[]>`select daten->>'knr' as knr from daten where sammlung = 'anlagen' and id = ${String(nv)}`;
  return a?.knr ?? null;
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Wird nach jedem Speichern aufgerufen (daten.ts) */
export async function nachSpeichernAblage(s: string, id: string, alt: Daten | null, neu: Daten): Promise<void> {
  try {
    if (s === "berichte") {
      await vormerken("bericht", id, 60);
      const k = await kundeVonAnlage(neu.nv);
      if (k && !alt) await vormerken("kunde", k, 120);
    } else if (s === "rechnungen") {
      if (!alt || !gleich(alt.L, neu.L) || alt.datum !== neu.datum || alt.brutto !== neu.brutto) await vormerken("rechnung", id);
      const k = await kundeVonAnlage(neu.nv);
      if (k) await vormerken("kunde", k, 120);
    } else if (s === "belege") {
      if (!alt || alt.foto !== neu.foto || alt.betrag !== neu.betrag || alt.datum !== neu.datum || alt.kat !== neu.kat) await vormerken("beleg", id, 60);
    } else if (s === "kunden") {
      await vormerken("kunde", id);
    } else if (s === "anlagen") {
      // Unterlagen zur Anlage (Schaltplan, Schema, …), in Büro oder App hochgeladen
      const vorher = new Set(((alt?.unterlagen ?? []) as { datei?: string }[]).map((u) => u.datei));
      for (const u of (neu.unterlagen ?? []) as { datei?: string }[]) if (u.datei && !vorher.has(u.datei)) await vormerken("unterlage", `${id}|${u.datei}`, 20);
      if (neu.knr) await vormerken("kunde", String(neu.knr));
      if (alt?.knr && alt.knr !== neu.knr) await vormerken("kunde", String(alt.knr));
    }
  } catch (e) {
    console.error("Ablage vormerken fehlgeschlagen", e);
  }
}

/* ---------- Abarbeiten ---------- */

async function lade(s: string, id: string): Promise<Daten | null> {
  const [z] = await sql<{ d: Daten }[]>`select daten as d from daten where sammlung = ${s} and id = ${id} and not geloescht`;
  return z?.d ?? null;
}
const kundeName = (k: Daten) => [k.name1, k.name2].filter(Boolean).join(", ");
const geraet = (a: Daten) => String(a.ger || [a.hersteller, a.typ].filter(Boolean).join(" ") || "Anlage");

async function kundenOrdner(nr: string) {
  const k = await lade("kunden", nr);
  if (!k) throw new Error(`Kunde ${nr} nicht gefunden.`);
  const wurzel = await ordner("wurzel:Kunden", null, "Kunden");
  return ordner(`kunde:${nr}`, wurzel.id, `${nr} ${kundeName(k)}`);
}

/** Ordner der Anlage, oder „Intern“ für Einsätze ohne Kundenanlage */
export async function anlagenOrdner(nv: unknown) {
  const a = nv && nv !== "INTERN" ? await lade("anlagen", String(nv)) : null;
  if (!a || !a.knr) return ordner("wurzel:Intern", null, "Intern");
  const k = await kundenOrdner(String(a.knr));
  return ordner(`anlage:${nv}`, k.id, `${nv} ${geraet(a)} (${[a.str, a.ort].filter(Boolean).join(", ")})`);
}

export async function dateiLaden(id: string): Promise<{ typ: string; inhalt: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [d] = await sql<{ typ: string; inhalt: Buffer }[]>`select typ, inhalt from dateien where id = ${id}`;
  return d ?? null;
}
const endung = (typ: string) => ({ "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[typ] ?? "jpg");

async function verarbeiten(art: AblageArt, ref: string): Promise<string | null> {
  if (art === "kunde") {
    if (!(await lade("kunden", ref))) return null; // gelöscht
    const o = await kundenOrdner(ref);
    const e = await hochladen(o.id, ["Kundenstammblatt.pdf"], await pdfErzeugen("kunde", ref), "application/pdf");
    return e.webUrl;
  }
  if (art === "bericht") {
    const b = await lade("berichte", ref);
    if (!b) return null;
    const inhalt = (b.daten ?? {}) as Daten;
    const fotos = Array.isArray(inhalt.fotos) ? (inhalt.fotos as string[]) : [];
    const anhang = [...fotos, inhalt.sigK, inhalt.sigT].filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
    if (anhang.length) {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from dateien where id in ${sql(anhang)}`;
      if (n < new Set(anhang).size) throw new Warten("Fotos oder Unterschriften sind noch nicht vom Handy hochgeladen.");
    }
    const o = await anlagenOrdner(b.nv);
    const e = await hochladen(o.id, ["Berichte", `${ref} ${b.art ?? ""} ${b.datum ?? ""}.pdf`], await pdfErzeugen("bericht", ref), "application/pdf");
    for (const [i, id] of fotos.entries()) {
      const d = await dateiLaden(id);
      if (d) await hochladen(o.id, ["Fotos", `${ref} Foto ${i + 1}.${endung(d.typ)}`], d.inhalt, d.typ);
    }
    return e.webUrl;
  }
  if (art === "rechnung") {
    const r = await lade("rechnungen", ref);
    if (!r) return null;
    const a = await lade("anlagen", String(r.nv ?? ""));
    const o = a?.knr ? await kundenOrdner(String(a.knr)) : await ordner("wurzel:Intern", null, "Intern");
    const e = await hochladen(o.id, ["Rechnungen", `${ref} ${r.datum ?? ""}.pdf`], await pdfErzeugen("rechnung", ref), "application/pdf");
    return e.webUrl;
  }
  if (art === "unterlage") {
    const [nv, dateiId] = ref.split("|");
    const a = await lade("anlagen", nv);
    const u = ((a?.unterlagen ?? []) as { datei?: string; name?: string }[]).find((x) => x.datei === dateiId);
    if (!a || !u) return null; // inzwischen entfernt
    const d = await dateiLaden(dateiId);
    if (!d) throw new Warten("Die Datei ist noch nicht vom Gerät hochgeladen.");
    const o = await anlagenOrdner(nv);
    const name = String(u.name || `Unterlage.${endung(d.typ)}`);
    const e = await hochladen(o.id, ["Unterlagen", /\.[a-z0-9]{2,4}$/i.test(name) ? name : `${name}.${endung(d.typ)}`], d.inhalt, d.typ);
    return e.webUrl;
  }
  if (art === "beleg") {
    const b = await lade("belege", ref);
    if (!b) return null;
    if (!b.foto) return null; // ohne Foto nichts abzulegen
    const d = await dateiLaden(String(b.foto));
    if (!d) throw new Warten("Das Foto der Quittung ist noch nicht vom Handy hochgeladen.");
    const [t] = await sql<{ name: string }[]>`select name from mitarbeiter where id::text = ${String(b.tech ?? "")}`;
    const datum = String(b.datum ?? "");
    const betrag = Number(b.betrag ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const w = await ordner("wurzel:Belege", null, "Belege");
    const e = await hochladen(w.id, [datum.slice(0, 4) || "ohne Datum", datum.slice(0, 7) || "ohne Datum",
      `${datum} ${b.kat ?? "Beleg"} ${betrag} EUR ${t?.name ?? ""} (${ref}).${endung(d.typ)}`], d.inhalt, d.typ);
    return e.webUrl;
  }
  return null;
}

const PAUSEN = [1, 2, 5, 15, 30, 60, 120, 240]; // Minuten bis zum nächsten Versuch
let laeuft = false;

async function abarbeiten(): Promise<void> {
  if (laeuft || !spEingerichtet()) return;
  laeuft = true;
  try {
    const liste = await sql<{ id: number; art: AblageArt; ref: string; versuche: number }[]>`
      select id, art, ref, versuche from ablage where status = 'offen' and naechster <= now() order by naechster limit 10`;
    for (const j of liste) {
      try {
        const url = await verarbeiten(j.art, j.ref);
        await sql`update ablage set status = 'erledigt', erledigt_am = now(), fehler = null, url = coalesce(${url}, url)
          where id = ${j.id} and naechster <= now()`; // in der Zwischenzeit neu vorgemerkt? Dann bleibt er offen.
      } catch (e) {
        const v = j.versuche + 1;
        const endgueltig = v >= PAUSEN.length && !(e instanceof Warten && v < 40);
        await sql`update ablage set versuche = ${v}, fehler = ${(e as Error).message.slice(0, 500)},
          status = ${endgueltig ? "fehler" : "offen"},
          naechster = now() + ${PAUSEN[Math.min(v, PAUSEN.length) - 1] + " minutes"}::interval
          where id = ${j.id}`;
        if (!(e instanceof Warten)) console.error(`Ablage ${j.art} ${j.ref} fehlgeschlagen:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error("Ablage fehlgeschlagen", e);
  } finally {
    laeuft = false;
  }
}

export function ablageStarten(): void {
  setInterval(() => void abarbeiten(), 20_000);
}

const DRUCK_RECHT = { bericht: "berichte_pruefen", rechnung: "rechnungen", kunde: "planung" } as const;

export async function ablageRouten(app: FastifyInstance): Promise<void> {
  app.get("/api/ablage", { preHandler: brauche("admin") }, async () => {
    const zahlen = await sql<{ status: string; n: number }[]>`select status, count(*)::int as n from ablage group by status`;
    const fehler = await sql`select art, ref, versuche, fehler, naechster, status from ablage
      where fehler is not null order by naechster desc limit 20`;
    const zuletzt = await sql`select art, ref, url, erledigt_am from ablage where status = 'erledigt' order by erledigt_am desc limit 10`;
    return { sharepoint: await spStatus(), zahlen: Object.fromEntries(zahlen.map((z) => [z.status, z.n])), fehler, zuletzt };
  });

  /** Alles, was schon in N-Flow steht, nach SharePoint übertragen (z. B. nach der Einrichtung) */
  app.post("/api/ablage/nachholen", { preHandler: brauche("admin") }, async (anfrage) => {
    const n = await sql<{ n: number }[]>`
      with q as (
        select case sammlung when 'kunden' then 'kunde' when 'berichte' then 'bericht' when 'rechnungen' then 'rechnung' else 'beleg' end as art, id
        from daten where not geloescht and sammlung in ('kunden', 'berichte', 'rechnungen', 'belege')
      )
      insert into ablage (art, ref) select art, id from q
      on conflict (art, ref) do update set status = 'offen', versuche = 0, fehler = null, naechster = now()
      returning 1 as n`;
    await protokolliere(anfrage.benutzer!.name, "SharePoint", `Ablage nachholen: ${n.length} Dokumente`);
    return { anzahl: n.length };
  });

  app.post("/api/ablage/wiederholen", { preHandler: brauche("admin") }, async () => {
    const z = await sql`update ablage set status = 'offen', versuche = 0, naechster = now() where status = 'fehler' or (status = 'offen' and fehler is not null) returning 1`;
    void abarbeiten();
    return { anzahl: z.length };
  });

  app.post("/api/ablage/freischalten", { preHandler: brauche("admin") }, async (anfrage, antwort) => {
    try {
      await freischalten();
    } catch (e) {
      return antwort.code(502).send({ fehler: (e as Error).message.replace("keinen Zugriff auf die SharePoint-Website", "noch keine Berechtigung „Sites.FullControl.All“ (nur für diesen einen Schritt nötig)") });
    }
    await protokolliere(anfrage.benutzer!.name, "SharePoint", "Schreibrecht für N-Flow auf der Website eingerichtet");
    return spStatus();
  });

  /** Link zum abgelegten Dokument für die Oberfläche */
  app.get<{ Querystring: { art?: string; ref?: string } }>("/api/ablage/link", { preHandler: brauche() }, async (anfrage) => {
    const [z] = await sql<{ url: string | null; status: string }[]>`select url, status from ablage where art = ${anfrage.query.art ?? ""} and ref = ${anfrage.query.ref ?? ""}`;
    return { url: z?.url ?? null, status: z?.status ?? null };
  });

  /** PDF direkt herunterladen (gleich wie in SharePoint) */
  app.get<{ Params: { art: DruckArt; id: string } }>("/api/druck/:art/:id", {
    preHandler: async (anfrage, antwort) => {
      const recht = DRUCK_RECHT[anfrage.params.art];
      if (!recht) return antwort.code(404).send({ fehler: "Unbekannt." });
      return brauche(recht)(anfrage, antwort);
    },
  }, async (anfrage, antwort) => {
    try {
      const pdf = await pdfErzeugen(anfrage.params.art, anfrage.params.id);
      return antwort.type("application/pdf").header("content-disposition", `inline; filename="${anfrage.params.id.replace(/[^\w.-]/g, "_")}.pdf"`).send(pdf);
    } catch (e) {
      return antwort.code(502).send({ fehler: (e as Error).message });
    }
  });
}
