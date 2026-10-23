// N-Flow · Oberfläche Etappe 1: Anmeldung, Start, Mitarbeiter, Rechte, Protokoll

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const FARBEN = ["#e9660f", "#2f6fb3", "#2f7d4f", "#8a4fb3", "#b3263f", "#6b6560"];
const datum = (d) => (d ? new Date(d).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");

let ich = null;

async function api(pfad, optionen = {}) {
  const antwort = await fetch(pfad, {
    ...optionen,
    headers: optionen.body ? { "content-type": "application/json" } : {},
    body: optionen.body ? JSON.stringify(optionen.body) : undefined,
    credentials: "same-origin",
  });
  const daten = await antwort.json().catch(() => ({}));
  if (antwort.status === 401) { ich = null; zeichne(); throw new Error("Bitte anmelden."); }
  if (!antwort.ok) throw new Error(daten.fehler || "Etwas ist schiefgelaufen.");
  return daten;
}

function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("zeigen");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("zeigen"), 2800);
}

function gruss(name) {
  const h = new Date().getHours();
  const zeit = h < 11 ? "Guten Morgen" : h < 18 ? "Hallo" : "Guten Abend";
  return `${zeit}, ${esc(name.split(" ")[0])}`;
}

// ---------- Anmeldung ----------

function anmeldeSeite(info) {
  const hinweis = new URLSearchParams(location.search).get("hinweis");
  $("#app").innerHTML = `
    <div class="anmeldung"><div class="karte">
      <div class="logo">N-<span>FLOW</span></div>
      <div class="leise">NOVIS Anlagentechnik</div>
      ${info.microsoft
        ? `<a class="knopf haupt ms-knopf" href="/auth/login">
             <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect width="10" height="10" fill="#f25022"/><rect x="11" width="10" height="10" fill="#7fba00"/><rect y="11" width="10" height="10" fill="#00a4ef"/><rect x="11" y="11" width="10" height="10" fill="#ffb900"/></svg>
             Mit Microsoft anmelden</a>`
        : `<div class="hinweis">Die Microsoft-Anmeldung ist noch nicht eingerichtet.</div>`}
      ${info.dev ? `<a class="knopf ms-knopf" href="/auth/dev">Entwickler-Anmeldung</a>` : ""}
      ${hinweis ? `<div class="hinweis">${esc(hinweis)}</div>` : ""}
      <p class="leise klein" style="margin-top:24px">Mit eurem NOVIS-Konto. Version ${esc(info.version)} · ${esc(info.instanz)}</p>
    </div></div>`;
  if (hinweis) history.replaceState(null, "", "/");
}

// ---------- Rahmen ----------

const SEITEN = [
  { id: "start", titel: "Übersicht" },
  { id: "mitarbeiter", titel: "Mitarbeiter", recht: "mitarbeiter" },
  { id: "rechte", titel: "Rechte", recht: "mitarbeiter" },
  { id: "protokoll", titel: "Protokoll", recht: "admin" },
];

