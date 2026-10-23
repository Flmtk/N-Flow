import type { FastifyInstance } from "fastify";
import { sql } from "../db.js";
import { protokolliere } from "../protokoll.js";
import { ROLLEN, type Rolle } from "../rechte.js";
import { brauche } from "../sitzung.js";

export const QUALIFIKATIONEN = ["Gas", "Öl", "Brenner", "Wärmepumpe", "Kältemittel (F-Gase)", "Elektro (EFKffT)"];

interface Eingabe {
  name?: string;
  email?: string;
  rolle?: Rolle;
  kuerzel?: string;
  telefon?: string;
  standort?: string;
  einsatzgebiet?: string;
  wochenstunden?: number;
  selbstkosten?: number | null;
  qualifikationen?: string[];
  farbe?: number;
  eintritt?: string | null;
  aktiv?: boolean;
}

function pruefe(e: Eingabe, neu: boolean): string | null {
  if (neu || e.name !== undefined) {
    if (!e.name || e.name.trim().split(/\s+/).length < 2) return "Bitte Vor- und Nachnamen eintragen.";
  }
  if (neu || e.email !== undefined) {
    if (!e.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email)) return "Bitte eine gültige E-Mail-Adresse eintragen.";
  }
  if (e.rolle !== undefined && !ROLLEN.includes(e.rolle)) return "Unbekannte Rolle.";
  if (e.qualifikationen?.some((q) => !QUALIFIKATIONEN.includes(q))) return "Unbekannte Qualifikation.";
  return null;
}

const SPALTEN = sql`id, kuerzel, name, email, rolle, telefon, standort, einsatzgebiet, wochenstunden::float,
  selbstkosten::float, qualifikationen, farbe, eintritt, aktiv, gesperrt, letzte_anmeldung`;

