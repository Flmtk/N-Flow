/* N-Flow · Fahrzeuge: Verbrauch aus Tankbelegen, Fälligkeiten, Lager (für Büro und App) */
(function () {
  "use strict";
  const zahl = (x) => { if (x == null || x === "") return null; const n = Number(String(x).replace(/\s| /g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")); return isFinite(n) ? n : null; };

  /** Liter und km-Stand eines Tankbelegs (neue Belege haben Felder, alte nur den Infotext „58,2 l · 41 207 km“) */
  function tankDaten(b) {
    let l = zahl(b.liter), km = zahl(b.km);
    const info = String(b.info || "");
    if (l == null) { const m = info.match(/([\d.,]+)\s*l\b/i); if (m) l = zahl(m[1]); }
    if (km == null) { const m = info.match(/([\d.\s ]+)\s*km/i); if (m) km = zahl(m[1]); }
    return { liter: l, km };
  }

  /**
   * Verbrauch nach der Vollgetankt-Methode: Liter einer Tankfüllung geteilt durch die km seit der vorigen.
   * belege: alle Belege; fz: Fahrzeug (Zuordnung über fahrzeug-Feld oder Fahrer).
   */
  function verbrauch(belege, fz) {
    const t = belege
      .filter((b) => b.kat === "Tanken" && (b.fahrzeug ? b.fahrzeug === fz.id : b.tech === fz.fahrer))
      .map((b) => Object.assign({ datum: b.datum, betrag: Number(b.betrag) || 0 }, tankDaten(b)))
      .filter((x) => x.km != null)
      .sort((a, b) => a.km - b.km);
    const fahrten = [];
    for (let i = 1; i < t.length; i++) {
      const strecke = t[i].km - t[i - 1].km;
      if (strecke > 20 && t[i].liter) fahrten.push({ datum: t[i].datum, km: t[i].km, strecke, liter: t[i].liter, l100: (t[i].liter / strecke) * 100, euro: t[i].betrag });
    }
    const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
    const letzte = fahrten.slice(-5);
    const schnitt = fahrten.length ? (sum(fahrten, "liter") / sum(fahrten, "strecke")) * 100 : null;
    const aktuell = letzte.length ? (sum(letzte, "liter") / sum(letzte, "strecke")) * 100 : null;
    const kmStand = t.length ? t[t.length - 1].km : null;
    const euroProKm = fahrten.length ? sum(fahrten, "euro") / sum(fahrten, "strecke") : null;
    // auffällig: einzelne Füllung mehr als 25 % über dem Schnitt
    fahrten.forEach((f) => { f.auffaellig = schnitt != null && fahrten.length >= 3 && f.l100 > schnitt * 1.25; });
    return { fahrten, schnitt, aktuell, kmStand, euroProKm, tankungen: t.length };
  }

  /** Fälligkeiten: TÜV (Monat), Inspektion, Reifenwechsel, Leasingende */
  function faellig(fz, heute) {
    const h = heute || new Date().toISOString().slice(0, 10);
    const tage = (d) => Math.round((new Date(d + "T12:00") - new Date(h + "T12:00")) / 864e5);
    const L = [];
    const add = (art, datum, text) => { if (!datum) return; const t = tage(datum); L.push({ art, datum, tage: t, text, stufe: t < 0 ? "ueber" : t <= 30 ? "bald" : "ok" }); };
    if (fz.tuev) add("HU / TÜV", /^\d{4}-\d{2}$/.test(fz.tuev) ? fz.tuev + "-28" : fz.tuev, "Hauptuntersuchung");
    if (fz.inspektion) add("Inspektion", fz.inspektion, "Service in der Werkstatt");
    if (fz.reifen && fz.reifen.wechsel) add("Reifenwechsel", fz.reifen.wechsel, "auf " + (fz.reifen.montiert === "Winter" ? "Sommerreifen" : "Winterreifen"));
    if (fz.leasingEnde) add("Leasingende", fz.leasingEnde, fz.leasing || "Leasing");
    if (fz.uvv) add("UVV-Prüfung", fz.uvv, "jährliche Prüfung");
    return L.sort((a, b) => a.tage - b.tage);
  }

  const bestand = (l, p) => (l.bestand && l.bestand[p.nr] != null ? Number(l.bestand[p.nr]) : Number(p.menge));
  const fehlt = (l) => (l.soll || []).filter((p) => bestand(l, p) <= Number(p.min || 0));

  window.NFFZ = { zahl, tankDaten, verbrauch, faellig, bestand, fehlt };
})();