function aktuelleSeite() {
  const id = location.hash.replace(/^#\/?/, "") || "start";
  const s = SEITEN.find((x) => x.id === id && (!x.recht || ich.rechte[x.recht]));
  return s ?? SEITEN[0];
}

function rahmen() {
  const s = aktuelleSeite();
  $("#app").innerHTML = `
    <div class="rahmen">
      <nav class="seite">
        <div class="logo">N-<span>FLOW</span></div>
        ${SEITEN.filter((x) => !x.recht || ich.rechte[x.recht])
          .map((x) => `<a href="#/${x.id}" class="${x.id === s.id ? "an" : ""}">${x.titel}</a>`).join("")}
        <div class="fuss">
          <div><b>${esc(ich.benutzer.name)}</b></div>
          <div class="leise">${esc(ich.benutzer.rolle)}</div>
          <button class="knopf klein" id="abmelden" style="margin-top:10px">Abmelden</button>
        </div>
      </nav>
      <main class="inhalt" id="inhalt"></main>
    </div>`;
  $("#abmelden").onclick = async () => {
    await fetch("/auth/logout", { method: "POST" });
    location.href = "/";
  };
  ({ start, mitarbeiter, rechte, protokoll })[s.id]();
}

// ---------- Übersicht ----------

async function start() {
  const el = $("#inhalt");
  el.innerHTML = `
    <div class="kopf"><div><h1>${gruss(ich.benutzer.name)}</h1>
      <div class="leise">N-Flow ${esc(ich.version)} · Umgebung „${esc(ich.instanz)}“</div></div></div>
    <div class="raster">
      <div class="karte"><h2>Was schon geht</h2><p class="leise">Anmeldung mit Microsoft, Mitarbeiter und Rechte verwalten, Protokoll, nächtliche Sicherung.</p></div>
      <div class="karte"><h2>Als Nächstes</h2><p class="leise">Kunden, Anlagen und QR-Aufkleber (Etappe 2), danach Einsätze und Berichte in der Monteur-App.</p></div>
      <div class="karte kennzahl" id="kz-ma"><span class="leise">Aktive Mitarbeiter</span><b>–</b></div>
    </div>`;
  if (ich.rechte.mitarbeiter) {
    const d = await api("/api/mitarbeiter");
    $("#kz-ma b").textContent = d.mitarbeiter.filter((m) => m.aktiv).length;
  } else {
    $("#kz-ma").remove();
  }
}

// ---------- Mitarbeiter ----------

let maDaten = null;

async function mitarbeiter() {
  const el = $("#inhalt");
  maDaten = await api("/api/mitarbeiter");
  el.innerHTML = `
    <div class="kopf"><div><h1>Mitarbeiter</h1><div class="leise">Wer sich mit Microsoft anmelden darf und mit welcher Rolle.</div></div>
      <button class="knopf haupt" id="neu">+ Mitarbeiter</button></div>
    <div class="karte tabelle-wrap" style="padding:0">
      <table><thead><tr><th>Name</th><th>Rolle</th><th>Qualifikationen</th><th>Letzte Anmeldung</th><th>Status</th></tr></thead>
      <tbody>${maDaten.mitarbeiter.map((m) => `
        <tr data-id="${m.id}">
          <td><span class="kreis" style="background:${FARBEN[(m.farbe - 1) % FARBEN.length]}">${esc(m.kuerzel)}</span>${esc(m.name)}<div class="leise klein" style="margin-left:40px">${esc(m.email)}</div></td>
          <td>${esc(m.rolle)}</td>
          <td class="klein">${m.qualifikationen.map(esc).join(", ") || "–"}</td>
          <td class="klein">${datum(m.letzte_anmeldung)}</td>
          <td>${!m.aktiv ? `<span class="marke">Ausgetreten</span>` : m.gesperrt ? `<span class="marke schlecht">Gesperrt</span>` : `<span class="marke gut">Aktiv</span>`}</td>
        </tr>`).join("")}</tbody></table>
    </div>`;
  $("#neu").onclick = () => maBearbeiten(null);
  el.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => maBearbeiten(maDaten.mitarbeiter.find((m) => m.id === tr.dataset.id))));
}

function schliessen() { document.querySelectorAll(".schleier,.lade").forEach((x) => x.remove()); }

