import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { sql } from "../db.js";
import { protokolliere } from "../protokoll.js";
import { rechteLaden, type Recht } from "../rechte.js";
import { brauche, type Benutzer } from "../sitzung.js";

/**
 * Gemeinsamer Datenspeicher für Büro und Monteur-App.
 * Jede Sammlung hat eigene Regeln, wer lesen, schreiben und löschen darf.
 * „eigen“ heißt: Wer das Recht „Plantafel“ nicht hat, sieht und ändert nur Datensätze mit tech = eigene ID.
 */

type Daten = Record<string, unknown>;
export type Kreis = "A" | "SB" | "RE" | "NV" | "K";

interface Regel {
  lesen: Recht;
  schreiben: Recht;
  loeschen: Recht;
  eigen?: boolean;
  kreis?: Kreis;
  schluessel?: string;
}

export const SAMMLUNGEN: Record<string, Regel> = {
  kunden: { lesen: "eigene", schreiben: "eigene", loeschen: "admin", kreis: "K", schluessel: "nr" },
  anlagen: { lesen: "eigene", schreiben: "eigene", loeschen: "admin", kreis: "NV", schluessel: "nv" },
  auftraege: { lesen: "eigene", schreiben: "eigene", loeschen: "planung", kreis: "A", schluessel: "id" },
  berichte: { lesen: "eigene", schreiben: "eigene", loeschen: "admin", kreis: "SB", schluessel: "sb" },
  rechnungen: { lesen: "rechnungen", schreiben: "rechnungen", loeschen: "admin", kreis: "RE", schluessel: "re" },
  abwesenheiten: { lesen: "eigene", schreiben: "eigene", loeschen: "planung", eigen: true, schluessel: "id" },
  belege: { lesen: "eigene", schreiben: "eigene", loeschen: "planung", eigen: true, schluessel: "id" },
  zeiten: { lesen: "eigene", schreiben: "eigene", loeschen: "planung", eigen: true },
  bestaetigungen: { lesen: "eigene", schreiben: "eigene", loeschen: "admin", eigen: true },
  artikel: { lesen: "eigene", schreiben: "preise", loeschen: "preise" },
  arbeitsmittel: { lesen: "eigene", schreiben: "planung", loeschen: "planung" },
  kontakte: { lesen: "eigene", schreiben: "eigene", loeschen: "eigene" },
  einstellungen: { lesen: "eigene", schreiben: "admin", loeschen: "admin" },
};

/** Einstellungen: „preise“ (Preise, Warnungen) nur mit Recht „preise“, „allgemein“ für alle lesbar. */
function regelFuer(sammlung: string, id?: string): Regel | null {
  const r = SAMMLUNGEN[sammlung];
  if (!r) return null;
  if (sammlung === "einstellungen" && id === "preise") return { ...r, lesen: "preise", schreiben: "preise" };
  return r;
}

const FORMAT: Record<Kreis, (n: number, jahr: number) => string> = {
  A: (n, j) => `A-${j}-${String(n).padStart(4, "0")}`,
  SB: (n, j) => `SB-${j}-${String(n).padStart(4, "0")}`,
  RE: (n, j) => `RE-${j}-${String(n).padStart(4, "0")}`,
  NV: (n) => `NV-${String(n).padStart(5, "0")}`,
  K: (n) => `K-${10000 + n}`,
};
const MIT_JAHR: Record<Kreis, boolean> = { A: true, SB: true, RE: true, NV: false, K: false };

/** Zieht fortlaufende Nummern. Rechnungsnummern nur einzeln beim Anlegen (lückenlos). */
export async function nummernZiehen(kreis: Kreis, anzahl: number, db: typeof sql = sql): Promise<string[]> {
  const jahr = MIT_JAHR[kreis] ? new Date().getFullYear() : 0;
  const [z] = await db<{ letzte: number }[]>`
    insert into nummernkreise (kreis, jahr, letzte) values (${kreis}, ${jahr}, ${anzahl})
    on conflict (kreis, jahr) do update set letzte = nummernkreise.letzte + ${anzahl}
    returning letzte`;
  const bis = z.letzte;
  return Array.from({ length: anzahl }, (_, i) => FORMAT[kreis](bis - anzahl + 1 + i, jahr || new Date().getFullYear()));
}

type Rechte = Record<Recht, boolean>;

