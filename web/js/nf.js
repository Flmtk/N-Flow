/* N-Flow · Abgleich zwischen Oberfläche und Server
 * – Änderungen landen sofort lokal und gehen über einen Postausgang an den Server (auch nach Offline-Zeiten)
 * – alle 20 Sekunden und beim Zurückkehren in die App werden Änderungen anderer abgeholt
 * – Fotos und Unterschriften warten in IndexedDB, bis Netz da ist
 */
(function () {
  "use strict";
  const NF = (window.NF = {
    ich: null, store: {}, stand: null, sammlungen: [], kurz: false,
    online: navigator.onLine, outbox: [], team: [],
  });
  const hoerer = { aenderung: [], status: [], fehler: [] };
  const sende = (e, x) => hoerer[e].forEach((f) => { try { f(x); } catch (err) { console.error(err); } });
  NF.bei = (e, f) => hoerer[e].push(f);

  const k = (x) => "nflow:" + (NF.ich ? NF.ich.benutzer.id + ":" : "") + x;
  const lies = (x, d) => { try { const v = localStorage.getItem(k(x)); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const schreib = (x, v) => { try { localStorage.setItem(k(x), JSON.stringify(v)); } catch (e) { console.warn("Speicher voll", e); } };
  NF.lokal = { lies, schreib };

  class ApiFehler extends Error { constructor(code, text) { super(text); this.code = code; } }
  async function api(pfad, opt = {}) {
    let r;
    try {
      r = await fetch(pfad, {
        method: opt.method || "GET", credentials: "same-origin",
        headers: opt.body !== undefined && !(opt.body instanceof Blob) ? { "content-type": "application/json" } : opt.headers || {},
        body: opt.body === undefined ? undefined : opt.body instanceof Blob ? opt.body : JSON.stringify(opt.body),
      });
    } catch (e) { throw new ApiFehler(0, "Keine Verbindung zum Server."); }
    if (r.status === 401) { NF.abgemeldet(); throw new ApiFehler(401, "Bitte neu anmelden."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiFehler(r.status, j.fehler || "Fehler " + r.status);
    return j;
  }
  NF.api = api;
  NF.abgemeldet = () => {
    // Gesperrt oder abgelaufen: zwischengespeicherte Daten vom Gerät entfernen (Postausgang bleibt)
    try { localStorage.removeItem(k("cache")); } catch (e) {}
    location.href = "/?ziel=" + encodeURIComponent(location.pathname + location.hash);
  };

  /* ---------- Lesen ---------- */
  NF.liste = (s) => Object.values(NF.store[s] || {}).map((z) => z.daten);
  NF.eintraege = (s) => Object.values(NF.store[s] || {}).map((z) => ({ id: z.id, daten: z.daten, von: z.von }));
  NF.get = (s, id) => (NF.store[s] && NF.store[s][id] ? NF.store[s][id].daten : null);
  NF.holen = async (s, id) => (await api(`/api/daten/${s}/${encodeURIComponent(id)}`)).daten;
  NF.ausstehend = (s, id) => NF.outbox.some((o) => o.s === s && o.id === id);
  const cacheSichern = () => schreib("cache", { stand: NF.stand, store: NF.store, sammlungen: NF.sammlungen });

  function uebernehmen(sammlungen, ganz) {
    const geaendert = new Set();
    for (const [s, zeilen] of Object.entries(sammlungen)) {
      if (ganz) NF.store[s] = {};
      NF.store[s] = NF.store[s] || {};
      for (const z of zeilen) {
        if (NF.ausstehend(s, z.id)) { if (NF.store[s][z.id]) NF.store[s][z.id].version = z.version; continue; }
        if (z.geloescht) delete NF.store[s][z.id];
        else NF.store[s][z.id] = { id: z.id, version: z.version, daten: z.daten, von: z.geaendert_von };
        geaendert.add(s);
      }
    }
    // Ausstehende eigene Änderungen wieder obenauf legen
    if (ganz) for (const o of NF.outbox) anwenden(o);
    return geaendert;
  }
  // Schlüsselfeld je Sammlung, wie der Server es setzt
  const SCHLUESSEL = { kunden: "nr", anlagen: "nv", auftraege: "id", berichte: "sb", rechnungen: "re", abwesenheiten: "id", belege: "id" };
  function anwenden(o) {
    NF.store[o.s] = NF.store[o.s] || {};
    if (o.art === "put") {
      const alt = NF.store[o.s][o.id];
      const daten = Object.assign({}, alt ? alt.daten : {}, o.teil);
      if (SCHLUESSEL[o.s]) daten[SCHLUESSEL[o.s]] = o.id;
      NF.store[o.s][o.id] = { id: o.id, version: alt ? alt.version : 0, daten };
    } else if (o.art === "del") delete NF.store[o.s][o.id];
  }

  /* ---------- Start ---------- */
  NF.start = async function ({ sammlungen, kurz = false, nummern = [] }) {
    NF.sammlungen = sammlungen; NF.kurz = kurz;
    let ich = null;
    try { ich = await api("/api/ich"); } catch (e) { if (e.code === 401) return null; }
    if (ich && !ich.angemeldet) { NF.abgemeldet(); return null; }
    if (!ich) {
      // Offline: letzte bekannte Anmeldung verwenden
      try { ich = JSON.parse(localStorage.getItem("nflow:ich") || "null"); } catch (e) { ich = null; }
      if (!ich) throw new Error("Keine Verbindung und noch keine Daten auf diesem Gerät.");
      NF.online = false;
    } else localStorage.setItem("nflow:ich", JSON.stringify(ich));
    NF.ich = ich;
    NF.outbox = lies("outbox", []);
    const c = lies("cache", null);
    if (c) { NF.store = c.store || {}; NF.stand = c.stand; }
    for (const o of NF.outbox) anwenden(o);
    try {
      const [d, team] = await Promise.all([api(`/api/daten?s=${sammlungen.join(",")}${kurz ? "&kurz=1" : ""}`), api("/api/team")]);
      uebernehmen(d.sammlungen, true); NF.stand = d.stand; NF.team = team; schreib("team", team); NF.online = true;
      cacheSichern();
    } catch (e) {
      if (e.code === 401) return null;
      NF.online = false; NF.team = lies("team", []);
    }
    nummern.forEach((kr) => nummernAuffuellen(kr));
    setInterval(abholen, 20000);
    window.addEventListener("online", () => { NF.online = true; senden(); abholen(); });
    window.addEventListener("offline", () => { NF.online = false; sende("status", status()); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { abholen(); senden(); } });
    senden();
    return ich;
  };

  async function abholen() {
    if (!NF.stand || NF.holtGerade) return;
    NF.holtGerade = true;
    try {
      const d = await api(`/api/daten/aenderungen?s=${NF.sammlungen.join(",")}&seit=${encodeURIComponent(NF.stand)}${NF.kurz ? "&kurz=1" : ""}`);
      const war = NF.online; NF.online = true;
      const g = uebernehmen(d.sammlungen, false); NF.stand = d.stand;
      if (g.size) { cacheSichern(); sende("aenderung", g); }
      if (!war) { sende("status", status()); senden(); }
      if (Math.random() < 0.1) api("/api/team").then((t) => { NF.team = t; schreib("team", t); }).catch(() => {});
    } catch (e) {
      if (e.code === 0 && NF.online) { NF.online = false; sende("status", status()); }
    } finally { NF.holtGerade = false; }
  }
  NF.abholen = abholen;

  /* ---------- Schreiben ---------- */
  NF.setze = function (s, id, teil) {
    const letzte = NF.outbox[NF.outbox.length - 1];
    let o;
    if (letzte && letzte.art === "put" && letzte.s === s && letzte.id === id && !letzte.unterwegs) {
      Object.assign(letzte.teil, teil); o = { s, id, art: "put", teil };
    } else { o = { s, id, art: "put", teil: Object.assign({}, teil), zeit: Date.now() }; NF.outbox.push(o); }
    anwenden(o); schreib("outbox", NF.outbox); cacheSichern(); senden();
    return NF.get(s, id);
  };
  NF.loesche = function (s, id) {
    const o = { s, id, art: "del", zeit: Date.now() };
    NF.outbox.push(o); anwenden(o); schreib("outbox", NF.outbox); cacheSichern(); senden();
  };
  /** Anlegen mit Nummer vom Server (Rechnungen). Braucht Netz. */
  NF.anlegen = async function (s, daten) {
    const z = await api(`/api/daten/${s}`, { method: "POST", body: { daten } });
    NF.store[s] = NF.store[s] || {}; NF.store[s][z.id] = { id: z.id, version: z.version, daten: z.daten };
    cacheSichern(); return z.daten;
  };

  /** Vergleicht eine Liste der Oberfläche mit dem Speicher und sendet nur geänderte Felder. */
  NF.abgleich = function (s, liste, schluessel, umwandeln) {
    for (const x of liste) {
      const id = schluessel(x); if (!id) continue;
      const neu = umwandeln ? umwandeln(x) : x, alt = NF.get(s, id), teil = {};
      for (const [f, v] of Object.entries(neu)) {
        if (v === undefined) continue;
        if (!alt || JSON.stringify(alt[f]) !== JSON.stringify(v)) teil[f] = v;
      }
      if (Object.keys(teil).length) NF.setze(s, id, alt ? teil : neu);
    }
  };

  let laeuft = false;
  async function senden() {
    if (laeuft) return;
    laeuft = true;
    try {
      while (NF.outbox.length) {
        const o = NF.outbox[0];
        o.unterwegs = true;
        try {
          if (o.art === "datei") await dateiHochladen(o.id);
          else if (o.art === "del") await api(`/api/daten/${o.s}/${encodeURIComponent(o.id)}`, { method: "DELETE" });
          else {
            const z = await api(`/api/daten/${o.s}/${encodeURIComponent(o.id)}`, { method: "PUT", body: { daten: o.teil } });
            NF.outbox.shift();
            if (!NF.ausstehend(o.s, o.id)) { NF.store[o.s][o.id] = { id: z.id, version: z.version, daten: z.daten }; }
            schreib("outbox", NF.outbox); cacheSichern();
            if (!NF.online) { NF.online = true; }
            sende("status", status());
            continue;
          }
          NF.outbox.shift(); schreib("outbox", NF.outbox);
          NF.online = true; sende("status", status());
        } catch (e) {
          o.unterwegs = false;
          if (e.code === 0 || e.code >= 500 || e.code === 401) {
            NF.online = e.code !== 0 ? NF.online : false; sende("status", status());
            setTimeout(senden, 15000); break;
          }
          // Vom Server abgelehnt: verwerfen und den Stand vom Server holen
          NF.outbox.shift(); schreib("outbox", NF.outbox);
          sende("fehler", e.message);
          if (o.s) { try { const z = await api(`/api/daten/${o.s}/${encodeURIComponent(o.id)}`); NF.store[o.s][o.id] = { id: z.id, version: z.version, daten: z.daten }; } catch (x) { if (NF.store[o.s]) delete NF.store[o.s][o.id]; } }
          cacheSichern(); sende("aenderung", new Set([o.s]));
        }
      }
    } finally { laeuft = false; }
  }
  NF.senden = senden;
  function status() { return { online: NF.online, ausstehend: NF.outbox.length }; }
  NF.status = status;

  /* ---------- Nummern für Offline-Betrieb ---------- */
  NF.nummer = function (kreis) {
    const p = lies("nummern", {}), l = p[kreis] || [];
    const n = l.shift(); p[kreis] = l; schreib("nummern", p);
    if (l.length < 4) nummernAuffuellen(kreis);
    return n || null;
  };
  async function nummernAuffuellen(kreis) {
    const p = lies("nummern", {});
    if ((p[kreis] || []).length >= 4) return;
    try {
      const r = await api("/api/nummern", { method: "POST", body: { kreis, anzahl: 8 } });
      const q = lies("nummern", {}); q[kreis] = (q[kreis] || []).concat(r.nummern); schreib("nummern", q);
    } catch (e) { /* später erneut */ }
  }

  /* ---------- Dateien (Fotos, Unterschriften) ---------- */
  let idb = null;
  function db() {
    if (idb) return idb;
    idb = new Promise((ok, nein) => {
      const r = indexedDB.open("nflow", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("dateien", { keyPath: "id" });
      r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error);
    });
    return idb;
  }
  async function idbTx(modus, fn) {
    const d = await db();
    return new Promise((ok, nein) => {
      const t = d.transaction("dateien", modus), st = t.objectStore("dateien"); let erg;
      Promise.resolve(fn(st)).then((x) => { erg = x; });
      t.oncomplete = () => ok(erg); t.onerror = () => nein(t.error);
    });
  }
  const anfrage = (r) => new Promise((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });

  /** Speichert eine Datei lokal und stellt sie in den Postausgang. Gibt die ID zurück. */
  NF.datei = async function (blob, name) {
    const id = crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
    await idbTx("readwrite", (st) => st.put({ id, blob, name: name || "", typ: blob.type }));
    NF.outbox.push({ art: "datei", id, zeit: Date.now() }); schreib("outbox", NF.outbox); senden();
    return id;
  };
  async function dateiHochladen(id) {
    const x = await idbTx("readonly", (st) => anfrage(st.get(id)));
    if (!x) return;
    await api(`/api/dateien/${id}?name=${encodeURIComponent(x.name)}`, { method: "PUT", body: x.blob, headers: { "content-type": x.typ } });
    await idbTx("readwrite", (st) => st.delete(id));
  }
  /** Adresse zum Anzeigen: lokal, solange noch nicht hochgeladen, sonst vom Server */
  NF.dateiAdresse = async function (id) {
    try { const x = await idbTx("readonly", (st) => anfrage(st.get(id))); if (x) return URL.createObjectURL(x.blob); } catch (e) {}
    return "/api/dateien/" + id;
  };

  /** Foto verkleinern (längste Seite max. px) und als JPEG liefern */
  NF.bildVerkleinern = function (datei, px = 1600, q = 0.8) {
    return new Promise((ok, nein) => {
      if (datei.type === "application/pdf") return ok(datei);
      const url = URL.createObjectURL(datei), im = new Image();
      im.onload = () => {
        const f = Math.min(1, px / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * f); c.height = Math.round(im.height * f);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? ok(b) : nein(new Error("Bild nicht lesbar"))), "image/jpeg", q);
      };
      im.onerror = () => nein(new Error("Bild nicht lesbar")); im.src = url;
    });
  };
  NF.dataUrlZuBlob = async (u) => (await fetch(u)).blob();
})();
