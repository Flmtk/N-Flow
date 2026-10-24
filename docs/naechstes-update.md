# N-Flow · Liste der Updates

## Erledigt im Update vom 24.10.2026

- [x] Neues Design: weißer bis leicht grauer Arbeitsbereich, Seitenleiste leicht grau, Überschriften in Serifenschrift, Logo im Kasten oben links mit dem N aus dem NOVIS-Logo, neue App-Symbole.
- [x] Farbschema Orange, Grau oder Weiß (Büro: Einstellungen › Allgemein; App: Ich › Einstellungen), Hell/Dunkel.
- [x] App: „Intranet“ heißt „Info“, Neuigkeiten und Dokumente aus SharePoint, Suche.
- [x] App: „Ich“ mit Reitern Zeiten (Stempeln, Urlaub und Block, Kalender), Belege, Fahrzeug, Einstellungen (Farbschema, Darstellung, Sprache, Kalender, Mitteilungen, Version).
- [x] Interne Hinweise mit „i“: Plantafel und Auftrag im Büro, Anlagenakte, Monteur-App; bleiben in der Akte, erledigt markierbar.
- [x] Unterlagen zur Anlage (Upload in Büro und App, Ablage in SharePoint), passende Herstellerunterlagen automatisch, Vorladen der Tagestour, offline lesbar.
- [x] Fahrzeuge: Zuordnung, Verbrauch aus Tankbelegen, Reifen und Einlagerung, TÜV/Inspektion/UVV/Leasing mit Hinweisen.
- [x] Fahrzeuglager: Soll und Mindestmenge, Abbuchung aus den Berichten, Mail an einkauf@ zum Nachbestellen.
- [x] Mahnwesen: Stufen, Fristen und Gebühren einstellbar, PDF, Versand, Ablage in SharePoint, morgendliche Meldung an rechnung@.
- [x] Zahlungsverhalten je Kunde (pünktlich, oft verspätet, Zahlungsprobleme) in Kunde, Anlage, Auftrag und Rechnungsliste.
- [x] Belegliste je Monat (PDF und CSV) in SharePoint, Fotoseiten im Bericht auf mehrere Seiten verteilt.

## Offen bei Microsoft 365 (macht Florian, keine Programmierung)
- [ ] Mailsperre 5.7.708: Abo prüfen (Testversion → bezahlt) bzw. Supportfall öffnen; DKIM für novis-anlagentechnik.de aktivieren; SPF prüfen.
- [ ] Freigegebene Postfächer `einkauf@` und `rechnung@` anlegen.
- [ ] SharePoint: freischalten, danach `Sites.FullControl.All` entfernen, „Alles nachholen“. Website-Anzeigename „NOVIS Test“.
- [ ] Ordner `Intranet` mit Unterordnern anlegen, erste Neuigkeit veröffentlichen.
- [ ] Testkonto `test.monteur@novis-anlagentechnik.de` ohne Lizenz anlegen, der App N-Flow zuweisen, in N-Flow als Monteur anlegen.

## Vor dem Echtbetrieb
- [ ] Server: Anmeldung per SSH-Schlüssel, Passwort-Anmeldung abschalten.
- [ ] Zweite Sicherungskopie außerhalb des Servers.
- [ ] Live-Umgebung `app.novis-anlagentechnik.de` mit eigener SharePoint-Website „NOVIS“ (Weiterleitungs-URI in Entra, `INSTANZ=live`).
- [ ] Mail.Send per Exchange-Zugriffsrichtlinie auf das Service-Postfach beschränken.

## Später
- [ ] XRechnung / E-Rechnung.
- [ ] Routenplanung mit echtem Kartendienst.
- [ ] Weitere Erinnerungen (Stempeln, 30 Min. vor Termin, Bericht eingegangen).
- [ ] Weitere Sprachen in der App.
