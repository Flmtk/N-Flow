import { readdir, stat, statfs, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { config, microsoftAktiv } from "../config.js";
import { sql } from "../db.js";
import { protokolliere } from "../protokoll.js";
import { RECHTE, ROLLEN, rechteLaden, type Rechtematrix } from "../rechte.js";
import { brauche } from "../sitzung.js";
import { demodatenEinspielen } from "../demodaten.js";

export async function systemRouten(app: FastifyInstance): Promise<void> {
  /** Für Docker und Traefik: läuft die App und erreicht sie die Datenbank? */
  app.get("/api/health", async (_a, antwort) => {
    try {
      await sql`select 1`;
      return { ok: true, version: config.version, instanz: config.instanz };
    } catch {
      return antwort.code(503).send({ ok: false, fehler: "Datenbank nicht erreichbar" });
    }
  });

  /** Wer bin ich, was darf ich? Grundlage für die Oberfläche. */
  app.get("/api/ich", async (anfrage) => {
    if (!anfrage.benutzer) {
      return { angemeldet: false, microsoft: microsoftAktiv, dev: config.devLogin, instanz: config.instanz, version: config.version };
    }
    const rechte = (await rechteLaden())[anfrage.benutzer.rolle];
    return { angemeldet: true, benutzer: anfrage.benutzer, rechte, instanz: config.instanz, version: config.version };
  });

  app.get("/api/rechte", { preHandler: brauche("mitarbeiter") }, async () => ({
    rollen: ROLLEN,
    rechte: RECHTE,
    matrix: await rechteLaden(),
  }));

  app.put<{ Body: Rechtematrix }>("/api/rechte", { preHandler: brauche("admin") }, async (anfrage) => {
    const neu = anfrage.body;
    const alt = await rechteLaden();
    const saubere = {} as Rechtematrix;
    const aenderungen: string[] = [];
    for (const rolle of ROLLEN) {
      saubere[rolle] = {} as Rechtematrix[typeof rolle];
      for (const r of Object.keys(RECHTE) as (keyof typeof RECHTE)[]) {
        const wert = rolle === "Geschäftsführung" ? true : Boolean(neu?.[rolle]?.[r]);
        saubere[rolle][r] = wert;
        if (alt[rolle][r] !== wert) aenderungen.push(`${rolle}: ${RECHTE[r]} ${wert ? "erlaubt" : "entzogen"}`);
      }
    }
    await sql`update einstellungen set wert = ${sql.json(saubere)}, geaendert_am = now() where schluessel = 'rechte'`;
    if (aenderungen.length) await protokolliere(anfrage.benutzer!.name, "Rechte geändert", aenderungen.join("; "));
    return { matrix: saubere };
  });

  /** Team für alle Angemeldeten: Plantafel, Empfehlung, Intranet. Selbstkosten nur mit Recht „preise“. */
  app.get("/api/team", { preHandler: brauche() }, async (anfrage) => {
    const r = (await rechteLaden())[anfrage.benutzer!.rolle];
    const liste = await sql<Record<string, unknown>[]>`
      select id, kuerzel, name, email, rolle, telefon, standort, einsatzgebiet, wochenstunden::float, selbstkosten::float,
        qualifikationen, farbe, eintritt::text, aktiv, gesperrt, letzte_anmeldung
      from mitarbeiter order by aktiv desc, rolle, name`;
    return liste.map((m) => (r.preise ? m : { ...m, selbstkosten: null }));
  });

  /** Serverzustand und Sicherungen für Administration → System */
  app.get("/api/system", { preHandler: brauche("admin") }, async () => {
    const [db] = await sql<{ groesse: string; dateien: string }[]>`
      select pg_size_pretty(pg_database_size(current_database())) as groesse,
             (select pg_size_pretty(coalesce(sum(groesse), 0)) from dateien) as dateien`;
    let platte = null;
    try {
      const f = await statfs("/");
      platte = { gesamt: f.blocks * f.bsize, frei: f.bavail * f.bsize };
    } catch { /* nicht verfügbar */ }
    return {
      version: config.version, instanz: config.instanz, node: process.version,
      laeuftSeit: Math.round(process.uptime()), serverSeit: Math.round(os.uptime()),
      speicher: { gesamt: os.totalmem(), frei: os.freemem() }, last: os.loadavg()[0], kerne: os.cpus().length,
      platte, datenbank: db.groesse, dateien: db.dateien, sicherungen: await sicherungen(),
    };
  });

  app.post("/api/system/sicherung", { preHandler: brauche("admin") }, async (anfrage, antwort) => {
    try {
      await writeFile(path.join(SICHERUNGEN, ".anstoss", "jetzt"), new Date().toISOString());
    } catch {
      return antwort.code(503).send({ fehler: "Der Sicherungsordner ist nicht erreichbar." });
    }
    await protokolliere(anfrage.benutzer!.name, "Sicherung", "manuell angestoßen");
    return { ok: true };
  });

  /** Nur Testumgebung: Beispieldaten wie in den Prototypen */
  app.post("/api/admin/demodaten", { preHandler: brauche("admin") }, async (anfrage, antwort) => {
    if (config.instanz !== "test") return antwort.code(403).send({ fehler: "Beispieldaten gibt es nur in der Testumgebung." });
    try {
      return await demodatenEinspielen(anfrage.benutzer!.name);
    } catch (e) {
      return antwort.code(409).send({ fehler: (e as Error).message });
    }
  });

  app.get<{ Querystring: { limit?: string } }>("/api/protokoll", { preHandler: brauche("admin") }, async (anfrage) => {
    const limit = Math.min(500, Number(anfrage.query.limit ?? 200) || 200);
    return sql`select zeit, wer, aktion, details from protokoll order by id desc limit ${limit}`;
  });
}

const SICHERUNGEN = process.env.SICHERUNG_PFAD || "/sicherungen";

async function sicherungen() {
  const liste: { datei: string; art: string; zeit: string; groesse: number }[] = [];
  for (const art of ["taeglich", "woechentlich", "monatlich"]) {
    try {
      for (const datei of await readdir(path.join(SICHERUNGEN, art))) {
        if (!datei.endsWith(".dump")) continue;
        const s = await stat(path.join(SICHERUNGEN, art, datei));
        liste.push({ datei, art, zeit: s.mtime.toISOString(), groesse: s.size });
      }
    } catch { /* Ordner fehlt */ }
  }
  return liste.sort((a, b) => b.zeit.localeCompare(a.zeit));
}
