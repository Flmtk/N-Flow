import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./db.js";

/**
 * Einheitliches Aussehen aller E-Mails aus N-Flow: Logo, klarer Text, Info-Kasten,
 * Grußformel und Impressum wie bei normalen Mails der Firma.
 * HTML mit Tabellen und Inline-Stilen, damit es auch in Outlook sauber aussieht.
 */

export const VON_INFO = () => (process.env.MAIL_VON_INFO || "info@novis-anlagentechnik.de").trim();
export const VON_RECHNUNG = () => (process.env.MAIL_VON_RECHNUNG || "rechnung@novis-anlagentechnik.de").trim();

export const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let logo: Buffer | null = null;
export function logoPng(): Buffer | null {
  if (logo) return logo;
  try {
    logo = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/img/novis-logo-mail.png"));
  } catch { logo = null; }
  return logo;
}

export interface Firma { tel: string; hrb: string; ust: string; iban: string }
export async function firmaLaden(): Promise<Firma> {
  const [z] = await sql<{ d: Record<string, unknown> }[]>`select daten as d from daten where sammlung = 'einstellungen' and id = 'allgemein'`;
  const f = ((z?.d?.firma ?? {}) as Record<string, string>);
  return { tel: f.tel || "", hrb: f.hrb || "", ust: f.ust || "", iban: f.iban || "" };
}

export interface Vorlage {
  titel: string;                       // Überschrift in der Mail
  anrede?: string;
  absaetze: string[];                  // bereits HTML-sicher (mit esc() gebaut)
  fakten?: [string, string][];         // Info-Kasten: Bezeichnung, Wert (Wert bereits HTML-sicher)
  nachher?: string[];                  // Absätze nach dem Kasten
  tabelle?: { kopf: string[]; zeilen: string[][]; rechts?: number[] };
  gruss?: string;                      // Standard: Service-Team
  absender: string;                    // E-Mail-Adresse im Impressum
  firma: Firma;
  intern?: boolean;                    // interne Mail: ohne Werbung, kürzeres Impressum
}

const F = "font-family:'Segoe UI',Helvetica,Arial,sans-serif;";
const DUNKEL = "#1F1E1D", GRAU = "#6A6A67", LINIE = "#E4E4E1", ORANGE = "#E9660F";

export function mailHtml(v: Vorlage): string {
  const p = (t: string) => `<p style="margin:0 0 14px;${F}font-size:15px;line-height:1.6;color:${DUNKEL}">${t}</p>`;
  const fakten = v.fakten?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;background:#F7F7F5;border-radius:10px;border-left:3px solid ${ORANGE}">
${v.fakten.map(([k, w], i) => `<tr><td style="padding:${i ? 4 : 14}px 16px ${i === v.fakten!.length - 1 ? 14 : 4}px;${F}font-size:13px;color:${GRAU};width:150px;vertical-align:top">${esc(k)}</td><td style="padding:${i ? 4 : 14}px 16px ${i === v.fakten!.length - 1 ? 14 : 4}px 0;${F}font-size:15px;color:${DUNKEL};font-weight:600;vertical-align:top">${w}</td></tr>`).join("\n")}
</table>` : "";
  const tabelle = v.tabelle
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;border-collapse:collapse">
<tr>${v.tabelle.kopf.map((k, i) => `<th style="${F}font-size:12px;font-weight:600;color:${GRAU};text-align:${v.tabelle!.rechts?.includes(i) ? "right" : "left"};padding:6px 8px;border-bottom:1px solid ${LINIE}">${esc(k)}</th>`).join("")}</tr>
${v.tabelle.zeilen.map((z) => `<tr>${z.map((c, i) => `<td style="${F}font-size:14px;color:${DUNKEL};text-align:${v.tabelle!.rechts?.includes(i) ? "right" : "left"};padding:8px;border-bottom:1px solid #EFEFED;vertical-align:top">${c}</td>`).join("")}</tr>`).join("\n")}
</table>` : "";
  const f = v.firma;
  const register = [f.hrb ? `Amtsgericht Hanau, HRB ${esc(f.hrb)}` : "Handelsregistereintrag beantragt", f.ust ? `USt-IdNr. ${esc(f.ust)}` : ""].filter(Boolean).join(" · ");
  const impressum = `<b style="color:${DUNKEL}">NOVIS Anlagentechnik GmbH i. G.</b><br>
Bornweg 34a · 63599 Biebergemünd<br>
${f.tel ? `Telefon ${esc(f.tel)} · ` : ""}<a href="mailto:${esc(v.absender)}" style="color:${GRAU}">${esc(v.absender)}</a> · <a href="https://www.novis-anlagentechnik.de" style="color:${GRAU}">www.novis-anlagentechnik.de</a><br>
Geschäftsführer: Jens Röll, Florian Pötzsch<br>
${register}`;
  const bild = logoPng() ? `<img src="cid:novislogo" width="168" height="64" alt="NOVIS Anlagentechnik" style="display:block;border:0;width:168px;height:64px">` : `<b style="${F}font-size:22px;letter-spacing:.08em;color:${DUNKEL}">NOVIS</b>`;
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.titel)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${LINIE};border-radius:12px">
<tr><td style="padding:28px 32px 18px">${bild}</td></tr>
<tr><td style="padding:0 32px"><div style="height:2px;line-height:2px;font-size:0;background:${ORANGE}">&nbsp;</div></td></tr>
<tr><td style="padding:26px 32px 10px">
<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:22px;line-height:1.3;color:${DUNKEL}">${esc(v.titel)}</h1>
${v.anrede ? p(esc(v.anrede)) : ""}
${v.absaetze.map(p).join("\n")}
${fakten}${tabelle}
${(v.nachher ?? []).map(p).join("\n")}
${p(`Mit freundlichen Grüßen<br><b>${esc(v.gruss ?? "Ihr Service-Team der NOVIS Anlagentechnik")}</b>`)}
</td></tr>
<tr><td style="padding:18px 32px 26px;border-top:1px solid #EDEDEA;${F}font-size:12px;line-height:1.6;color:${GRAU}">
${impressum}
${v.intern ? `<br><span style="color:#9A9A96">Automatisch erstellt von N-Flow.</span>` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