export async function mitarbeiterRouten(app: FastifyInstance): Promise<void> {
  app.get("/api/mitarbeiter", { preHandler: brauche("mitarbeiter") }, async () => ({
    mitarbeiter: await sql`select ${SPALTEN} from mitarbeiter order by aktiv desc, rolle, name`,
    qualifikationen: QUALIFIKATIONEN,
    rollen: ROLLEN,
  }));

  app.post<{ Body: Eingabe }>("/api/mitarbeiter", { preHandler: brauche("mitarbeiter") }, async (anfrage, antwort) => {
    const e = anfrage.body ?? {};
    const fehler = pruefe(e, true);
    if (fehler) return antwort.code(400).send({ fehler });
    const name = e.name!.trim();
    const kuerzel = (e.kuerzel || name.split(/\s+/).map((t) => t[0]).join("").slice(0, 2)).toUpperCase();
    try {
      const [m] = await sql`
        insert into mitarbeiter (kuerzel, name, email, rolle, telefon, standort, einsatzgebiet, wochenstunden,
          selbstkosten, qualifikationen, farbe, eintritt)
        values (${kuerzel}, ${name}, ${e.email!.trim().toLowerCase()}, ${e.rolle ?? "Monteur"}, ${e.telefon ?? ""},
          ${e.standort ?? "Biebergemünd"}, ${e.einsatzgebiet ?? ""}, ${e.wochenstunden ?? 40}, ${e.selbstkosten ?? null},
          ${e.qualifikationen ?? []}, ${e.farbe ?? 1}, ${e.eintritt || null})
        returning ${SPALTEN}`;
      await protokolliere(anfrage.benutzer!.name, "Mitarbeiter angelegt", `${name}, ${m.rolle}`);
      return m;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        return antwort.code(409).send({ fehler: "Diese E-Mail-Adresse ist schon vergeben." });
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string }; Body: Eingabe }>(
    "/api/mitarbeiter/:id",
    { preHandler: brauche("mitarbeiter") },
    async (anfrage, antwort) => {
      const e = anfrage.body ?? {};
      const fehler = pruefe(e, false);
      if (fehler) return antwort.code(400).send({ fehler });
      if (anfrage.params.id === anfrage.benutzer!.id && e.rolle && e.rolle !== "Geschäftsführung" && anfrage.benutzer!.rolle === "Geschäftsführung") {
        return antwort.code(400).send({ fehler: "Die eigene Rolle als Geschäftsführung kann man nicht selbst herabsetzen." });
      }
      const erlaubt = ["name", "email", "rolle", "kuerzel", "telefon", "standort", "einsatzgebiet", "wochenstunden",
        "selbstkosten", "qualifikationen", "farbe", "eintritt", "aktiv"] as const;
      const werte: Record<string, unknown> = {};
      for (const k of erlaubt) if (e[k] !== undefined) werte[k] = k === "email" ? String(e[k]).toLowerCase() : e[k];
      if (!Object.keys(werte).length) return antwort.code(400).send({ fehler: "Keine Änderungen." });
      const [m] = await sql`
        update mitarbeiter set ${sql(werte)}, geaendert_am = now() where id = ${anfrage.params.id}
        returning ${SPALTEN}`;
      if (!m) return antwort.code(404).send({ fehler: "Mitarbeiter nicht gefunden." });
      await protokolliere(anfrage.benutzer!.name, "Mitarbeiter bearbeitet", `${m.name}: ${Object.keys(werte).join(", ")}`);
      return m;
    },
  );

  /** Sperren wirkt sofort: alle Sitzungen der Person werden beendet. */
  app.post<{ Params: { id: string }; Body: { gesperrt: boolean } }>(
    "/api/mitarbeiter/:id/sperre",
    { preHandler: brauche("mitarbeiter") },
    async (anfrage, antwort) => {
      if (anfrage.params.id === anfrage.benutzer!.id) return antwort.code(400).send({ fehler: "Den eigenen Zugang kann man nicht sperren." });
      const gesperrt = Boolean(anfrage.body?.gesperrt);
      const [m] = await sql<{ name: string }[]>`
        update mitarbeiter set gesperrt = ${gesperrt}, geaendert_am = now() where id = ${anfrage.params.id} returning name`;
      if (!m) return antwort.code(404).send({ fehler: "Mitarbeiter nicht gefunden." });
      if (gesperrt) await sql`delete from sitzungen where mitarbeiter_id = ${anfrage.params.id}`;
      await protokolliere(anfrage.benutzer!.name, gesperrt ? "Zugang gesperrt" : "Zugang entsperrt", m.name);
      return { ok: true };
    },
  );

  /** Alle Anmeldungen beenden, z. B. nach Verlust des Handys. Die Person meldet sich neu an. */
  app.post<{ Params: { id: string } }>("/api/mitarbeiter/:id/abmelden", { preHandler: brauche("mitarbeiter") }, async (anfrage) => {
    const r = await sql`delete from sitzungen where mitarbeiter_id = ${anfrage.params.id}`;
    const [m] = await sql<{ name: string }[]>`select name from mitarbeiter where id = ${anfrage.params.id}`;
    await protokolliere(anfrage.benutzer!.name, "Anmeldungen beendet", `${m?.name ?? anfrage.params.id}: ${r.count} Geräte`);
    return { ok: true, geraete: r.count };
  });

  /** Austritt: Zugang sperren, Wartungspool übergeben, künftige Termine zurück nach „Einzuplanen“. */
  app.post<{ Params: { id: string }; Body: { uebergabeAn?: string | null } }>(
    "/api/mitarbeiter/:id/austritt",
    { preHandler: brauche("mitarbeiter") },
    async (anfrage, antwort) => {
      const id = anfrage.params.id;
      if (id === anfrage.benutzer!.id) return antwort.code(400).send({ fehler: "Den eigenen Austritt kann man nicht selbst eintragen." });
      const an = anfrage.body?.uebergabeAn || null;
      const ergebnis = await sql.begin(async (tx) => {
        const [m] = await tx<{ name: string }[]>`
          update mitarbeiter set aktiv = false, gesperrt = true, geaendert_am = now() where id = ${id} returning name`;
        if (!m) return null;
        const pool = await tx`
          update daten set daten = jsonb_set(daten, '{betreuer}', coalesce(to_jsonb(${an}::text), 'null'::jsonb)),
            version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${anfrage.benutzer!.name}
          where sammlung = 'anlagen' and not geloescht and daten->>'betreuer' = ${id}`;
        const termine = await tx`
          update daten set daten = daten || '{"tech": null, "date": null, "time": null, "status": "offen"}'::jsonb,
            version = version + 1, geaendert_am = clock_timestamp(), geaendert_von = ${anfrage.benutzer!.name}
          where sammlung = 'auftraege' and not geloescht and daten->>'tech' = ${id}
            and daten->>'status' = 'geplant' and daten->>'date' >= to_char(current_date, 'YYYY-MM-DD')`;
        await tx`delete from sitzungen where mitarbeiter_id = ${id}`;
        return { name: m.name, anlagen: pool.count, termine: termine.count };
      });
      if (!ergebnis) return antwort.code(404).send({ fehler: "Mitarbeiter nicht gefunden." });
      let ziel = "ohne Monteur";
      if (an) {
        const [z] = await sql<{ name: string }[]>`select name from mitarbeiter where id = ${an}`;
        ziel = z ? `an ${z.name}` : ziel;
      }
      await protokolliere(anfrage.benutzer!.name, "Austritt",
        `${ergebnis.name}: Zugang gesperrt, ${ergebnis.anlagen} Anlagen ${ziel}, ${ergebnis.termine} Termine zurück in Einzuplanen`);
      return ergebnis;
    },
  );
}