/** Prüft fachlich, ob die Person diese Änderung machen darf. Gibt eine Fehlermeldung oder null zurück. */
function pruefe(s: string, b: Benutzer, r: Rechte, alt: Daten | null, neu: Daten): string | null {
  const ich = b.id;
  const tech = (d: Daten | null) => (d ? (d.tech as string | null | undefined) ?? null : null);

  if (SAMMLUNGEN[s].eigen && !r.planung) {
    if (alt && tech(alt) !== ich) return "Das ist nicht dein Eintrag.";
    if (tech(neu) !== ich) return "Das ist nicht dein Eintrag.";
    if ((s === "abwesenheiten" || s === "belege") && neu.status !== ((alt?.status as string) ?? "offen")) {
      return "Genehmigen kann nur das Büro.";
    }
  }
  if (s === "auftraege" && !r.planung) {
    if (alt && tech(alt) !== ich) return "Dieser Auftrag ist nicht dir zugeordnet.";
    if (tech(neu) !== null && tech(neu) !== ich) return "Aufträge anderen zuordnen kann nur das Büro.";
  }
  if (s === "berichte" && !r.berichte_pruefen) {
    if (alt && (tech(alt) !== ich || alt.status !== "neu")) return "Der Bericht ist schon im Büro in Bearbeitung.";
    if (neu.status !== "neu") return "Berichte prüfen kann nur das Büro.";
    if (tech(neu) !== ich) return "Berichte nur für dich selbst.";
  }
  if (s === "anlagen" && !r.planung && alt) {
    // Vertragsdaten und Pool-Zuordnung bestimmt das Büro
    for (const k of ["betreuer", "pausch", "vertrag", "zyk"]) neu[k] = alt[k];
  }
  return null;
}

interface Zeile {
  id: string;
  version: number;
  daten: Daten;
  geloescht: boolean;
  geaendert_am: string;
  geaendert_von: string;
}

const KURZ = new Set(["berichte"]);

function auswahl(s: string, kurz: boolean) {
  // Bei „kurz“ fehlen die Detaildaten der Berichte (Messwerte usw.), die Liste bleibt schlank
  return kurz && KURZ.has(s) ? sql`daten - 'daten' as daten` : sql`daten`;
}

