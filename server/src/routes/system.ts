import type { FastifyInstance } from "fastify";
import { config, microsoftAktiv } from "../config.js";
import { sql } from "../db.js";
import { protokolliere } from "../protokoll.js";
import { RECHTE, ROLLEN, rechteLaden, type Rechtematrix } from "../rechte.js";
import { brauche } from "../sitzung.js";

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

  app.get<{ Querystring: { limit?: string } }>("/api/protokoll", { preHandler: brauche("admin") }, async (anfrage) => {
    const limit = Math.min(500, Number(anfrage.query.limit ?? 200) || 200);
    return sql`select zeit, wer, aktion, details from protokoll order by id desc limit ${limit}`;
  });
}
