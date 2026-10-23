import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import { config } from "../config.js";
import { sql } from "../db.js";
import { protokolliere } from "../protokoll.js";
import { brauche } from "../sitzung.js";
import { nummernZiehen } from "./daten.js";
import { planerIds, senden } from "../push.js";

/**
 * QR-Aufkleber an der Anlage. Im Code steht nur  <BASE_URL>/a/<zufällige Kennung>.
 * – Mitarbeiter (angemeldet): direkt in die Anlagenakte der App
 * – Kunde mit PIN: Wartungshistorie und nächste Wartung
 * – alle anderen: Störung melden, Notfallhinweise. Keine Kundendaten.
 */

type Daten = Record<string, unknown>;
const KENNUNG = /^[A-Za-z0-9]{6,16}$/;

const versuche = new Map<string, number[]>();
function zuOft(schluessel: string, max: number, fensterMin: number): boolean {
  const jetzt = Date.now();
  const liste = (versuche.get(schluessel) ?? []).filter((t) => jetzt - t < fensterMin * 60_000);
  liste.push(jetzt);
  versuche.set(schluessel, liste);
  return liste.length > max;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function anlageZu(kennung: string) {
  const [z] = await sql<{ daten: Daten }[]>`
    select daten from daten where sammlung = 'anlagen' and not geloescht and daten->>'qr' = ${kennung}`;
  return z?.daten ?? null;
}

async function firma() {
  const [z] = await sql<{ daten: Daten }[]>`select daten from daten where sammlung = 'einstellungen' and id = 'allgemein'`;
  const f = (z?.daten?.firma ?? {}) as Record<string, string>;
  return { tel: f.tel ?? "", mail: f.mail || "service@novis-anlagentechnik.de" };
}

function naechsteWartung(a: Daten, letzte: string | null): string | null {
  const basis = letzte ?? (a.letzte as string | undefined);
  if (!basis || !a.zyk) return null;
  const d = new Date(basis + "T12:00");
  d.setMonth(d.getMonth() + Number(a.zyk));
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function seite(titel: string, inhalt: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="theme-color" content="#e9660f"><title>${esc(titel)} · NOVIS Service</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap">
<style>
:root{--bg:#f6f5f3;--fl:#fff;--tx:#1d1b19;--tx2:#6b6560;--rand:#e4e0db;--ak:#e9660f;--ak2:#fdf0e6;--cr:#b3261e;--cr2:#fbe9e8;--ok:#2f7d4f;--ok2:#e7f3ec}
@media (prefers-color-scheme:dark){:root{--bg:#141312;--fl:#1d1c1a;--tx:#f1eeea;--tx2:#a39d96;--rand:#34312e;--ak:#f07a2b;--ak2:#3a2618;--cr:#f08a83;--cr2:#3a1e1c;--ok:#6cc391;--ok2:#1b2e23}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 Figtree,system-ui,sans-serif}
.w{max-width:520px;margin:0 auto;padding:20px 16px 40px;display:flex;flex-direction:column;gap:14px}
.logo{font-weight:800;font-size:22px;letter-spacing:.01em}.logo b{color:var(--ak)}
.k{background:var(--fl);border:1px solid var(--rand);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px}
h1{font-size:22px;margin:0;line-height:1.25}h2{font-size:16px;margin:0}p{margin:0}.l{color:var(--tx2);font-size:14px}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:12px;border:1px solid var(--rand);background:var(--fl);color:var(--tx);font:inherit;font-weight:700;text-decoration:none;cursor:pointer;width:100%}
.btn.h{background:var(--ak);border-color:var(--ak);color:#fff}
.not{background:var(--cr2);color:var(--cr);border-color:transparent}
label{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:600}
input,textarea{font:inherit;padding:11px 12px;border:1px solid var(--rand);border-radius:10px;background:var(--bg);color:var(--tx);width:100%}
textarea{min-height:90px;resize:vertical}.ok{background:var(--ok2);color:var(--ok);border-color:transparent}
ol{margin:0;padding-left:20px;font-size:14px}.hist div{display:flex;gap:12px;padding:8px 0;border-top:1px solid var(--rand);font-size:14px}.hist time{color:var(--tx2);min-width:84px}
.fuss{font-size:12px;color:var(--tx2);text-align:center}
</style></head><body><div class="w"><div class="logo">NOVIS <b>Service</b></div>${inhalt}
<p class="fuss">NOVIS Anlagentechnik GmbH i. G. · Bornweg 34a · 63599 Biebergemünd</p></div></body></html>`;
}

export async function oeffentlicheRouten(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { kennung: string } }>("/a/:kennung", async (anfrage, antwort) => {
    const { kennung } = anfrage.params;
    if (!KENNUNG.test(kennung)) return antwort.code(404).type("text/html").send(seite("Nicht gefunden", `<div class="k"><h1>Aufkleber nicht erkannt</h1></div>`));
    if (anfrage.benutzer) return antwort.redirect(`/app/#a=${encodeURIComponent(kennung)}`);

    const a = await anlageZu(kennung);
    const f = await firma();
    const telKnopf = f.tel ? `<a class="btn" href="tel:${esc(f.tel.replace(/[^\d+]/g, ""))}">Service anrufen · ${esc(f.tel)}</a>` : "";
    const anmelden = `<a class="btn" href="/auth/login?ziel=${encodeURIComponent("/a/" + kennung)}" style="font-weight:600">Für NOVIS-Mitarbeiter: anmelden</a>`;
    if (!a) {
      return antwort.type("text/html").send(seite("Aufkleber", `<div class="k"><h1>Dieser Aufkleber ist noch keiner Anlage zugeordnet.</h1>
        <p class="l">Er wird bei der Inbetriebnahme durch unseren Techniker zugeordnet.</p>${telKnopf}</div>${anmelden}`));
    }
    const geraet = [a.hersteller, a.typ].filter(Boolean).join(" ") || String(a.ger ?? "Heizungsanlage");
    const gas = a.en !== "Öl";
    return antwort.type("text/html").send(seite("Ihre Anlage", `
      <div class="k"><p class="l">Ihre Heizungsanlage · ${esc(a.nv)}</p><h1>${esc(geraet)}</h1>
        <p class="l">Betreut von NOVIS Anlagentechnik. Bei Fragen oder Störungen sind wir für Sie da.</p></div>
      ${gas ? `<div class="k not"><h2>Bei Gasgeruch</h2><ol><li>Kein offenes Feuer, keine Schalter betätigen.</li><li>Fenster öffnen, Haus verlassen.</li><li>Von draußen den Gasnetzbetreiber (Entstörnummer am Gaszähler) oder 112 anrufen.</li></ol></div>` : ""}
      <div class="k" id="meld"><h2>Störung melden</h2>
        <label>Ihr Name<input id="n" autocomplete="name"></label>
        <label>Telefon für Rückruf<input id="t" type="tel" autocomplete="tel"></label>
        <label>Was ist passiert?<textarea id="b" placeholder="z. B. Heizung bleibt kalt, Anzeige zeigt F28"></textarea></label>
        <button class="btn h" id="s">Störung senden</button>${telKnopf}</div>
      <div class="k" id="kunde"><h2>Wartung und Historie</h2><p class="l">Mit der PIN aus Ihrem Servicebericht sehen Sie die letzten Einsätze und die nächste Wartung.</p>
        <label>PIN<input id="p" inputmode="numeric" maxlength="6" autocomplete="off"></label><button class="btn" id="ps">Anzeigen</button></div>
      ${anmelden}
      <script>
      const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
      $("#s").onclick=async()=>{const d={name:$("#n").value.trim(),telefon:$("#t").value.trim(),text:$("#b").value.trim()};
        if(!d.name||!d.telefon||d.text.length<5){alert("Bitte Name, Telefon und eine kurze Beschreibung angeben.");return}
        $("#s").disabled=true;const r=await fetch(location.pathname+"/meldung",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});
        const j=await r.json().catch(()=>({}));
        $("#meld").innerHTML=r.ok?'<div class="k ok"><h2>Danke, Ihre Meldung ist bei uns.</h2><p>Wir rufen Sie zurück, um einen Termin abzustimmen.</p></div>':'<p>'+esc(j.fehler||"Senden fehlgeschlagen. Bitte rufen Sie uns an.")+'</p>'};
      $("#ps").onclick=async()=>{const r=await fetch(location.pathname+"/historie",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:$("#p").value.trim()})});
        const j=await r.json().catch(()=>({}));if(!r.ok){alert(j.fehler||"PIN nicht korrekt.");return}
        $("#kunde").innerHTML='<h2>Wartung und Historie</h2>'+(j.naechste?'<p>Nächste Wartung: <b>'+esc(j.naechste)+'</b></p>':'')+
         '<div class="hist">'+(j.einsaetze.map(e=>'<div><time>'+esc(e.datum)+'</time><span><b>'+esc(e.art)+'</b><br>'+esc(e.zustand||"")+'</span></div>').join("")||'<p class="l">Noch keine Einsätze.</p>')+'</div>'};
      </script>`));
  });

  app.post<{ Params: { kennung: string }; Body: { name?: string; telefon?: string; text?: string } }>(
    "/a/:kennung/meldung",
    async (anfrage, antwort) => {
      if (zuOft("meldung:" + anfrage.ip, 5, 60)) return antwort.code(429).send({ fehler: "Zu viele Meldungen. Bitte rufen Sie uns an." });
      const a = await anlageZu(anfrage.params.kennung);
      if (!a) return antwort.code(404).send({ fehler: "Anlage nicht gefunden." });
      const name = String(anfrage.body?.name ?? "").slice(0, 100).trim();
      const tel = String(anfrage.body?.telefon ?? "").slice(0, 40).trim();
      const text = String(anfrage.body?.text ?? "").slice(0, 1000).trim();
      if (!name || !tel || text.length < 5) return antwort.code(400).send({ fehler: "Bitte Name, Telefon und Beschreibung angeben." });
      const [id] = await nummernZiehen("A", 1);
      const auftrag = {
        id, nv: String(a.nv), art: "Störung", quelle: "QR-Aufkleber", grund: `Störmeldung über Servicekarte: „${text}“`,
        dauer: 2, tech: null, date: null, time: null, status: "offen", prio: "hoch", melder: `${name}, ${tel}`,
      };
      await sql`insert into daten (sammlung, id, daten, geaendert_von) values ('auftraege', ${id}, ${sql.json(auftrag)}, 'QR-Aufkleber')`;
      await protokolliere("QR-Aufkleber", "Störung gemeldet", `${a.nv} · ${id}`);
      void planerIds().then((ids) => senden(ids, "stoerung", `Störmeldung ${a.nv}`, `${a.ort ?? ""}: „${text.slice(0, 120)}“ · Rückruf ${tel}`, "/buero/"));
      return { ok: true };
    },
  );

  app.post<{ Params: { kennung: string }; Body: { pin?: string } }>("/a/:kennung/historie", async (anfrage, antwort) => {
    if (zuOft("pin:" + anfrage.ip, 10, 15)) return antwort.code(429).send({ fehler: "Zu viele Versuche. Bitte später erneut." });
    const a = await anlageZu(anfrage.params.kennung);
    if (!a || !a.pin || String(anfrage.body?.pin ?? "") !== String(a.pin)) return antwort.code(403).send({ fehler: "PIN nicht korrekt." });
    const nv = String(a.nv);
    const ber: { d: Daten }[] = await sql<{ d: Daten }[]>`
      select daten - 'daten' as d from daten where sammlung = 'berichte' and not geloescht and daten->>'nv' = ${nv}
      order by daten->>'datum' desc limit 20`;
    const letzteWartung = ber.find((b) => b.d.art === "Wartung")?.d.datum as string | undefined;
    return {
      naechste: naechsteWartung(a, letzteWartung ?? null),
      einsaetze: ber.map((b) => ({
        datum: new Date(String(b.d.datum) + "T12:00").toLocaleDateString("de-DE"),
        art: b.d.art, zustand: b.d.zustand,
      })),
    };
  });

  /** QR-Code als SVG für den Aufkleberdruck im Büro */
  app.get<{ Params: { kennung: string } }>("/api/qr/:kennung", { preHandler: brauche("eigene") }, async (anfrage, antwort) => {
    const k = anfrage.params.kennung.replace(/\.svg$/, "");
    if (!KENNUNG.test(k)) return antwort.code(400).send({ fehler: "Ungültige Kennung." });
    const svg = await QRCode.toString(`${config.baseUrl}/a/${k}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    return antwort.type("image/svg+xml").header("Cache-Control", "private, max-age=86400").send(svg);
  });
}
