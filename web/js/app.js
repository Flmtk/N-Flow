// N-Flow · Startseite: Anmeldung und Weiterleitung ins Büro oder in die Monteur-App

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const params = new URLSearchParams(location.search);
const ziel = /^\/(?!\/)/.test(params.get("ziel") || "") ? params.get("ziel") : "";

function anmeldeSeite(info) {
  const hinweis = params.get("hinweis");
  const z = ziel ? "?ziel=" + encodeURIComponent(ziel) : "";
  $("#app").innerHTML = `
    <div class="anmeldung"><div class="karte">
      ${window.NFDESIGN ? NFDESIGN.logo("gross") : '<div class="logo">N-FLOW</div>'}
      <div class="leise" style="margin-top:18px">NOVIS Anlagentechnik</div>
      ${info.microsoft
        ? `<a class="knopf haupt ms-knopf" href="/auth/login${z}">
             <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect width="10" height="10" fill="#f25022"/><rect x="11" width="10" height="10" fill="#7fba00"/><rect y="11" width="10" height="10" fill="#00a4ef"/><rect x="11" y="11" width="10" height="10" fill="#ffb900"/></svg>
             Mit Microsoft anmelden</a>`
        : `<div class="hinweis">Die Microsoft-Anmeldung ist noch nicht eingerichtet.</div>`}
      ${info.dev ? `<a class="knopf ms-knopf" href="/auth/dev${z}">Entwickler-Anmeldung</a>` : ""}
      ${hinweis ? `<div class="hinweis">${esc(hinweis)}</div>` : ""}
      <p class="leise klein" style="margin-top:24px">Mit eurem NOVIS-Konto. Version ${esc(info.version)} · ${esc(info.instanz)}</p>
    </div></div>`;
}

async function start() {
  try {
    const info = await fetch("/api/ich", { credentials: "same-origin" }).then((r) => r.json());
    if (!info.angemeldet) return anmeldeSeite(info);
    // Monteure in die App, Büro und Geschäftsführung in die Planung
    location.replace(ziel || (info.rechte && info.rechte.planung ? "/buero/" : "/app/"));
  } catch (err) {
    $("#app").innerHTML = `<div class="anmeldung"><div class="karte"><h2>N-Flow ist gerade nicht erreichbar</h2><p class="leise">Bitte später erneut versuchen.</p></div></div>`;
  }
}
start();
