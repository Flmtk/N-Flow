/**
 * Konfiguration aus Umgebungsvariablen (.env auf dem Server).
 * Fehlt etwas Wichtiges, bricht der Start mit einer verständlichen Meldung ab.
 */

function pflicht(name: string): string {
  const wert = process.env[name];
  if (!wert || wert.trim() === "") {
    throw new Error(`Umgebungsvariable ${name} fehlt. Bitte in der .env-Datei eintragen.`);
  }
  return wert.trim();
}

function optional(name: string, standard = ""): string {
  return (process.env[name] ?? standard).trim();
}

const produktion = process.env.NODE_ENV === "production";

export const config = {
  produktion,
  port: Number(optional("PORT", "3000")),
  /** Öffentliche Adresse ohne Schrägstrich am Ende, z. B. https://test.novis-anlagentechnik.de */
  baseUrl: pflicht("BASE_URL").replace(/\/$/, ""),
  datenbankUrl: pflicht("DATABASE_URL"),
  /** Mindestens 32 zufällige Zeichen, signiert die Cookies */
  geheimnis: pflicht("SESSION_SECRET"),

  microsoft: {
    mandant: optional("MS_TENANT_ID"),
    clientId: optional("MS_CLIENT_ID"),
    clientSecret: optional("MS_CLIENT_SECRET"),
  },

  /**
   * E-Mail-Adressen, die sich beim ersten Mal ohne Eintrag anmelden dürfen
   * und automatisch als Geschäftsführung angelegt werden (Komma-getrennt).
   */
  startAdmins: optional("ADMIN_EMAILS")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean),

  /** Nur für die lokale Entwicklung: Anmeldung ohne Microsoft. Im Betrieb immer aus. */
  devLogin: !produktion && optional("AUTH_DEV") === "1",

  sitzungTage: Number(optional("SESSION_DAYS", "30")),
  instanz: optional("INSTANZ", "test"),
  version: optional("APP_VERSION", "0.1.0"),
};

if (config.geheimnis.length < 32) {
  throw new Error("SESSION_SECRET muss mindestens 32 Zeichen lang sein.");
}

export const microsoftAktiv = Boolean(
  config.microsoft.mandant && config.microsoft.clientId && config.microsoft.clientSecret,
);
