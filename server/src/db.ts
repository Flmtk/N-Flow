import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";

export const sql = postgres(config.datenbankUrl, {
  max: 10,
  idle_timeout: 30,
  onnotice: () => {},
});

const migrationsOrdner = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

/**
 * Spielt alle noch nicht ausgeführten SQL-Dateien aus server/migrations in
 * alphabetischer Reihenfolge ein. Jede Datei läuft in einer eigenen Transaktion.
 * Läuft bei jedem Start, damit ein Update die Datenbank automatisch anpasst.
 */
export async function migrieren(log: (t: string) => void = console.log): Promise<void> {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      eingespielt_am timestamptz not null default now()
    )`;

  // Verhindert, dass zwei Instanzen gleichzeitig migrieren (Sperre auf einer festen Verbindung)
  const verbindung = await sql.reserve();
  await verbindung`select pg_advisory_lock(424242)`;
  try {
    const erledigt = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
    );
    const dateien = (await readdir(migrationsOrdner)).filter((d) => d.endsWith(".sql")).sort();

    for (const datei of dateien) {
      if (erledigt.has(datei)) continue;
      const inhalt = await readFile(path.join(migrationsOrdner, datei), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(inhalt);
        await tx`insert into schema_migrations (name) values (${datei})`;
      });
      log(`Migration eingespielt: ${datei}`);
    }
  } finally {
    await verbindung`select pg_advisory_unlock(424242)`;
    verbindung.release();
  }
}
