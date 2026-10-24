# N-Flow · Gesammelt für das nächste Update

Stand: 24.10.2026. Wird beim nächsten Update abgearbeitet und danach hier abgehakt.

## Neu bauen

### Unterlagen zur Anlage
- [ ] Ordner `Unterlagen/` in der Kundenakte je Anlage (`Kunden/K-…/NV-…/Unterlagen/`) für Schaltplan, Hydraulikschema, Abnahmeprotokoll, Foto Typenschild.
- [ ] Hochladen im Büro (Datei in die Anlage ziehen) und in der App (fotografieren oder Datei wählen).
- [ ] Anzeige unter „Dokumente zur Anlage“ in Anlagenakte (App und Büro), öffnen mit einem Tippen. Ersetzt die Platzhalter aus dem Prototyp.

### Herstellerunterlagen
- [ ] Zentral in SharePoint `Intranet/Herstellerunterlagen/<Hersteller>/` (Manuals, Serviceanleitungen, Ersatzteillisten, Störcodes).
- [ ] Automatische Zuordnung in der Anlagenakte über Hersteller und Typ im Dateinamen (z. B. Buderus + „KB372“).

### Intranet
- [ ] Ordner `Intranet/` auf der Website NOVIS Ablage (Herstellerunterlagen, Formulare, Arbeitsanweisungen, Prüfprotokolle Messgeräte, Gefährdungsbeurteilungen). In der App mit Suche, ersetzt die Beispielinhalte.
- [ ] Neuigkeiten im Büro schreiben, erscheinen auf der Intranet-Startseite der App, optional mit Push-Mitteilung.

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
