/* N-Flow · Design: Farbschema (Orange, Grau, Weiß) und Logo im Kasten.
 * Wird im <head> geladen, damit beim Öffnen nichts aufblitzt.
 * Das Schema gilt je Gerät für Büro und App gemeinsam (localStorage „nflow:schema“). */
(function () {
  "use strict";
  var SCHEMATA = { orange: "Orange", grau: "Grau", weiss: "Weiß" };
  function lies() { try { var s = localStorage.getItem("nflow:schema"); return SCHEMATA[s] ? s : "orange"; } catch (e) { return "orange"; } }
  function setze(s) {
    if (!SCHEMATA[s]) s = "orange";
    document.documentElement.setAttribute("data-schema", s);
    try { localStorage.setItem("nflow:schema", s); } catch (e) { /* privat */ }
    kopfFarbe();
  }
  document.documentElement.setAttribute("data-schema", lies());

  /* Hell/Dunkel je Gerät (Monteur-App; das Büro hat eine eigene Einstellung) */
  function theme() { try { var t = localStorage.getItem("nflow:theme"); return t === "light" || t === "dark" ? t : "auto"; } catch (e) { return "auto"; } }
  function setzeTheme(t) {
    try { if (t === "light" || t === "dark") localStorage.setItem("nflow:theme", t); else localStorage.removeItem("nflow:theme"); } catch (e) { /* privat */ }
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
    kopfFarbe();
  }
  /* Statusleiste = Farbe ganz oben auf der Seite (Kopf), je Hell/Dunkel. Bei fester Wahl gilt sie für beide Tags. */
  function kopfFarbe() {
    if (!document.body) return;
    var el = document.querySelector(".top, .side, body"), f = el ? getComputedStyle(el).backgroundColor : "";
    if (!f || f === "rgba(0, 0, 0, 0)") f = getComputedStyle(document.body).backgroundColor;
    var fest = document.documentElement.getAttribute("data-theme");
    Array.prototype.forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) {
      var dunkel = /dark/.test(m.getAttribute("media") || "");
      if (!m.dataset.std) m.dataset.std = m.getAttribute("content");
      if (fest) m.setAttribute("content", f); else if ((dunkel && matchMedia("(prefers-color-scheme: dark)").matches) || (!dunkel && !matchMedia("(prefers-color-scheme: dark)").matches)) m.setAttribute("content", f); else m.setAttribute("content", m.dataset.std);
    });
  }
  document.addEventListener("DOMContentLoaded", kopfFarbe);
  if (theme() !== "auto" && location.pathname.indexOf("/app") === 0) document.documentElement.setAttribute("data-theme", theme());

  /* Das N aus dem NOVIS-Logo (vektorisiert): linker Strich (s) und Rest (n) */
  var STRICH = "M6 500L2 499L2 251L2 3L6 3C9 2 22 2 36 2L62 2L62 252L62 500L35 501C20 501 7 500 6 500Z";
  var REST = "M326 501L324 501L324 252L324 3L326 3C327 2 341 2 356 2L384 2L384 252L384 502L356 502C340 502 327 502 326 501ZM307 476C302 467 290 450 282 437C273 424 263 409 260 403C256 397 247 384 240 374C234 364 225 350 221 344C217 338 209 326 204 318C194 304 183 286 166 260C160 252 152 239 146 230C141 222 133 210 129 203C124 196 115 182 109 172C102 163 94 150 90 145C87 140 80 129 75 122L66 108L66 58C66 31 66 7 67 5L67 2L71 2L76 2L82 12C85 17 89 24 91 26C102 45 114 64 125 82C132 94 143 111 149 120C162 142 179 170 196 197C203 209 214 226 220 236C240 269 254 290 264 308C276 327 297 361 308 378C311 384 315 390 316 393L318 398L319 444L319 491L318 491C318 491 313 484 307 476Z";
  function logo(klasse) {
    return '<span class="nlogo ' + (klasse || "") + '" role="img" aria-label="N-Flow"><svg viewBox="0 0 386 504" aria-hidden="true"><path class="s" d="' + STRICH + '"/><path class="n" d="' + REST + '"/></svg><i></i><b>FLOW</b></span>';
  }
  function n(klasse) {
    return '<svg class="nmini ' + (klasse || "") + '" viewBox="0 0 386 504" aria-hidden="true"><path class="s" d="' + STRICH + '"/><path class="n" d="' + REST + '"/></svg>';
  }
  window.NFDESIGN = { schemata: SCHEMATA, schema: lies, setzeSchema: setze, theme: theme, setzeTheme: setzeTheme, logo: logo, n: n, kopfFarbe: kopfFarbe };
})();
