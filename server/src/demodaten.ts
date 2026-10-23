import { sql } from "./db.js";
import { protokolliere } from "./protokoll.js";

/**
 * Beispieldaten für die Testumgebung, angelehnt an die Prototypen.
 * Nur einspielbar, solange noch keine Anlagen und Aufträge existieren.
 */

type Daten = Record<string, unknown>;

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const heute = () => iso(new Date());
const plusTage = (s: string, k: number) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + k); return iso(d); };
const plusMonate = (s: string, k: number) => { const d = new Date(s + "T12:00"); d.setMonth(d.getMonth() + k); return iso(d); };
const montag = (s: string) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const werktag = (s: string, k: number) => { let x = s, n = 0; while (n < k) { x = plusTage(x, 1); const g = new Date(x + "T12:00").getDay(); if (g % 6) n++; } return x; };
const de = (x: number) => x.toFixed(1).replace(".", ",");

function messDemo(typ: "heiz" | "bgas" | "boel", kw: number) {
  if (typ === "heiz") {
    const z = (pkt: string, last: string, o2: number, ta: number, co: number) => ({ pkt, last, durch: de(kw / 10 * (+last / 100)), gfd: "19", o2: de(o2), co2: de(11.7 * (1 - o2 / 21)), co: String(co), nox: "22", ta: String(ta), tl: "18", vl: "60", rl: "44" });
    return {
      typ, ang: { rows: [z("Q min", "30", 6.8, 52, 24), z("Q max", "100", 6.2, 74, 41)], hide: [], extra: [], ub: { 1: true } },
      ver: { rows: [z("Q min", "30", 5.3, 44, 9), z("Q max", "100", 4.9, 61, 14)], hide: [], extra: [], ub: { 1: true, 3: true, 4: true } },
      dicht: { p: "150", abfall: "0", zeit: "5" }, oel: { laenge: "", system: "", saug: "" },
      betr: { starts: kw > 50 ? "48211" : "16840", std: kw > 50 ? "21460" : "6120", zaehler: "", weise: "witterungsgeführt" }, bem: "",
    };
  }
  const oel = typ === "boel";
  const pkte = ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "Bu", "Bo"];
  const reihe = (off: number) => pkte.map((pk, i) => {
    const j = pk === "Bu" ? 0 : pk === "Bo" ? 9 : i;
    const basis = { azl: pk, lpos: String(pk === "Bu" ? 10 : pk === "Bo" ? 100 : Math.min(100, j * 11)), lk: String(8 + j * 8), durch: de((oel ? 1.4 : 5) + j * (oel ? 0.38 : 1.9)), bl: String(Math.round(kw * (0.3 + j * 0.078))), o2: de(4.4 - j * 0.12 + off), co: String(12 + i), nox: String(60 + j * 2), ta: String(Math.round(120 + j * 6 + off * 8)), pfr: "0,2", "x:Ansaugtemperatur": "16" };
    return oel ? { ...basis, bs: String(12 + j * 9), ovl: "12", orl: "2,1", russ: "0" } : { ...basis, gs: String(10 + j * 9), gfd: String(18 - i), pvl: "2,4" };
  });
  return {
    typ, ang: { rows: reihe(1.1), hide: [], extra: [["Ansaugtemperatur", "°C"]], ub: {} },
    ver: { rows: reihe(0), hide: [], extra: [["Ansaugtemperatur", "°C"]], ub: { 1: true, 2: true } },
    dicht: { p: "150", abfall: "0", zeit: "5" }, oel: { laenge: oel ? "12" : "", system: oel ? "Einstrang" : "", saug: oel ? "1,5 m | 0,15 bar" : "" },
    betr: { starts: "48211", std: "21460", zaehler: "", weise: "witterungsgeführt" }, bem: "",
  };
}

