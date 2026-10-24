import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import { config } from "./config.js";

/**
 * PDFs auf dem Server: Ein unsichtbarer Chromium öffnet die Büro-Oberfläche im Druckmodus
 * (/buero/?druck=…) und speichert die Seite als PDF. So sehen Bericht und Rechnung genau aus
 * wie beim „Drucken / PDF“ im Büro.
 *
 * Anmeldung: Der Browser bekommt ein Cookie mit einem Schlüssel, den nur dieser Prozess kennt.
 * Damit darf er ausschließlich lesen (siehe benutzerLaden in sitzung.ts).
 */

export const DRUCK_COOKIE = "nflow_druck";
export const druckSchluessel = randomBytes(32).toString("base64url");
export const DRUCK_BENUTZER = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "N-Flow Ablage",
  email: "",
  kuerzel: "NF",
  rolle: "Geschäftsführung" as const,
};

export type DruckArt = "bericht" | "rechnung" | "kunde" | "mahnung" | "belegliste";

const PFAD = () => process.env.CHROMIUM_PFAD || ["/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => existsSync(p)) || "chromium";
let browser: Promise<Browser> | null = null;
let ruhe: NodeJS.Timeout | null = null;
let kette: Promise<unknown> = Promise.resolve();

function starten(): Promise<Browser> {
  browser ??= puppeteer.launch({
    executablePath: PFAD(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  }).then((b) => {
    b.on("disconnected", () => { browser = null; });
    return b;
  }, (e) => { browser = null; throw new Error("PDF-Erzeugung nicht möglich, Chromium startet nicht: " + (e as Error).message); });
  return browser;
}

/** Nach 5 Minuten ohne Druckauftrag schließen, damit der Speicher frei wird */
function ruheplanen() {
  if (ruhe) clearTimeout(ruhe);
  ruhe = setTimeout(async () => { const b = browser; browser = null; if (b) (await b).close().catch(() => {}); }, 5 * 60_000);
}

/** Erzeugt ein PDF. Aufträge laufen nacheinander, damit der Server nicht überlastet. */
export function pdfErzeugen(art: DruckArt, id: string, optionen: { ohneFotos?: boolean } = {}): Promise<Buffer> {
  const lauf = kette.then(() => einPdf(art, id, optionen));
  kette = lauf.catch(() => {});
  return lauf;
}

async function einPdf(art: DruckArt, id: string, optionen: { ohneFotos?: boolean }): Promise<Buffer> {
  const b = await starten();
  const seite = await b.newPage();
  try {
    const basis = `http://127.0.0.1:${config.port}`;
    await seite.setCookie({ name: DRUCK_COOKIE, value: druckSchluessel, url: basis, httpOnly: true });
    const q = new URLSearchParams({ druck: art, id, ...(optionen.ohneFotos ? { ohneFotos: "1" } : {}) });
    await seite.goto(`${basis}/buero/?${q}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await seite.waitForFunction("window.NF_DRUCK && window.NF_DRUCK.fertig", { timeout: 60_000 });
    const fehler = await seite.evaluate("window.NF_DRUCK.fehler || ''");
    if (fehler) throw new Error(String(fehler));
    await seite.emulateMediaType("print");
    const pdf = await seite.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 60_000 });
    return Buffer.from(pdf);
  } finally {
    await seite.close().catch(() => {});
    ruheplanen();
  }
}

export async function druckBeenden(): Promise<void> {
  const b = browser;
  browser = null;
  if (b) await (await b).close().catch(() => {});
}
