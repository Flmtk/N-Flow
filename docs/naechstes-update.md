# N-Flow · Gesammelt für das nächste Update

Stand: 24.10.2026 (ergänzt 16:15). Wird beim nächsten Update abgearbeitet und danach hier abgehakt.

## Neu bauen

### Monteur-App: Aufbau
- [ ] Reiter **„Intranet“ heißt künftig „Info“**: zeigt immer die aktuellen Infos von einer eigenen Info-Seite in SharePoint, die das Büro dort pflegt (SharePoint-Neuigkeiten/Seiten, über Graph gelesen). Neue Info optional mit Push.
- [ ] Bereich „Ich“ neu gliedern in übersichtliche Reiter:
  - **Zeiten:** Zeiterfassung, Nachstempeln und Block an einem Ort.
  - darunter **Belege**.
  - **Einstellungen:** Kalender, Mitteilungen, Hell/Dunkel, Sprache, Software-Version.
- [ ] **Farbschema** wählbar: Orange (wie jetzt), Grau oder schlicht Weiß.

### Interne Hinweise am Auftrag („i“)
- [ ] Plantafel im Büro: am Termin ein „i“, in das der Innendienst einen Hinweis schreibt.
- [ ] Monteur-App: Aufträge mit Hinweis zeigen daneben ein „i“; Tippen zeigt den Hinweis.
- [ ] Hinweise werden fortlaufend in der Anlagenakte gespeichert (mit Datum und Verfasser) und bei jedem neuen Termin dieser Anlage automatisch wieder angezeigt, bis sie jemand als erledigt markiert.

### Büro: Fahrzeuge
- [ ] Fahrzeug anlegen und einem Mitarbeiter zuordnen (Kennzeichen, Modell, TÜV, Inspektion, Leasing/Versicherung, Tankkarte).
- [ ] Durchschnittsverbrauch automatisch aus km-Stand und Litern der Tankbelege (l/100 km), mit Verlauf und Auffälligkeiten.
- [ ] Reifen: wo eingelagert (Betrieb, Einlagerungsnummer), welcher Satz montiert, Wechseltermin.
- [ ] Erinnerungen bei fälligem TÜV, Inspektion, Reifenwechsel.

### Büro: Fahrzeuglager und Nachbestellung
- [ ] Soll-Bestand je Fahrzeug (Artikel und Mindestmenge).
- [ ] Material, das der Monteur im Bericht verbucht, wird vom Fahrzeugbestand abgezogen.
- [ ] Übersicht „Was fehlt“ je Fahrzeug (App und Büro).
- [ ] Automatische E-Mail mit Artikelnummern und Mengen zum Nachbestellen.

### Büro: Mahnungen
- [ ] Mahnung aus einer überfälligen Rechnung erzeugen (Zahlungserinnerung, 1. und 2. Mahnung), als PDF ansehen und per E-Mail senden.
- [ ] Ablage in SharePoint im Ordner `Rechnungen` des Kunden, Verlauf an der Rechnung.

### Büro: Zahlungsverhalten des Kunden
- [ ] Einstufung in der Kundenakte (z. B. grün/gelb/rot) aus durchschnittlicher Zahlungsdauer, Anzahl der Mahnungen und offenen Beträgen. Hinweis auch bei der Planung neuer Aufträge.

### Entschieden (24.10.2026)
- **SharePoint getrennt nach Umgebung:** Die Testumgebung nutzt die bisherige Website (Anzeigename wird „NOVIS Test“). Für den Echtbetrieb wird eine eigene Website „NOVIS“ angelegt und in der `.env` der Live-Umgebung eingetragen. Info-Seite jeweils auf der Website der Umgebung.
- **Hinweise:** Alle Hinweise bleiben in der Anlagenakte stehen, auch solche, die nur einen Termin betrafen. Sie lassen sich als erledigt markieren, werden aber nie gelöscht.
- **Nachbestellung:** Mail an `einkauf@novis-anlagentechnik.de`.
- **Mahnungen:** Fristen (Tage bis Erinnerung, 1. und 2. Mahnung) und Gebühren stellt die Geschäftsführung unter Einstellungen selbst ein.
- **Überfällige Rechnungen:** Sobald eine Rechnung fällig und unbezahlt ist (und bei jeder neuen Mahnstufe), geht eine Mail an `rechnung@novis-anlagentechnik.de`.
- Voraussetzung: `einkauf@` und `rechnung@` als freigegebene Postfächer oder Aliasse in Microsoft 365 anlegen (kostenlos).

## Offen bei Microsoft 365 (macht Florian, keine Programmierung)
- [ ] Mailsperre 5.7.708: Abo prüfen (Testversion → bezahlt) bzw. Supportfall öffnen; DKIM für novis-anlagentechnik.de aktivieren (CNAMEs bei IONOS zusätzlich eintragen); SPF mit `include:spf.protection.outlook.com` prüfen.
- [ ] SharePoint: freischalten, danach `Sites.FullControl.All` in Entra entfernen, „Alles nachholen“.
- [ ] Testkonto `test.monteur@novis-anlagentechnik.de` ohne Lizenz anlegen, der App N-Flow zuweisen, in N-Flow als Monteur anlegen.

## Vor dem Echtbetrieb
- [ ] Server: Anmeldung per SSH-Schlüssel, Passwort-Anmeldung abschalten.
- [ ] Zweite Sicherungskopie außerhalb des Servers.
- [ ] Live-Umgebung `app.novis-anlagentechnik.de` (Weiterleitungs-URI in Entra, `INSTANZ=live`).
- [ ] Mail.Send per Exchange-Zugriffsrichtlinie auf das Service-Postfach beschränken.

## Später
- [ ] XRechnung / E-Rechnung.
- [ ] Routenplanung mit echtem Kartendienst.
- [ ] Weitere Erinnerungen (Stempeln, 30 Min. vor Termin, Bericht eingegangen).
- [ ] Fahrzeugdaten statt Platzhalter.
