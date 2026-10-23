import { sql } from "./db.js";

export const ROLLEN = ["Monteur", "Innendienst", "Geschäftsführung"] as const;
export type Rolle = (typeof ROLLEN)[number];

export const RECHTE = {
  eigene: "Eigene Tour, Berichte, Zeiten",
  planung: "Plantafel und Aufträge bearbeiten",
  berichte_pruefen: "Berichte prüfen",
  rechnungen: "Rechnungen und Zahlungen",
  preise: "Preise, Warnungen, Ergebnisse",
  mitarbeiter: "Mitarbeiter verwalten",
  admin: "Administration, Datenbank, Updates",
} as const;
export type Recht = keyof typeof RECHTE;

export type Rechtematrix = Record<Rolle, Record<Recht, boolean>>;

export async function rechteLaden(): Promise<Rechtematrix> {
  const [zeile] = await sql<{ wert: Rechtematrix }[]>`
    select wert from einstellungen where schluessel = 'rechte'`;
  const m = zeile.wert;
  // Die Geschäftsführung hat immer alle Rechte, damit sich niemand aussperrt
  for (const r of Object.keys(RECHTE) as Recht[]) m["Geschäftsführung"][r] = true;
  return m;
}

export async function darf(rolle: Rolle, recht: Recht): Promise<boolean> {
  const m = await rechteLaden();
  return Boolean(m[rolle]?.[recht]);
}
