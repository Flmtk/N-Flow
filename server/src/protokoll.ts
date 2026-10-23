import { sql } from "./db.js";

/** Schreibt einen Eintrag ins unveränderliche Protokoll. */
export async function protokolliere(wer: string, aktion: string, details = ""): Promise<void> {
  await sql`insert into protokoll (wer, aktion, details) values (${wer}, ${aktion}, ${details})`;
}