function maBearbeiten(m) {
  const neu = !m;
  m ??= { name: "", email: "", rolle: "Monteur", kuerzel: "", telefon: "", standort: "Biebergemünd", einsatzgebiet: "", wochenstunden: 40, selbstkosten: null, qualifikationen: [], farbe: 1, eintritt: null, aktiv: true, gesperrt: false };
  const selbst = m.id === ich.benutzer.id;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="schleier"></div>
    <form class="lade" autocomplete="off">
      <h1>${neu ? "Neuer Mitarbeiter" : esc(m.name)}</h1>
      <p class="leise klein">${neu ? "Die E-Mail muss zum Microsoft-Konto passen, sonst klappt die Anmeldung nicht." : esc(m.email)}</p>
      <label class="feld"><span>Vor- und Nachname</span><input name="name" value="${esc(m.name)}" required></label>
      <label class="feld"><span>E-Mail (Microsoft-Konto)</span><input name="email" type="email" value="${esc(m.email)}" required></label>
      <div class="zeile2">
        <label class="feld"><span>Rolle</span><select name="rolle" ${selbst ? "disabled" : ""}>${maDaten.rollen.map((r) => `<option ${r === m.rolle ? "selected" : ""}>${r}</option>`).join("")}</select></label>
        <label class="feld"><span>Kürzel</span><input name="kuerzel" maxlength="3" value="${esc(m.kuerzel)}" placeholder="automatisch"></label>
      </div>
      <div class="zeile2">
        <label class="feld"><span>Telefon</span><input name="telefon" value="${esc(m.telefon)}"></label>
        <label class="feld"><span>Eintritt</span><input name="eintritt" type="date" value="${esc(m.eintritt?.slice?.(0, 10) ?? "")}"></label>
      </div>
      <div class="zeile2">
        <label class="feld"><span>Standort</span><input name="standort" value="${esc(m.standort)}"></label>
        <label class="feld"><span>Einsatzgebiet</span><input name="einsatzgebiet" value="${esc(m.einsatzgebiet)}"></label>
      </div>
      <div class="zeile2">
        <label class="feld"><span>Wochenstunden</span><input name="wochenstunden" type="number" step="0.5" value="${m.wochenstunden}"></label>
        <label class="feld"><span>Selbstkosten €/h</span><input name="selbstkosten" type="number" step="0.01" value="${m.selbstkosten ?? ""}"></label>
      </div>
      <div class="feld"><span>Qualifikationen</span><div class="chips">${maDaten.qualifikationen.map((q) => `
        <label><input type="checkbox" name="q" value="${esc(q)}" ${m.qualifikationen.includes(q) ? "checked" : ""}>${esc(q)}</label>`).join("")}</div></div>
      <div class="feld"><span>Farbe in der Plantafel</span><div class="chips">${FARBEN.map((f, i) => `
        <label><input type="radio" name="farbe" value="${i + 1}" ${m.farbe === i + 1 ? "checked" : ""}><span class="kreis" style="background:${f};width:16px;height:16px;margin:0"></span></label>`).join("")}</div></div>
      <div class="aktionen"><button class="knopf haupt" type="submit">${neu ? "Anlegen" : "Speichern"}</button><button class="knopf" type="button" data-zu>Abbrechen</button></div>
      ${neu || selbst || !m.aktiv ? "" : `
        <div class="trenner"></div>
        <h2>Zugang</h2>
        <p class="leise klein">Sperren beendet sofort alle Anmeldungen dieser Person, auch auf dem Handy.</p>
        <div class="aktionen" style="margin-top:8px">
          <button class="knopf ${m.gesperrt ? "" : "gefahr"}" type="button" data-sperre>${m.gesperrt ? "Zugang entsperren" : "Zugang sperren"}</button>
        </div>
        <div class="trenner"></div>
        <h2>Austritt</h2>
        <p class="leise klein">Sperrt den Zugang, übergibt die Wartungsanlagen und legt künftige Termine zurück in „Einzuplanen“.</p>
        <label class="feld"><span>Wartungspool übergeben an</span><select name="uebergabe"><option value="">– niemand –</option>${maDaten.mitarbeiter
          .filter((x) => x.id !== m.id && x.aktiv && x.rolle === "Monteur").map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label>
        <button class="knopf gefahr" type="button" data-austritt>Austritt eintragen</button>`}
    </form>`);
  const form = $(".lade");
  $(".schleier").onclick = schliessen;
  form.querySelector("[data-zu]").onclick = schliessen;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const daten = {
      name: f.get("name"), email: f.get("email"), kuerzel: f.get("kuerzel") || undefined,
      telefon: f.get("telefon"), standort: f.get("standort"), einsatzgebiet: f.get("einsatzgebiet"),
      wochenstunden: Number(f.get("wochenstunden")) || 40,
      selbstkosten: f.get("selbstkosten") ? Number(f.get("selbstkosten")) : null,
      eintritt: f.get("eintritt") || null, qualifikationen: f.getAll("q"), farbe: Number(f.get("farbe") || 1),
    };
    if (!selbst) daten.rolle = f.get("rolle");
    try {
      await api(neu ? "/api/mitarbeiter" : `/api/mitarbeiter/${m.id}`, { method: neu ? "POST" : "PATCH", body: daten });
      schliessen(); toast(neu ? "Mitarbeiter angelegt" : "Gespeichert"); mitarbeiter();
    } catch (err) { toast(err.message); }
  };
  form.querySelector("[data-sperre]")?.addEventListener("click", async () => {
    try {
      await api(`/api/mitarbeiter/${m.id}/sperre`, { method: "POST", body: { gesperrt: !m.gesperrt } });
      schliessen(); toast(m.gesperrt ? "Zugang entsperrt" : "Zugang gesperrt"); mitarbeiter();
    } catch (err) { toast(err.message); }
  });
  form.querySelector("[data-austritt]")?.addEventListener("click", async (e) => {
    const knopf = e.currentTarget;
    if (knopf.dataset.sicher !== "1") { knopf.dataset.sicher = "1"; knopf.textContent = "Wirklich eintragen?"; return; }
    try {
      const r = await api(`/api/mitarbeiter/${m.id}/austritt`, { method: "POST", body: { uebergabeAn: form.querySelector("[name=uebergabe]").value || null } });
      schliessen(); toast(`Austritt eingetragen · ${r.anlagen} Anlagen, ${r.termine} Termine umgelegt`); mitarbeiter();
    } catch (err) { toast(err.message); }
  });
  form.querySelector("[name=name]").focus();
}

// ---------- Rechte ----------

async function rechte() {
  const el = $("#inhalt");
  const d = await api("/api/rechte");
  const admin = ich.rechte.admin;
  el.innerHTML = `
    <div class="kopf"><div><h1>Rechte</h1><div class="leise">Was jede Rolle sehen und tun darf. Die Geschäftsführung darf immer alles.</div></div>
      ${admin ? `<button class="knopf haupt" id="speichern">Speichern</button>` : ""}</div>
    <div class="karte tabelle-wrap" style="padding:0">
      <table><thead><tr><th>Recht</th>${d.rollen.map((r) => `<th class="mitte">${esc(r)}</th>`).join("")}</tr></thead>
      <tbody>${Object.entries(d.rechte).map(([k, text]) => `<tr><td>${esc(text)}</td>${d.rollen.map((r) => `
        <td class="mitte"><input type="checkbox" data-rolle="${esc(r)}" data-recht="${k}" ${d.matrix[r][k] ? "checked" : ""} ${!admin || r === "Geschäftsführung" ? "disabled" : ""}></td>`).join("")}</tr>`).join("")}</tbody></table>
    </div>`;
  $("#speichern")?.addEventListener("click", async () => {
    const matrix = {};
    for (const r of d.rollen) matrix[r] = {};
    el.querySelectorAll("input[data-rolle]").forEach((c) => (matrix[c.dataset.rolle][c.dataset.recht] = c.checked));
    try { await api("/api/rechte", { method: "PUT", body: matrix }); toast("Rechte gespeichert"); }
    catch (err) { toast(err.message); }
  });
}

// ---------- Protokoll ----------

async function protokoll() {
  const el = $("#inhalt");
  const zeilen = await api("/api/protokoll");
  el.innerHTML = `
    <div class="kopf"><div><h1>Protokoll</h1><div class="leise">Wer hat wann was getan. Einträge lassen sich nicht ändern oder löschen.</div></div></div>
    <div class="karte tabelle-wrap" style="padding:0">
      <table><thead><tr><th>Zeit</th><th>Wer</th><th>Aktion</th><th>Details</th></tr></thead>
      <tbody>${zeilen.map((z) => `<tr><td class="klein">${datum(z.zeit)}</td><td>${esc(z.wer)}</td><td>${esc(z.aktion)}</td><td class="klein leise">${esc(z.details)}</td></tr>`).join("") ||
        `<tr><td colspan="4" class="leise">Noch keine Einträge.</td></tr>`}</tbody></table>
    </div>`;
}

// ---------- Start ----------

async function zeichne() {
  try {
    if (!ich) {
      const info = await fetch("/api/ich", { credentials: "same-origin" }).then((r) => r.json());
      if (!info.angemeldet) return anmeldeSeite(info);
      ich = info;
    }
    rahmen();
  } catch (err) {
    $("#app").innerHTML = `<div class="anmeldung"><div class="karte"><h2>N-Flow ist gerade nicht erreichbar</h2><p class="leise">${esc(err.message)}</p></div></div>`;
  }
}

window.addEventListener("hashchange", () => ich && rahmen());
zeichne();
