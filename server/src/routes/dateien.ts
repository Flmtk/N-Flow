import type { FastifyInstance } from "fastify";
import { sql } from "../db.js";
import { brauche } from "../sitzung.js";

const TYPEN = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fotos, Unterschriften, Anlagenschemata und Belege.
 * Die App vergibt die ID selbst (UUID), damit ein Bericht schon offline auf seine Fotos verweisen kann.
 * Das Hochladen ist wiederholbar: dieselbe ID zweimal ändert nichts.
 */
export async function dateienRouten(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(TYPEN, { parseAs: "buffer", bodyLimit: 15 * 1024 * 1024 }, (_a, body, fertig) => fertig(null, body));

  app.put<{ Params: { id: string }; Querystring: { name?: string } }>(
    "/api/dateien/:id",
    { preHandler: brauche("eigene"), bodyLimit: 15 * 1024 * 1024 },
    async (anfrage, antwort) => {
      const { id } = anfrage.params;
      const typ = String(anfrage.headers["content-type"] ?? "").split(";")[0];
      if (!UUID.test(id)) return antwort.code(400).send({ fehler: "Ungültige Datei-ID." });
      if (!TYPEN.includes(typ)) return antwort.code(415).send({ fehler: "Nur Fotos (JPEG, PNG, WebP) und PDF." });
      const inhalt = anfrage.body as Buffer;
      if (!Buffer.isBuffer(inhalt) || !inhalt.length) return antwort.code(400).send({ fehler: "Leere Datei." });
      await sql`
        insert into dateien (id, name, typ, groesse, inhalt, erstellt_von)
        values (${id}, ${(anfrage.query.name ?? "").slice(0, 200)}, ${typ}, ${inhalt.length}, ${inhalt}, ${anfrage.benutzer!.id})
        on conflict (id) do nothing`;
      return { id, groesse: inhalt.length };
    },
  );

  app.get<{ Params: { id: string } }>("/api/dateien/:id", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    if (!UUID.test(anfrage.params.id)) return antwort.code(404).send({ fehler: "Nicht gefunden." });
    const [d] = await sql<{ name: string; typ: string; inhalt: Buffer }[]>`
      select name, typ, inhalt from dateien where id = ${anfrage.params.id}`;
    if (!d) return antwort.code(404).send({ fehler: "Nicht gefunden." });
    antwort.header("Cache-Control", "private, max-age=31536000, immutable");
    if (d.name) antwort.header("Content-Disposition", `inline; filename="${encodeURIComponent(d.name)}"`);
    return antwort.type(d.typ).send(d.inhalt);
  });
}
