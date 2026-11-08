/* N-Flow · Vorlagen für den Bericht: Arbeitsschritte zum Abhaken (je Einsatzart und Gerätetyp) und Textbausteine.
 * Das Büro pflegt sie unter Einstellungen › Vorlagen (einstellungen/vorlagen). Solange dort nichts gespeichert ist,
 * gelten die Standardlisten unten. Gerätetyp wie im Messblatt: heiz = Gas-Heizgerät, bgas = Gas-Gebläsebrenner, boel = Öl-Brenner. */
(function () {
  "use strict";
  var STANDARD = {
    checklisten: [
      { id: "w-heiz", name: "Wartung Gas-Heizgerät / Brennwert", art: "Wartung", geraet: "heiz", hersteller: "", schritte: [
        "Fehlerspeicher ausgelesen", "Brenner und Brennkammer gereinigt", "Wärmetauscher gereinigt",
        "Zünd- und Ionisationselektrode geprüft / ersetzt", "Ionisationsstrom gemessen", "Kondensatablauf und Siphon gereinigt und befüllt",
        "Dichtungen Brennerdeckel geprüft / ersetzt", "Gasarmatur auf Dichtheit geprüft", "Gasanschluss- und Gasfließdruck geprüft",
        "Abgasweg und Verbrennungsluftzufuhr geprüft", "Vordruck Ausdehnungsgefäß geprüft", "Anlagendruck geprüft / ergänzt",
        "Sicherheitsventil geprüft", "Verbrennung gemessen und eingestellt", "Wartungsanzeige zurückgesetzt"] },
      { id: "w-bgas", name: "Wartung Gas-Gebläsebrenner", art: "Wartung", geraet: "bgas", hersteller: "", schritte: [
        "Fehlerspeicher Feuerungsautomat ausgelesen", "Mischeinrichtung und Stauscheibe gereinigt", "Zünd- und Ionisationselektroden geprüft / eingestellt",
        "Flammenüberwachung geprüft", "Luftdruckwächter geprüft", "Gasdruckwächter geprüft", "Gasfilter geprüft",
        "Gasarmatur auf Dichtheit geprüft", "Kessel und Heizflächen gereinigt", "Abgasweg und Verbrennungsluftzufuhr geprüft",
        "Sicherheitskette geprüft (STB, Wassermangel)", "Verbrennung gemessen und eingestellt"] },
      { id: "w-boel", name: "Wartung Öl-Brenner", art: "Wartung", geraet: "boel", hersteller: "", schritte: [
        "Düse gewechselt", "Ölfilter gewechselt / gereinigt", "Mischeinrichtung gereinigt", "Zündelektroden eingestellt",
        "Flammenfühler geprüft", "Öldruck und Vakuum gemessen", "Ölpumpe und Magnetventil geprüft", "Ölleitungen und Anschlüsse auf Dichtheit geprüft",
        "Kessel und Heizflächen gereinigt", "Abgasweg und Verbrennungsluftzufuhr geprüft", "Sicherheitskette geprüft (STB, Wassermangel)",
        "Verbrennung gemessen (Rußzahl, Ölderivate) und eingestellt"] },
      { id: "ibn-gas", name: "Inbetriebnahme Gas", art: "Inbetriebnahme", geraet: "", hersteller: "", schritte: [
        "Gasart und Anschlusswerte mit Typschild verglichen", "Gasleitung auf Dichtheit geprüft", "Abgasanlage freigegeben (Bezirksschornsteinfeger)",
        "Anlage gefüllt, entlüftet, Anlagendruck eingestellt", "Gasanschlussdruck gemessen", "Verbrennung eingestellt und gemessen",
        "Regelung parametriert", "Sicherheitseinrichtungen geprüft", "Betreiber eingewiesen", "Unterlagen übergeben"] },
    ],
    bausteine: {
      diagnose: ["Anlage im Rahmen der Wartung geprüft", "Ionisationsstrom zu gering", "Kondensatablauf verstopft", "Zündelektrode verschlissen", "Wassermangel, Anlagendruck zu niedrig"],
      arbeiten: ["Brenner und Wärmetauscher gereinigt", "Elektroden geprüft und eingestellt", "Siphon gereinigt und befüllt", "Dichtheitsprüfung Gasarmatur durchgeführt", "Verbrennung gemessen und eingestellt", "Fehlerspeicher ausgelesen und gelöscht", "Wartungsanzeige zurückgesetzt"],
    },
  };

  /* Aktuelle Vorlagen: gespeicherte Werte aus dem Büro, sonst Standard */
  function aktuell(gespeichert) {
    var g = gespeichert || {};
    return {
      checklisten: Array.isArray(g.checklisten) ? g.checklisten : STANDARD.checklisten,
      bausteine: {
        diagnose: g.bausteine && Array.isArray(g.bausteine.diagnose) ? g.bausteine.diagnose : STANDARD.bausteine.diagnose,
        arbeiten: g.bausteine && Array.isArray(g.bausteine.arbeiten) ? g.bausteine.arbeiten : STANDARD.bausteine.arbeiten,
      },
    };
  }

  /* Passende Listen für einen Einsatz, die genaueste zuerst.
   * Leere Felder in der Vorlage gelten für alles. */
  function passend(listen, einsatzart, geraet, hersteller) {
    var h = String(hersteller || "").toLowerCase();
    return (listen || []).map(function (l) {
      if (l.art && l.art !== einsatzart) return null;
      if (l.geraet && l.geraet !== geraet) return null;
      if (l.hersteller && h.indexOf(String(l.hersteller).toLowerCase()) < 0) return null;
      return { l: l, p: (l.art ? 1 : 0) + (l.geraet ? 2 : 0) + (l.hersteller ? 4 : 0) };
    }).filter(Boolean).sort(function (a, b) { return b.p - a.p; }).map(function (x) { return x.l; });
  }

  window.NFVORLAGEN = { STANDARD: STANDARD, aktuell: aktuell, passend: passend };
})();