export async function demodatenEinspielen(wer: string): Promise<{ anlagen: number; auftraege: number }> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from daten where sammlung in ('anlagen', 'auftraege') and not geloescht`;
  if (n > 0) throw Object.assign(new Error("Es sind schon Anlagen oder Aufträge vorhanden. Beispieldaten nur in eine leere Datenbank."), { statusCode: 409 });

  // Monteure für die Beispiele
  async function monteur(name: string, email: string, standort: string, gebiet: string, qual: string[], kosten: number, farbe: number) {
    const [m] = await sql<{ id: string }[]>`select id from mitarbeiter where lower(email) = ${email}`;
    if (m) return m.id;
    const [neu] = await sql<{ id: string }[]>`
      insert into mitarbeiter (kuerzel, name, email, rolle, standort, einsatzgebiet, qualifikationen, selbstkosten, farbe, eintritt)
      values (${name.split(" ").map((t) => t[0]).join("")}, ${name}, ${email}, 'Monteur', ${standort}, ${gebiet}, ${qual}, ${kosten}, ${farbe}, ${heute()})
      returning id`;
    return neu.id;
  }
  const FT = await monteur("Frank Tetzlaff", "frank.tetzlaff@novis-anlagentechnik.de", "Gelnhausen", "Main-Kinzig, Hanau", ["Gas", "Öl", "Brenner"], 77.69, 1);
  const SH = await monteur("Sven Hartmann", "sven.hartmann@novis-anlagentechnik.de", "Offenbach am Main", "Offenbach, Darmstadt", ["Gas"], 70.15, 2);

  const T = heute(), mo = montag(T), tag = (k: number) => plusTage(mo, k), J = new Date().getFullYear();
  const D: [string, string, Daten][] = [];
  const add = (s: string, id: string, d: Daten) => D.push([s, id, d]);

  const kunden: [string, string, string, string, string, string, string, string][] = [
    ["K-10023", "Hausverwaltung Kinzigtal GmbH", "", "Lindenstraße 14", "63450", "Hanau", "06181 55 21 0", "technik@hv-kinzigtal.example"],
    ["K-10031", "Kita Sonnenblume e.V.", "", "Am Wingertsberg 3", "63571", "Gelnhausen", "06051 91 73 0", "leitung@kita-sonnenblume.example"],
    ["K-10044", "Becker", "Thomas und Anja", "Frankfurter Straße 88", "63067", "Offenbach am Main", "069 811 403", "t.becker@mail.example"],
    ["K-10012", "Autohaus Main-Kinzig GmbH", "", "Industriestraße 7", "63571", "Gelnhausen", "06051 8840 0", "haustechnik@ahmk.example"],
    ["K-10018", "Wohnbau Offenbach eG", "", "Mainstraße 40", "63065", "Offenbach am Main", "069 260 30 0", "technik@wohnbau-of.example"],
    ["K-10027", "Schäfer", "Michael", "Hauptstraße 21", "63599", "Biebergemünd", "06050 908 33", "m.schaefer@mail.example"],
    ["K-10035", "Praxis Dr. Lehmann", "", "Bahnhofstraße 12", "63454", "Hanau", "06181 30 40 5", "praxis@dr-lehmann.example"],
    ["K-10038", "Gemeinde Biebergemünd", "", "Am Rathaus 1", "63599", "Biebergemünd", "06050 97 01 0", "bauamt@biebergemuend.example"],
    ["K-10041", "Bäckerei Ruppel", "", "Obergasse 5", "63607", "Wächtersbach", "06053 22 18", "info@baeckerei-ruppel.example"],
    ["K-10046", "Darmstädter Wohnungsbau", "", "Heinrichstraße 120", "64283", "Darmstadt", "06151 28 90", "service@dawo.example"],
  ];
  for (const [nr, name1, name2, str, plz, ort, tel, mail] of kunden) add("kunden", nr, { nr, name1, name2, str, plz, ort, tel, mail });
  const k = (nr: string) => kunden.find((x) => x[0] === nr)!;

  const brenner = (b: string, typ: string) => ({ Brenner: [["Brenner", `${b} ${typ}`], ["Seriennr.", "–"]] });
  const anlagen: Daten[] = [
    { nv: "NV-00042", knr: "K-10023", obj: "Objekt Lindenstraße", hersteller: "Weishaupt", typ: "WTC-GW 60-C", sernr: "7731 4402 18", baujahr: 2016, kw: 60, en: "Gas", gas: "Erdgas H", ans: "20", druck: "2,1", zyk: 12, letzte: plusMonate(T, -12), vertrag: "W-2027-007", betreuer: FT, qr: "k7Qm9xT2pL", ansprech: "Hr. Seibel (Hausmeister) 0171 445 22 10", zugang: "Schlüssel beim Hausmeister, Heizraum UG links", maengel: ["Gasarmatur Baujahr 2016: Tausch nach 10 Jahren fällig"] },
    { nv: "NV-00057", knr: "K-10031", hersteller: "Buderus", typ: "Logano plus KB372-150", sernr: "BU 2208 9911 3", baujahr: 2019, kw: 150, en: "Gas", gas: "Erdgas H", ans: "50", druck: "2,8", zyk: 12, letzte: plusMonate(T, -12), vertrag: "W-2027-012", betreuer: FT, qr: "R4vN8cHw2Z", ansprech: "Fr. Wagner (Leitung)", zugang: "Anmeldung im Büro, Kinder im Haus" },
    { nv: "NV-00063", knr: "K-10044", hersteller: "Viessmann", typ: "Vitodens 200-W B2HF 25", sernr: "7928 1155 0042", baujahr: 2021, kw: 25, en: "Gas", gas: "Erdgas H", ans: "20", druck: "1,6", zyk: 12, letzte: plusMonate(T, -20), vertrag: "", qr: "pX3sLq7Ye1", ansprech: "Hr. Becker, ab 13 Uhr zu Hause", zugang: "EFH, Gerät im Hauswirtschaftsraum" },
    { nv: "NV-00045", knr: "K-10012", obj: "Werkstatthalle", hersteller: "Viessmann", typ: "Vitocrossal 200 mit Weishaupt WM-G10", sernr: "VC 2014 0815", baujahr: 2014, kw: 280, en: "Gas", gas: "Erdgas H", ans: "100", druck: "2,5", zyk: 12, letzte: plusMonate(T, -11), vertrag: "W-2027-003", betreuer: FT, qr: "Wm6G10hAlx", ansprech: "Hr. Krämer 06051 8840 120", zugang: "Heizraum hinter der Werkstatt", details: brenner("Weishaupt", "WM-G10/3-A") },
    { nv: "NV-00048", knr: "K-10018", obj: "Mainstraße 40–44", hersteller: "Buderus", typ: "Logamax plus GB162 Kaskade", sernr: "BU 1709 2231", baujahr: 2017, kw: 240, geraete: 3, en: "Gas", gas: "Erdgas H", ans: "20", druck: "2,4", zyk: 12, letzte: plusMonate(T, -12), vertrag: "W-2027-005", pausch: 320, betreuer: SH, qr: "Kq9B162cAs", ansprech: "Hr. Yilmaz (Hausmeister)", zugang: "Technikraum Haus 42, Kellergang" },
    { nv: "NV-00051", knr: "K-10027", hersteller: "Buderus", typ: "Logano G125", sernr: "BU 1102 7781", baujahr: 2011, kw: 25, en: "Öl", gas: "Heizöl EL schwefelarm", druck: "1,8", zyk: 12, letzte: plusMonate(T, -11), vertrag: "W-2027-009", betreuer: FT, qr: "Sf2Oe125Lb", ansprech: "Hr. Schäfer", zugang: "Keller, Tür links", details: brenner("Buderus", "Logatop BE-A 1.2") },
    { nv: "NV-00054", knr: "K-10035", hersteller: "Wolf", typ: "CGB-2-24", sernr: "W 3304 1189", baujahr: 2020, kw: 24, en: "Gas", gas: "Erdgas H", ans: "20", druck: "1,5", zyk: 12, letzte: plusMonate(T, -13), vertrag: "W-2027-010", betreuer: FT, qr: "Lp5Cgb24Hu", ansprech: "Praxisteam, Anmeldung", zugang: "Dachgeschoss, Abstellraum" },
    { nv: "NV-00059", knr: "K-10038", obj: "Bürgerhaus Kassel", str: "Am Bürgerhaus 2", plz: "63599", ort: "Biebergemünd", hersteller: "Viessmann", typ: "Vitocrossal 300 CU3A", sernr: "VC 1903 4410", baujahr: 2019, kw: 120, en: "Gas", gas: "Erdgas H", ans: "20", druck: "2,2", zyk: 12, letzte: plusMonate(T, -10), vertrag: "W-2027-011", betreuer: FT, qr: "Bh7Vc300Kb", ansprech: "Hausmeister Hr. Roth 0160 228 41 90", zugang: "Schlüssel im Rathaus abholen" },
    { nv: "NV-00061", knr: "K-10041", obj: "Backstube", hersteller: "Buderus", typ: "G234 mit Weishaupt WL30", sernr: "BU 0911 3320", baujahr: 2009, kw: 65, en: "Öl", gas: "Heizöl EL", druck: "1,9", zyk: 12, letzte: plusMonate(T, -14), vertrag: "W-2027-014", betreuer: FT, qr: "Br3Wl30oEl", ansprech: "Fr. Ruppel", zugang: "Ab 5 Uhr geöffnet, Hintereingang", details: brenner("Weishaupt", "WL30Z-C") },
    { nv: "NV-00064", knr: "K-10046", obj: "Heinrichstraße 120", hersteller: "Vaillant", typ: "ecoTEC exclusive 35", sernr: "21 2008 4471", baujahr: 2020, kw: 35, en: "Gas", gas: "Erdgas H", ans: "20", druck: "1,7", zyk: 24, letzte: plusMonate(T, -23), vertrag: "W-2027-016", betreuer: SH, qr: "Dw8Vt35eXc", ansprech: "Hausverwaltung", zugang: "Kellerraum 3" },
  ];
  for (const a of anlagen) {
    const ku = k(String(a.knr));
    add("anlagen", String(a.nv), { str: ku[3], plz: ku[4], ort: ku[5], ...a, ger: `${a.hersteller} ${a.typ}`, pin: String(100000 + Math.floor(Math.random() * 900000)) });
  }

  const O = (nr: number, nv: string, art: string, quelle: string, grund: string, dauer: number, tech: string | null, date: string | null, time: string | null, status: string, extra: Daten = {}) =>
    add("auftraege", `A-${J}-${String(nr).padStart(4, "0")}`, { id: `A-${J}-${String(nr).padStart(4, "0")}`, nv, art, quelle, grund, dauer, tech, date, time, status, ...extra });
  O(311, "NV-00042", "Wartung", "Wartungszyklus", "Jährliche Wartung lt. Vertrag", 2, FT, T, "07:30", "geplant");
  O(318, "NV-00063", "Störung", "Telefon", "Kunde meldet: Gerät geht auf Störung, Anzeige F.4", 1.5, FT, T, "10:30", "geplant", { prio: "hoch" });
  O(320, "NV-00057", "Wartung", "Wartungszyklus", "Jährliche Wartung lt. Vertrag", 2.5, FT, T, "13:30", "geplant");
  O(301, "NV-00054", "Wartung", "Wartungszyklus", "Jährliche Wartung lt. Vertrag", 1.5, FT, tag(0), "07:30", "erledigt");
  O(302, "NV-00045", "Wartung", "Wartungszyklus", "Jährliche Wartung Brenner und Kessel", 4, FT, tag(1), "07:30", "erledigt");
  O(305, "NV-00048", "Wartung", "Wartungszyklus", "Jährliche Wartung Kaskade", 5, SH, tag(1), "07:30", "erledigt");
  O(307, "NV-00064", "Wartung", "Wartungszyklus", "Wartung 24 Monate", 1.5, SH, tag(2), "08:00", "erledigt");
  O(314, "NV-00059", "Wartung", "Wartungszyklus", "Jährliche Wartung", 3, SH, T, "07:30", "geplant");
  O(322, "NV-00048", "Reparatur", `Folgeauftrag aus A-${J}-0305`, "Umwälzpumpe Heizkreis 2 tauschen", 2, SH, werktag(T, 1), "08:00", "geplant", { folge_von: `A-${J}-0305` });
  O(323, "NV-00051", "Wartung", "Wartungszyklus", "Jährliche Wartung Ölfeuerung", 2, FT, werktag(T, 1), "07:30", "geplant");
  O(330, "NV-00061", "Wartung", "Wartungszyklus", "Jährliche Wartung Ölbrenner, überfällig", 3, null, null, null, "offen", { prio: "hoch" });
  O(331, "NV-00045", "Störung", "QR-Aufkleber", "Störmeldung über Servicekarte: „Brenner geht nach Start auf Störung, Halle kalt“", 2, null, null, null, "offen", { prio: "hoch", melder: "Hr. Krämer, 06051 8840 120" });
  O(332, "NV-00042", "Folgeauftrag", `Folgeauftrag aus A-${J}-0311`, "Sicherheitsrelevante Bauteile tauschen (Gasarmatur, Feuerungsautomat). Angebot an Kunden nötig.", 3, null, null, null, "offen", { angebot: true, dring: "In 2 Wochen" });

  const B = (nr: number, auftrag: number, nv: string, tech: string, art: string, datum: string, status: string, az: number, fz: number, km: number, qa: number, zustand: string, folge: number, plan: number, typ: "heiz" | "bgas" | "boel", kw: number, extra: Daten = {}) => {
    const sb = `SB-${J}-${String(nr).padStart(4, "0")}`;
    const material = typ === "boel"
      ? [{ nr: "P-WART", bez: "Pauschale Wartungsset", menge: 1, kfz: true }, { nr: "DÜSE 0,55", bez: "Öldüse 0,55 gph 60° S", menge: 1, kfz: true }, { nr: "FILT-01", bez: "Ölfiltereinsatz", menge: 1, kfz: true }]
      : [{ nr: "P-WART", bez: "Pauschale Wartungsset", menge: 1, kfz: true }, { nr: "480 016", bez: "Dichtung Brennerdeckel", menge: 1, kfz: true }, { nr: "7746 900", bez: "Kondensatsiphon Dichtung", menge: 1, kfz: true }].slice(0, Math.max(1, Math.min(3, nr % 4)));
    const zv = "07:30", ende = 7 * 60 + 30 + Math.round(az * 60);
    add("berichte", sb, {
      sb, id: `A-${J}-${String(auftrag).padStart(4, "0")}`, nv, tech, art, datum, status, az, fz, km, mat: material.length, qa, zustand, folge, plan,
      materialListe: material.map((m) => ({ nr: m.nr, menge: m.menge })), ...extra,
      daten: {
        einsatzart: art, grund: art === "Wartung" ? "Wartung lt. Vertrag" : "Störung", zd: datum, zv, zb: `${String(Math.floor(ende / 60)).padStart(2, "0")}:${String(ende % 60).padStart(2, "0")}`,
        fz: String(fz).replace(".", ","), km: String(km), diagnose: "Anlage im Rahmen der Wartung geprüft." + (zustand === "Mängel" ? " Umwälzpumpe Heizkreis 2 läuft laut, Lagergeräusch." : ""),
        arbeiten: typ === "boel" ? "Brenner zerlegt und gereinigt, Düse und Ölfilter erneuert.\nZündelektroden eingestellt.\nKessel und Abgaswege gereinigt.\nVerbrennung gemessen und eingestellt."
          : "Brenner und Wärmetauscher gereinigt.\nElektroden geprüft und eingestellt.\nSiphon gereinigt und befüllt.\nDichtheitsprüfung Gasarmatur durchgeführt.\nVerbrennung gemessen und eingestellt.",
        mess: messDemo(typ, kw), material, zustand, sbt: "ok", hinweis: zustand === "Mängel" ? "Die Umwälzpumpe Heizkreis 2 sollte zeitnah getauscht werden. Ein Angebot geht Ihnen gesondert zu." : "Die Anlage wurde in betriebssicherem Zustand übergeben.",
        merkblatt: typ !== "boel", mailKunde: true, sigName: "Beispiel", fotos: [],
      },
    });
  };
  B(40, 302, "NV-00045", FT, "Wartung", tag(1), "neu", 3.75, 1, 46, 5.8, "In Ordnung", 0, 4, "bgas", 280);
  B(39, 305, "NV-00048", SH, "Wartung", tag(1), "neu", 4.5, 0.75, 31, 3.1, "Mängel", 1, 3.5, "heiz", 80);
  B(41, 307, "NV-00064", SH, "Wartung", tag(2), "geprüft", 1.25, 1.5, 82, 2.6, "In Ordnung", 0, 1.5, "heiz", 35);
  B(38, 301, "NV-00054", FT, "Wartung", tag(0), "abgerechnet", 1.5, 0.5, 22, 3.4, "In Ordnung", 0, 1.5, "heiz", 24, { re: `RE-${J}-0009` });

  const re = (nr: number, sb: string, nv: string, datum: string, leist: string, status: string, ep: number, bez: string) => {
    const netto = ep, ust = Math.round(netto * 19) / 100;
    add("rechnungen", `RE-${J}-${String(nr).padStart(4, "0")}`, { re: `RE-${J}-${String(nr).padStart(4, "0")}`, sb, nv, datum, leist, status, L: [{ nr: "P-WART-V", bez, menge: 1, einh: "Pausch.", ep }], netto, ust, brutto: Math.round((netto + ust) * 100) / 100, ...(status === "bezahlt" ? { bezahlt: plusTage(datum, 9) } : {}) });
  };
  re(7, `SB-${J}-0031`, "NV-00057", plusTage(T, -34), plusTage(T, -35), "bezahlt", 610, "Wartungspauschale lt. Vertrag W-2027-012, Anlage NV-00057");
  re(8, `SB-${J}-0034`, "NV-00042", plusTage(T, -19), plusTage(T, -20), "offen", 445, "Wartungspauschale lt. Vertrag W-2027-007, Anlage NV-00042");
  re(9, `SB-${J}-0038`, "NV-00054", plusTage(tag(0), 1), tag(0), "offen", 290, "Wartungspauschale lt. Vertrag W-2027-010, Anlage NV-00054");

  add("abwesenheiten", "U1", { id: "U1", tech: FT, art: "Urlaub", von: werktag(T, 12), bis: werktag(T, 16), status: "genehmigt", tage: 5 });
  add("abwesenheiten", "U2", { id: "U2", tech: SH, art: "Urlaub", von: werktag(T, 6), bis: werktag(T, 6), status: "offen", tage: 1, grund: "" });
  add("abwesenheiten", "B1", { id: "B1", tech: FT, art: "Block", von: werktag(T, 1), bis: werktag(T, 1), zeit: "14:00–16:00", status: "offen", grund: "Kind aus der Kita abholen" });
  add("belege", "BL1", { id: "BL1", tech: FT, kat: "Tanken", betrag: 89.4, datum: tag(1), info: "58,2 l · 41 207 km", status: "offen" });
  add("belege", "BL2", { id: "BL2", tech: SH, kat: "Material", betrag: 23.15, datum: tag(2), info: `Dichtungen Baumarkt, A-${J}-0305`, status: "offen" });
  for (const [t, z] of [[FT, ["07:00", "15:30", 30]], [SH, ["07:15", "16:00", 30]]] as const) {
    for (let i = 0; i < 5; i++) { const d = tag(i); if (d >= T) break; add("zeiten", `${t}_${d}`, { tech: t, datum: d, kommen: z[0], gehen: z[1], pause: z[2] }); }
  }
  const artikel: [string, string, string, number][] = [["7816 140", "Zündelektrode WTC-GW", "Weishaupt", 28.4], ["4806 9902", "Ionisationselektrode WTC-GW", "Weishaupt", 24.9], ["480 016", "Dichtung Brennerdeckel", "Weishaupt", 11.7],
    ["7746 900", "Kondensatsiphon Dichtung", "Buderus", 7.85], ["8718 600", "Neutralisationsgranulat 1 kg", "Buderus", 17.2], ["7828 745", "Zünd-/Ionisationselektrode Vitodens", "Viessmann", 31.5],
    ["7835 525", "Brennerdichtung Vitodens", "Viessmann", 9.6], ["DÜSE 0,55", "Öldüse 0,55 gph 60° S", "Danfoss", 15.1], ["FILT-01", "Ölfiltereinsatz", "Oventrop", 9.1],
    ["P-WART", "Pauschale Wartungsset", "NOVIS", 38.4], ["P-KLEIN", "Kleinmaterial-Pauschale", "NOVIS", 0]];
  artikel.forEach(([nr, bez, her, ek], i) => add("artikel", `art-${i + 1}`, { nr, bez, her, ek }));
  const am: [string, string, string, string | null, string, number, number][] = [["Abgasmessgerät Testo 330i", "Messgerät", "63411287", FT, "Kalibrierung", 12, -344], ["Abgasmessgerät Testo 300", "Messgerät", "63530912", SH, "Kalibrierung", 12, -120],
    ["Gaslecksuchgerät Testo 316-2", "Messgerät", "40287711", FT, "Funktionsprüfung", 12, -200], ["Druckprüfset Gas / Wasser digital", "Messgerät", "DP-2207", FT, "Kalibrierung", 24, -400],
    ["Akku-Bohrhammer, Akku-Schrauber", "Elektrowerkzeug", "–", FT, "DGUV V3", 12, -356], ["Servicefahrzeug VW Transporter", "Fahrzeug", "KFZ-01", FT, "UVV-Prüfung", 12, -30]];
  am.forEach(([bez, art, sn, w, pruef, iv, tage], i) => add("arbeitsmittel", `am-${i + 1}`, { bez, art, sn, wer: w, pruef, iv, letzte: plusTage(T, tage) }));
  [["Serviceberater VW Partner", "Autohaus Main-Kinzig, Hr. Krämer", "06051 8840 120"], ["Pannenhilfe / Mobilitätsgarantie", "VW Nutzfahrzeuge Service", "0800 865 7936"]]
    .forEach(([rolle, name, tel], i) => add("kontakte", `ko-${i + 1}`, { rolle, name, tel }));

  await sql.begin(async (tx) => {
    for (const [s, id, d] of D) {
      await tx`insert into daten (sammlung, id, daten, geaendert_von) values (${s}, ${id}, ${tx.json(d as never)}, 'Beispieldaten')
        on conflict (sammlung, id) do update set daten = excluded.daten, geloescht = false, version = daten.version + 1, geaendert_am = clock_timestamp()`;
    }
    const zaehler: [string, number, number][] = [["A", J, 340], ["SB", J, 41], ["RE", J, 9], ["NV", 0, 64], ["K", 0, 46]];
    for (const [kreis, jahr, letzte] of zaehler) {
      await tx`insert into nummernkreise (kreis, jahr, letzte) values (${kreis}, ${jahr}, ${letzte})
        on conflict (kreis, jahr) do update set letzte = greatest(nummernkreise.letzte, excluded.letzte)`;
    }
  });
  await protokolliere(wer, "Beispieldaten eingespielt", `${anlagen.length} Anlagen, ${D.filter((x) => x[0] === "auftraege").length} Aufträge`);
  return { anlagen: anlagen.length, auftraege: D.filter((x) => x[0] === "auftraege").length };
}