export async function datenRouten(app: FastifyInstance): Promise<void> {
  const rechteVon = async (b: Benutzer) => (await rechteLaden())[b.rolle];

  async function lesbar(b: Benutzer, liste: string[]) {
    const r = await rechteVon(b);
    return { r, erlaubt: liste.filter((s) => SAMMLUNGEN[s] && r[SAMMLUNGEN[s].lesen]) };
  }

  async function laden(b: Benutzer, r: Rechte, s: string, kurz: boolean, seit?: string) {
    const regel = SAMMLUNGEN[s];
    const nurEigene = regel.eigen && !r.planung;
    const zeilen = await sql<Zeile[]>`
      select id, version, ${auswahl(s, kurz)}, geloescht, geaendert_am::text as geaendert_am, geaendert_von
      from daten
      where sammlung = ${s}
        ${seit ? sql`and geaendert_am > ${seit}::timestamptz` : sql`and not geloescht`}
        ${nurEigene ? sql`and daten->>'tech' = ${b.id}` : sql``}
      order by id`;
    // Preise nur für Berechtigte
    if (s === "einstellungen" && !r.preise) return zeilen.filter((z) => z.id !== "preise");
    return zeilen;
  }

  app.get<{ Querystring: { s?: string; kurz?: string } }>("/api/daten", { preHandler: brauche() }, async (anfrage) => {
    const b = anfrage.benutzer!;
    const { r, erlaubt } = await lesbar(b, (anfrage.query.s ?? "").split(",").filter(Boolean));
    const [{ stand }] = await sql<{ stand: string }[]>`select clock_timestamp()::text as stand`;
    const sammlungen: Record<string, Zeile[]> = {};
    for (const s of erlaubt) sammlungen[s] = await laden(b, r, s, anfrage.query.kurz === "1");
    return { stand, sammlungen };
  });

  app.get<{ Querystring: { s?: string; seit?: string; kurz?: string } }>(
    "/api/daten/aenderungen",
    { preHandler: brauche() },
    async (anfrage, antwort) => {
      const b = anfrage.benutzer!;
      const seit = anfrage.query.seit;
      if (!seit) return antwort.code(400).send({ fehler: "seit fehlt" });
      const { r, erlaubt } = await lesbar(b, (anfrage.query.s ?? "").split(",").filter(Boolean));
      const [{ stand }] = await sql<{ stand: string }[]>`select clock_timestamp()::text as stand`;
      const sammlungen: Record<string, Zeile[]> = {};
      for (const s of erlaubt) {
        const z = await laden(b, r, s, anfrage.query.kurz === "1", seit);
        if (z.length) sammlungen[s] = z;
      }
      return { stand, sammlungen };
    },
  );

  app.get<{ Params: { s: string; id: string } }>("/api/daten/:s/:id", { preHandler: brauche() }, async (anfrage, antwort) => {
    const { s, id } = anfrage.params;
    const regel = regelFuer(s, id);
    if (!regel) return antwort.code(404).send({ fehler: "Unbekannte Sammlung." });
    const b = anfrage.benutzer!;
    const r = await rechteVon(b);
    if (!r[regel.lesen]) return antwort.code(403).send({ fehler: "Dafür fehlt die Berechtigung." });
    const [z] = await sql<Zeile[]>`
      select id, version, daten, geloescht, geaendert_am::text as geaendert_am, geaendert_von
      from daten where sammlung = ${s} and id = ${id}`;
    if (!z || z.geloescht) return antwort.code(404).send({ fehler: "Nicht gefunden." });
    if (regel.eigen && !r.planung && z.daten.tech !== b.id) return antwort.code(403).send({ fehler: "Nicht deiner." });
    return z;
  });

  /** Anlegen oder Ändern. Es werden nur die mitgeschickten Felder überschrieben. */
  async function speichern(b: Benutzer, s: string, id: string, teil: Daten, anlegenErlaubt: boolean) {
    const regel = regelFuer(s, id);
    if (!regel) return { code: 404, fehler: "Unbekannte Sammlung." };
    if (!teil || typeof teil !== "object" || Array.isArray(teil)) return { code: 400, fehler: "Ungültige Daten." };
    if (JSON.stringify(teil).length > 2_000_000) return { code: 413, fehler: "Datensatz zu groß. Fotos bitte als Datei hochladen." };
    const r = await rechteVon(b);
    if (!r[regel.schreiben]) return { code: 403, fehler: "Dafür fehlt die Berechtigung." };

    return sql.begin(async (tx) => {
      const [alt] = await tx<Zeile[]>`
        select id, version, daten, geloescht from daten where sammlung = ${s} and id = ${id} for update`;
      const altDaten = alt && !alt.geloescht ? alt.daten : null;
      if (!altDaten && !anlegenErlaubt) return { code: 404, fehler: "Nicht gefunden." };
      const neu: Daten = { ...(altDaten ?? {}), ...teil };
      if (regel.schluessel) neu[regel.schluessel] = id;
      // Kunden-PIN für die Historie hinter dem QR-Aufkleber
      if (s === "anlagen" && !neu.pin) neu.pin = String(randomInt(100000, 1000000));
      const fehler = pruefe(s, b, r, altDaten, neu);
      if (fehler) return { code: 403, fehler };
      try {
        const [z] = await tx<Zeile[]>`
          insert into daten (sammlung, id, daten, geaendert_von)
          values (${s}, ${id}, ${tx.json(neu as never)}, ${b.name})
          on conflict (sammlung, id) do update set
            daten = excluded.daten, version = daten.version + 1, geloescht = false,
            geaendert_am = clock_timestamp(), geaendert_von = excluded.geaendert_von
          returning id, version, daten, geloescht, geaendert_am::text as geaendert_am, geaendert_von`;
        if (!altDaten && ["kunden", "anlagen", "rechnungen"].includes(s)) {
          await protokolliere(b.name, { kunden: "Kunde angelegt", anlagen: "Anlage angelegt", rechnungen: "Rechnung erstellt" }[s]!,
            `${id}${neu.name1 ? " · " + neu.name1 : ""}`);
        } else if (s === "rechnungen" && teil.status && teil.status !== altDaten?.status) {
          await protokolliere(b.name, "Rechnung " + String(teil.status), id);
        } else if (s === "einstellungen") {
          await protokolliere(b.name, id === "preise" ? "Preise geändert" : "Einstellungen geändert", Object.keys(teil).join(", "));
        }
        return { code: 200, zeile: z };
      } catch (err) {
        if ((err as { code?: string }).code === "23505") return { code: 409, fehler: "Dieser QR-Aufkleber ist schon einer anderen Anlage zugeordnet." };
        throw err;
      }
    });
  }

  app.put<{ Params: { s: string; id: string }; Body: { daten: Daten } }>(
    "/api/daten/:s/:id",
    { preHandler: brauche() },
    async (anfrage, antwort) => {
      // Rechnungen bekommen ihre Nummer nur über POST, damit der Nummernkreis lückenlos bleibt
      const anlegen = anfrage.params.s !== "rechnungen";
      const e = await speichern(anfrage.benutzer!, anfrage.params.s, anfrage.params.id, anfrage.body?.daten, anlegen);
      return "zeile" in e ? e.zeile : antwort.code(e.code).send({ fehler: e.fehler });
    },
  );

  app.patch<{ Params: { s: string; id: string }; Body: { daten: Daten } }>(
    "/api/daten/:s/:id",
    { preHandler: brauche() },
    async (anfrage, antwort) => {
      const e = await speichern(anfrage.benutzer!, anfrage.params.s, anfrage.params.id, anfrage.body?.daten, false);
      return "zeile" in e ? e.zeile : antwort.code(e.code).send({ fehler: e.fehler });
    },
  );

  /** Anlegen mit Nummer vom Server (z. B. Rechnungen, lückenlos). */
  app.post<{ Params: { s: string }; Body: { daten: Daten } }>("/api/daten/:s", { preHandler: brauche() }, async (anfrage, antwort) => {
    const regel = SAMMLUNGEN[anfrage.params.s];
    if (!regel?.kreis) return antwort.code(400).send({ fehler: "Für diese Sammlung gibt es keinen Nummernkreis." });
    const r = await rechteVon(anfrage.benutzer!);
    if (!r[regel.schreiben]) return antwort.code(403).send({ fehler: "Dafür fehlt die Berechtigung." });
    const [id] = await nummernZiehen(regel.kreis, 1);
    const e = await speichern(anfrage.benutzer!, anfrage.params.s, id, anfrage.body?.daten, true);
    return "zeile" in e ? e.zeile : antwort.code(e.code).send({ fehler: e.fehler });
  });

  app.delete<{ Params: { s: string; id: string } }>("/api/daten/:s/:id", { preHandler: brauche() }, async (anfrage, antwort) => {
    const { s, id } = anfrage.params;
    const regel = regelFuer(s, id);
    if (!regel) return antwort.code(404).send({ fehler: "Unbekannte Sammlung." });
    const b = anfrage.benutzer!;
    const r = await rechteVon(b);
    const [alt] = await sql<Zeile[]>`select daten from daten where sammlung = ${s} and id = ${id} and not geloescht`;
    if (!alt) return { ok: true };
    const eigenerPoolTermin = s === "auftraege" && alt.daten.tech === b.id && String(alt.daten.quelle ?? "").startsWith("Wartungspool");
    const eigenerEintrag = regel.eigen && alt.daten.tech === b.id && alt.daten.status !== "genehmigt";
    if (!r[regel.loeschen] && !eigenerPoolTermin && !eigenerEintrag) {
      return antwort.code(403).send({ fehler: "Löschen darf nur die Administration." });
    }
    await sql`
      update daten set geloescht = true, version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${b.name}
      where sammlung = ${s} and id = ${id}`;
    if (!["kontakte", "zeiten"].includes(s) && !eigenerPoolTermin) await protokolliere(b.name, "Datensatz gelöscht", `${s}: ${id}`);
    return { ok: true };
  });

  /** Nummern vorab holen, damit die App auch ohne Netz Berichte und Aufträge anlegen kann. */
  app.post<{ Body: { kreis: Kreis; anzahl?: number } }>("/api/nummern", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    const { kreis } = anfrage.body ?? ({} as { kreis: Kreis });
    if (!["A", "SB", "NV", "K"].includes(kreis)) return antwort.code(400).send({ fehler: "Unbekannter Nummernkreis." });
    const anzahl = Math.min(20, Math.max(1, Number(anfrage.body.anzahl ?? 5)));
    return { nummern: await nummernZiehen(kreis, anzahl) };
  });
}
