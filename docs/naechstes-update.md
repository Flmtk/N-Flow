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

### Noch zu klären
- Info-Seite: eigene Website „NOVIS Info“ in SharePoint oder eine Seite auf „NOVIS Ablage“? (Bei eigener Website muss N-Flow auch dafür freigeschaltet werden.)
- Hinweise: Gibt es neben dauerhaften Hinweisen zur Anlage („Hund im Garten“) auch Hinweise nur für einen einzelnen Termin?
- Nachbestellung: An wen geht die Mail (Büro oder direkt an den Großhändler)? Wer legt die Mindestmengen fest?
- Mahnungen: Fristen und Mahngebühren je Stufe.

### Unterlagen zur Anlage
- [ ] Ordner `Unterlagen/` in der Kundenakte je Anlage (`Kunden/K-…/NV-…/Unterlagen/`) für Schaltplan, Hydraulikschema, Abnahmeprotokoll, Foto Typenschild.
- [ ] Hochladen im Büro (Datei in die Anlage ziehen) und in der App (fotografieren oder Datei wählen).
- [ ] Anzeige unter „Dokumente zur Anlage“ in Anlagenakte (App und Büro), öffnen mit einem Tippen. Ersetzt die Platzhalter aus dem Prototyp.

### Herstellerunterlagen
- [ ] Zentral in SharePoint `Intranet/Herstellerunterlagen/<Hersteller>/` (Manuals, Serviceanleitungen, Ersatzteillisten, Störcodes).
- [ ] Automatische Zuordnung in der Anlagenakte über Hersteller und Typ im Dateinamen (z. B. Buderus + „KB372“).

### Dokumente im Bereich „Info“
- [ ] Ordner `Intranet/` auf der Website NOVIS Ablage (Herstellerunterlagen, Formulare, Arbeitsanweisungen, Prüfprotokolle Messgeräte, Gefährdungsbeurteilungen). In der App mit Suche, ersetzt die Beispielinhalte.

### Offline im Heizungskeller
- [ ] Unterlagen der Anlagen aus der heutigen Tour morgens vorladen.
- [ ] Einzelne Dateien als „offline verfügbar“ markieren.

### Belege
- [ ] Monatsliste für den Steuerberater (PDF oder Excel) mit allen Belegen und Summe je Art, automatisch im Monatsordner `Belege/JJJJ/JJJJ-MM/`.

### Kleinigkeiten
- [ ] Fotoseite im Servicebericht: bei vielen Fotos auf mehrere Seiten verteilen.
- [ ] Rechnungsfenster: Eingabefeld „Test an eigene Adresse“ im N-Flow-Stil.

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
