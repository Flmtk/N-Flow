# N-Flow · Liste der Updates

## Update vom 07.11.2026 (großes Update)

Einspielen auf dem Server wie immer: `cd /docker/nflow && sh ops/update.sh`
Die Datenbank-Änderung (Migration 008) läuft beim Start automatisch.

**Neue Einträge in der `.env` (alle optional, sonst gilt der Standard):**
- `MAIL_VON_INFO=info@novis-anlagentechnik.de` (Terminbestätigungen, Nachbestellungen, interne Meldungen)
- `MAIL_VON_RECHNUNG=rechnung@novis-anlagentechnik.de` (Rechnungen, Mahnungen)
- `ANMELDUNG_WOECHENTLICH=1` (montags neu anmelden; `0` schaltet es ab)
- `MAIL_ABSENDER` wird nicht mehr gebraucht.

**Nach dem Einspielen:**
- Alle Anmeldungen enden am nächsten Montag 0:00 Uhr, danach meldet sich jeder einmal neu an (Microsoft fragt nach Kennwort bzw. Bestätigung).
- Am Handy N-Flow einmal ganz schließen und neu öffnen, damit die neue Version geladen wird (App-Cache v9).
- Die Postfächer `info@` und `rechnung@` müssen in Microsoft 365 existieren und für die App freigegeben sein (siehe `docs/entra-app.md`, Abschnitt 4).

**Enthalten:**
- [x] Messung: leere Messpunkte erlaubt, dann Begründung im Bemerkungsfeld.
- [x] E-Mails als richtige HTML-Mails mit Logo, Info-Kasten und Impressum; Terminbestätigungen von info@, Rechnungen und Mahnungen von rechnung@.
- [x] Startbild beim ersten Öffnen am Tag (App und Büro): Logo baut sich auf und fliegt an seinen Platz. Nicht beim QR-Sprung, Antippen überspringt.
- [x] Montags neu anmelden (Büro und App), Hinweis auf der Anmeldeseite, nicht gesendete Einträge bleiben erhalten.
- [x] App fühlt sich wie eine echte App an: kein Tap-Blitz, keine Verzögerung, kein Zoom bei Eingaben, kein Ziehen-zum-Aktualisieren, Statusleiste in Kopffarbe, Hover nur mit Maus.
- [x] Bewegungen mit Federn: Rückmeldung beim Drücken, Hinweisblatt ziehen/schnippen, Mitteilung wegwischen, Aufträge nach links wischen („Anrufen“), Vor/Zurück-Übergang, durchscheinende Leiste unten.
- [x] App am PC: Anlage gleitet rechts herein, die Tagesliste bleibt stehen; am Kopf wegziehen, ✕ oder Esc.
- [x] Büro: Schubladen kommen von rechts und gehen dorthin zurück, am Kopf wegziehen; „i“ in der Plantafel auf dem iPad immer sichtbar.
- [x] „Bewegung reduzieren“ und „Transparenz reduzieren“ am Gerät werden berücksichtigt.

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
- [ ] Freigegebene Postfächer `info@`, `einkauf@` und `rechnung@` anlegen und für die App freigeben.
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
