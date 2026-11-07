/* N-Flow · Bewegung: Federn und Gesten nach Apples „Fluid Interfaces“.
 * Grundsätze: Rückmeldung beim Aufsetzen, 1:1 mitziehen (mit Griffversatz), jederzeit greifbar,
 * Schwung wird übernommen und nach vorn projiziert, an Rändern Widerstand statt harter Kante.
 * Nur transform und opacity. „Bewegung reduzieren“ = ruhige Überblendung statt Schieben.
 * Global als window.NFB, ohne Abhängigkeiten. */
(function () {
  "use strict";
  var NFB = {};
  NFB.reduziert = function () { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; };

  /* Feder mit Dämpfung (1 = ohne Überschwingen) und Ansprechzeit in Sekunden.
   * Startet immer vom aktuellen Wert und behält die Geschwindigkeit, wenn das Ziel wechselt. */
  function Feder(x, malen) { this.x = x; this.v = 0; this.ziel = x; this.malen = malen; this.lauf = 0; this.fertig = null; }
  Feder.prototype.zu = function (ziel, o) {
    o = o || {};
    var a = o.antwort || 0.4, d = o.daempfung == null ? 1 : o.daempfung, self = this;
    this.k = Math.pow(2 * Math.PI / a, 2); this.c = 4 * Math.PI * d / a;
    if (o.v != null) this.v = o.v;
    this.ziel = ziel; this.fertig = o.fertig || null;
    if (o.sofort || NFB.reduziert()) { this.lauf = 0; this.x = ziel; this.v = 0; this.malen(ziel, true); this._ende(); return; }
    if (this.lauf) return;
    var id = ++this.lauf, t0 = performance.now();
    function tick(t) {
      if (self.lauf !== id) return;
      var dt = Math.min(0.034, (t - t0) / 1000); t0 = t;
      for (var i = 0; i < 6; i++) { var h = dt / 6; self.v += (-self.k * (self.x - self.ziel) - self.c * self.v) * h; self.x += self.v * h; }
      if (Math.abs(self.v) < 1 && Math.abs(self.x - self.ziel) < 0.3) { self.x = self.ziel; self.v = 0; self.lauf = 0; self.malen(self.x, true); self._ende(); return; }
      self.malen(self.x, false); requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };
  Feder.prototype._ende = function () { var f = this.fertig; this.fertig = null; if (f) f(); };
  Feder.prototype.halt = function () { this.lauf = 0; this.fertig = null; };   // gegriffen: bleibt, wo es gerade ist
  Feder.prototype.setze = function (x) { this.halt(); this.x = x; this.v = 0; this.malen(x, false); };
  NFB.Feder = Feder;

  /* Geschwindigkeit (px/s) aus den letzten ~100 ms */
  function Tempo() { this.p = []; }
  Tempo.prototype.add = function (w) { var t = performance.now(); this.p.push([t, w]); while (this.p.length > 2 && t - this.p[0][0] > 100) this.p.shift(); };
  Tempo.prototype.wert = function () {
    if (this.p.length < 2) return 0;
    var a = this.p[0], b = this.p[this.p.length - 1];
    return b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) * 1000 : 0;
  };
  NFB.Tempo = Tempo;
  /* Wohin der Schwung trägt (Apples Formel) und weicher Rand */
  NFB.projektion = function (v, d) { d = d || 0.998; return (v / 1000) * d / (1 - d); };
  NFB.gummi = function (u, g, c) { c = c || 0.55; return (u * g * c) / (g + c * Math.abs(u)); };
  NFB.summen = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* nicht erlaubt */ } };

  /* Klick nach einer Geste schlucken, damit Wischen nicht auch noch öffnet */
  function klickSchlucken() {
    var weg = function (e) { e.stopPropagation(); e.preventDefault(); document.removeEventListener("click", weg, true); };
    document.addEventListener("click", weg, true);
    setTimeout(function () { document.removeEventListener("click", weg, true); }, 400);
  }

  /* ---------- Blatt von unten (modal, mit Abdunkeln) ----------
   * L enthält .hwschirm (Abdunkeln) und .hwsheet (Blatt). Am Griff und Kopf ziehen,
   * schnippen schließt, nach oben gibt es Widerstand. zu() fährt den gleichen Weg zurück. */
  NFB.blatt = function (L, optionen) {
    var schirm = L.querySelector(".hwschirm"), blatt = L.querySelector(".hwsheet");
    if (!blatt) return null;
    var hoehe = function () { return blatt.getBoundingClientRect().height + 24; };
    var schliessen = false, fertigZu = optionen && optionen.weg;
    var f = new Feder(hoehe(), function (y, ende) {
      blatt.style.transform = "translateY(" + y + "px)";
      if (schirm) schirm.style.opacity = String(Math.max(0, Math.min(1, 1 - y / hoehe())));
      if (ende && schliessen && y >= hoehe() - 1 && fertigZu) fertigZu();
    });
    f.setze(hoehe());
    f.zu(0, { antwort: 0.42 });
    var api = {
      zu: function (v, sofort) { schliessen = true; f.zu(hoehe(), { v: v || 0, antwort: 0.36, sofort: sofort }); },
    };
    var griff = blatt.querySelectorAll(".griff, .hwkopf"), s = null, basis = 0, tempo = null, id = null, richtung = null;
    Array.prototype.forEach.call(griff, function (g) {
      g.style.touchAction = "none";
      g.addEventListener("pointerdown", function (e) {
        if (e.button !== 0 || s) return;                 // nur ein Finger
        f.halt(); schliessen = false;
        s = { x: e.clientX, y: e.clientY }; basis = f.x; tempo = new Tempo(); tempo.add(e.clientY); id = e.pointerId; richtung = null;
      });
    });
    blatt.addEventListener("pointermove", function (e) {
      if (!s || e.pointerId !== id) return;
      var dy = e.clientY - s.y;
      if (!richtung && Math.abs(dy) > 8) { richtung = "y"; try { blatt.setPointerCapture(id); } catch (x) { /* schon weg */ } }
      if (!richtung) return;
      tempo.add(e.clientY);
      var y = basis + dy; if (y < 0) y = -NFB.gummi(-y, hoehe());
      f.setze(y);
    });
    function los(e) {
      if (!s || e.pointerId !== id) return;
      var war = richtung; s = null;
      if (!war) { if (f.x !== 0) f.zu(0); return; }
      klickSchlucken();
      var v = tempo.wert(), wohin = f.x + NFB.projektion(v);
      if (wohin > hoehe() * 0.5) api.zu(v);
      else f.zu(0, { v: v, antwort: 0.32, daempfung: Math.abs(v) > 600 ? 0.8 : 1 });
    }
    blatt.addEventListener("pointerup", los); blatt.addEventListener("pointercancel", los);
    return api;
  };

  /* ---------- Mitteilung oben: nach oben wegwischen, kommt und geht über die Oberkante ---------- */
  NFB.mitteilung = function (el, weg) {
    var aus = function () { return -(el.getBoundingClientRect().height + 30); };
    var raus = false;
    var f = new Feder(aus(), function (y, ende) {
      el.style.transform = "translateY(" + y + "px)";
      if (ende && raus && weg) weg();
    });
    f.setze(aus()); f.zu(0, { antwort: 0.42 });
    var s = null, basis = 0, tempo = null, id = null, bewegt = false;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", function (e) { if (s) return; f.halt(); raus = false; s = e.clientY; basis = f.x; tempo = new Tempo(); tempo.add(e.clientY); id = e.pointerId; bewegt = false; });
    el.addEventListener("pointermove", function (e) {
      if (s == null || e.pointerId !== id) return;
      var dy = e.clientY - s;
      if (!bewegt && Math.abs(dy) > 8) { bewegt = true; try { el.setPointerCapture(id); } catch (x) { /* weg */ } }
      if (!bewegt) return;
      tempo.add(e.clientY);
      var y = basis + dy; if (y > 0) y = NFB.gummi(y, 200);
      f.setze(y);
    });
    function los(e) {
      if (s == null || e.pointerId !== id) return; s = null;
      if (!bewegt) return;
      klickSchlucken();
      var v = tempo.wert();
      if (f.x + NFB.projektion(v) < aus() / 2) { raus = true; f.zu(aus(), { v: v, antwort: 0.3 }); }
      else f.zu(0, { v: v, antwort: 0.32 });
    }
    el.addEventListener("pointerup", los); el.addEventListener("pointercancel", los);
    return { zu: function () { raus = true; f.zu(aus(), { antwort: 0.34 }); } };
  };

  /* ---------- Aktionen hinter einer Karte (nach links wischen) ----------
   * Aufbau: .wisch > .wischakt (Knöpfe) + .wischkarte. Senkrechtes Scrollen bleibt beim Browser. */
  var offeneKarte = null;
  NFB.wischen = function (wisch) {
    var karte = wisch.querySelector(".wischkarte"), akt = wisch.querySelector(".wischakt");
    if (!karte || !akt || !akt.children.length || wisch._nfb) return;
    wisch._nfb = true;
    var breite = function () {                      // nur so weit, wie die Knöpfe hinten breit sind
      var k = akt.children, a = k[0].getBoundingClientRect(), z = k[k.length - 1].getBoundingClientRect();
      return z.right - a.left + 12;
    };
    var f = new Feder(0, function (x) {
      karte.style.transform = x ? "translateX(" + x + "px)" : "";
      akt.style.visibility = x < -1 ? "visible" : "hidden";
      akt.setAttribute("aria-hidden", x < -breite() / 2 ? "false" : "true");
    });
    f.setze(0);
    var zu = function () { f.zu(0, { antwort: 0.34 }); if (offeneKarte === zu) offeneKarte = null; };
    var s = null, basis = 0, tempo = null, id = null, richtung = null;
    karte.style.touchAction = "pan-y";
    karte.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || s) return;
      f.halt(); s = { x: e.clientX, y: e.clientY }; basis = f.x; tempo = new Tempo(); tempo.add(e.clientX); id = e.pointerId; richtung = null;
    });
    karte.addEventListener("pointermove", function (e) {
      if (!s || e.pointerId !== id) return;
      var dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!richtung && Math.hypot(dx, dy) > 10) {        // erst nach 10 px festlegen
        richtung = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (richtung === "x") { try { karte.setPointerCapture(id); } catch (x) { /* weg */ } if (offeneKarte && offeneKarte !== zu) offeneKarte(); }
      }
      if (richtung !== "x") return;
      tempo.add(e.clientX);
      var b = breite(), x = basis + dx;
      if (x > 0) x = NFB.gummi(x, 200);
      if (x < -b) x = -b - NFB.gummi(-b - x, 200);
      f.setze(x);
    });
    function los(e) {
      if (!s || e.pointerId !== id) return; s = null;
      if (richtung === "x") {
        klickSchlucken();
        var v = tempo.wert(), b = breite(), auf = f.x + NFB.projektion(v, 0.99) < -b / 2;
        f.zu(auf ? -b : 0, { v: v, antwort: 0.34, daempfung: Math.abs(v) > 400 ? 0.82 : 1 });
        if (auf) { if (basis === 0) NFB.summen(8); offeneKarte = zu; } else if (offeneKarte === zu) offeneKarte = null;
      } else if (!richtung && f.x < -2) { klickSchlucken(); zu(); }   // Antippen der offenen Karte schließt sie
    }
    karte.addEventListener("pointerup", los); karte.addEventListener("pointercancel", los);
  };
  NFB.wischenZu = function () { if (offeneKarte) offeneKarte(); };

  /* ---------- Seitenpanel von rechts (Desktop-App, Schubladen im Büro) ----------
   * Der Inhalt wird oft neu gezeichnet, deshalb holt die Feder sich das Element jedes Mal neu
   * und die Gesten hängen am festen Behälter. Am Kopf nach rechts ziehen oder schnippen schließt.
   * o: { behaelter, panel: () => Element, schirm: () => Element|null, griff: "Selektor", weg: () => void } */
  NFB.seite = function (o) {
    var breite = function () { var p = o.panel(); return p ? p.getBoundingClientRect().width + 30 : 600; };
    var zustand = "zu";                                // zu | auf | schliesst
    var f = new Feder(breite(), function (x, ende) {
      var p = o.panel(), s = o.schirm ? o.schirm() : null;
      if (p) { p.style.transform = x > 0.5 ? "translateX(" + x + "px)" : ""; p.style.visibility = x >= breite() - 1 ? "hidden" : ""; }
      if (s) s.style.opacity = String(Math.max(0, Math.min(1, 1 - x / breite())));
      if (ende && zustand === "schliesst" && x >= breite() - 1) { zustand = "zu"; if (o.weg) o.weg(); }
    });
    var api = {
      offen: function () { return zustand !== "zu"; },
      /* nach jedem Neuzeichnen aufrufen: neues Element bekommt die aktuelle Stellung */
      gezeichnet: function () { f.malen(f.x, false); },
      auf: function (sofort) {
        if (zustand === "auf") { f.malen(f.x, false); return; }
        if (zustand === "zu") f.setze(breite());
        zustand = "auf"; f.zu(0, { antwort: 0.42, sofort: sofort });
      },
      zu: function (v, sofort) { if (zustand === "zu") { if (o.weg) o.weg(); return; } zustand = "schliesst"; f.zu(breite(), { v: v || 0, antwort: 0.36, sofort: sofort }); },
      weg: function () { f.halt(); zustand = "zu"; f.x = breite(); },
    };
    var s = null, basis = 0, tempo = null, id = null, richtung = null;
    o.behaelter.addEventListener("pointerdown", function (e) {
      var g = e.target.closest && e.target.closest(o.griff);
      if (!g || e.button !== 0 || s || zustand === "zu" || e.target.closest("button, a, input, select, textarea")) return;
      f.halt(); if (zustand === "schliesst") zustand = "auf";     // mitten im Schließen gegriffen
      s = { x: e.clientX, y: e.clientY }; basis = f.x; tempo = new Tempo(); tempo.add(e.clientX); id = e.pointerId; richtung = null;
    });
    o.behaelter.addEventListener("pointermove", function (e) {
      if (!s || e.pointerId !== id) return;
      var dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!richtung && Math.hypot(dx, dy) > 8) { richtung = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; if (richtung === "x") { try { o.behaelter.setPointerCapture(id); } catch (x) { /* weg */ } } }
      if (richtung !== "x") return;
      tempo.add(e.clientX);
      var x = basis + dx; if (x < 0) x = -NFB.gummi(-x, breite());
      f.setze(x);
    });
    function los(e) {
      if (!s || e.pointerId !== id) return; s = null;
      if (richtung !== "x") { if (f.x !== 0 && zustand === "auf") f.zu(0); return; }
      klickSchlucken();
      var v = tempo.wert();
      if (f.x + NFB.projektion(v) > breite() * 0.45) api.zu(v);
      else f.zu(0, { v: v, antwort: 0.34, daempfung: Math.abs(v) > 600 ? 0.82 : 1 });
    }
    o.behaelter.addEventListener("pointerup", los); o.behaelter.addEventListener("pointercancel", los);
    return api;
  };

  /* ---------- Startbild: Logo baut sich auf und fliegt an seinen Platz ----------
   * Nur einmal am Tag beim Öffnen aus geschlossenem Zustand. ziel() liefert das Logo, sobald die Seite steht. */
  NFB.startbild = function (schluessel, ziel) {
    var heute = new Date().toLocaleDateString("sv"), el;
    try { if (localStorage.getItem(schluessel) === heute || !window.NFDESIGN) return; } catch (e) { return; }
    el = document.createElement("div"); el.className = "intro"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="grund"></div>' + NFDESIGN.logo("gross");
    document.body.appendChild(el);
    var ruhig = NFB.reduziert(), t0 = performance.now(), fertig = false, box = el.querySelector(".nlogo"), grund = el.querySelector(".grund");
    function suche() { var z = ziel(); return z && z.getBoundingClientRect().width > 0 ? z : null; }
    function weg(schnell) {
      if (fertig) return; fertig = true;
      try { localStorage.setItem(schluessel, heute); } catch (e) { /* privat */ }
      var z = suche();
      if (z && !schnell && !ruhig && box.animate) {
        var a = box.getBoundingClientRect(), b = z.getBoundingClientRect(), s = b.width / a.width;
        var r = parseFloat(getComputedStyle(z).borderBottomLeftRadius) || 8;
        z.style.visibility = "hidden"; box.style.transformOrigin = "0 0";
        box.animate([{ transform: "none", borderRadius: "14px" }, { transform: "translate(" + (b.left - a.left) + "px," + (b.top - a.top) + "px) scale(" + s + ")", borderRadius: "0 0 " + (r / s) + "px " + (r / s) + "px", boxShadow: "none" }],
          { duration: 480, easing: "cubic-bezier(0.32,0.72,0,1)", fill: "forwards" });
        grund.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, delay: 60, easing: "cubic-bezier(0.23,1,0.32,1)", fill: "forwards" });
        setTimeout(function () { z.style.visibility = ""; el.remove(); }, 500);
      } else {
        if (el.animate) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: schnell ? 150 : 220, easing: "ease-out", fill: "forwards" });
        setTimeout(function () { el.remove(); }, schnell ? 160 : 230);
      }
    }
    el.addEventListener("pointerdown", function () { weg(true); });
    (function warte() { var t = performance.now() - t0; if (fertig) return; if (t >= (ruhig ? 500 : 1050) && (suche() || t > 2500)) return weg(false); setTimeout(warte, 60); })();
  };

  window.NFB = NFB;
})();
