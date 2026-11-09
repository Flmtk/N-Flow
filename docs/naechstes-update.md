# N-Flow · Liste der Updates

## Update „Anlagenaufnahme und Wartungsvertrag“ (09.11.2026)

Einspielen: `cd /docker/n-flow-test && sh ops/update.sh`. Keine neuen Einträge in der `.env`, keine Datenbank-Migration.

**Nach dem Einspielen:**
- Büro neu laden. Am Handy N-Flow einmal ganz schließen und neu öffnen (App-Cache v15).
- Unter Kalkulation › Einstellungen › Rahmenbedingungen den neuen Baustein „Wartungsvertrag“ prüfen (Leistungsumfang, Laufzeit, Kündigungsfrist). Der Text ist ein Vorschlag und gehört juristisch geprüft.

**Enthalten:**
- [x] Kalkulation › Aufnahmen: Anlagenaufnahme planen, für einen Kunden aus dem Stamm oder einen Interessenten, mit Monteur, Termin und Hinweis. Der Auftrag erscheint in der Plantafel und beim Monteur unter „Heute“.
- [x] Die Aufnahme ist kostenlos; die erste reguläre Anfahrt ist die Inspektion.
- [x] Monteur-App: Einsatz „Anlagenaufnahme“ mit dem Erfassungsformular (Wärmeerzeuger, Brenner, Regelung, Hydraulik, Abgas). Dazu Zustand, Besonderheiten, Fotos, Neutralisation und AwSV.
- [x] Typenschild fotografieren: Hersteller, Typ, Seriennummer, Baujahr und Leistung werden erkannt und orange markiert eingetragen. Das geht auch beim Anlegen einer neuen Anlage.
- [x] Fertige Aufnahmen stehen in der Kalkulation mit der Pauschale nach K-01 (Stunden, Zone) und zählen im Menü mit.
- [x] Ein Klick erstellt das Angebot zum Wartungsvertrag: eine Position je Anlage mit K-01-Preis und Freitext. Der Preis ist anpassbar, die Abweichung von K-01 wird angezeigt. Intern zählt die Fahrt mit.
- [x] Nach dem Angebot geht alles wie gewohnt: Vier-Augen-Freigabe, PDF, SharePoint und Mail an rechnung@.
- [x] Angenommen: Die Anlage bekommt automatisch einen Wartungsvertrag (W-JJJJ-NNN) mit der angebotenen Pauschale. Der Monteur der Aufnahme wird Betreuer, und aus dem Interessenten wird ein Kunde.

## Update „Kalkulation und Angebote“ (09.11.2026)

Einspielen: `cd /docker/n-flow-test && sh ops/update.sh`. Keine neuen Einträge in der `.env`, keine Datenbank-Migration.

**Nach dem Einspielen:**
- Im Büro einmal neu laden. Der Punkt „Kalkulation“ erscheint für die Geschäftsführung (Recht „Kalkulation und Angebote“, unter Administration › Rechte auch für andere Rollen freischaltbar).
- Unter Kalkulation › Einstellungen die internen Werte prüfen (Stundensatz, Zeit je Anlagentyp, Mindestmarge). Vorbelegt sind Werte aus der Excel-Vorlage bzw. Schätzwerte.
- Die Mail nach der Freigabe geht von info@ an rechnung@. Solange Microsoft-Mail noch blockiert ist, steht im Angebot „Mail nicht gesendet“ mit dem Knopf „Mail erneut senden“.

**Enthalten:**
- [x] Kalkulation aus der Excel-Vorlage: Leistungen aus dem Katalog (GDRA-Typen, Stunden), freie Positionen, Nebenkosten (km, Messgerät, Übernachtung) mit Kennzeichnung „geschätzt“.
- [x] Freitextfeld unter jeder Position (auch bei Nebenkosten), erscheint im Angebot unter der Bezeichnung.
- [x] Kunde aus dem Kundenstamm oder Interessent ohne Kundennummer.
- [x] Intern: Kosten, Deckungsbeitrag und Marge live, Warnfarbe unter der Mindestmarge.
- [x] Rahmenbedingungen als Textbausteine zum An- und Abwählen; Texte werden beim Einreichen festgeschrieben.
- [x] Freigabe immer im Vier-Augen-Prinzip: wer erstellt oder eingereicht hat, kann nicht freigeben (Server prüft). Push an die andere Geschäftsführung, Zähler im Menü.
- [x] Nach der Freigabe: PDF (mehrseitig, vorher mit Wasserzeichen ENTWURF), Ablage in SharePoint (Kunden › Kunde › Angebote bzw. Angebote › Interessenten), Mail mit PDF an rechnung@ „bitte versenden“.
- [x] Danach: als versendet markieren, Angenommen/Abgelehnt, neue Fassung (Rev. 2, 3 …) mit erneuter Freigabe. Verlauf und Protokoll.
- [x] Einstellungen: Leistungskatalog, Nebenkosten-Sätze, interne Kosten, MwSt., Gültigkeit, Zahlungsziel, Textbausteine.

## Update „Einsatzhilfen“ (08.11.2026)

Einspielen: `cd /docker/n-flow-test && sh ops/update.sh` (das Update baut das Programm neu, dabei kommt die Texterkennung tesseract dazu und es dauert etwas länger).

**Neu in der `.env` (für SMS, optional):**
- `SMS_API_KEY=` API-Schlüssel von seven.io (Konto auf seven.io anlegen, Guthaben aufladen, unter Entwickler › API-Schlüssel erzeugen)
- `SMS_ABSENDER=NOVIS` (max. 11 Zeichen)
- Ohne Schlüssel geht „Bin unterwegs“ per E-Mail von info@, wenn beim Kunden eine Adresse hinterlegt ist.

**Enthalten:**
- [x] Arbeitsschritte zum Abhaken je Einsatzart und Gerätetyp (Gas-Heizgerät, Gebläsebrenner, Öl, Inbetriebnahme); „entfällt“ möglich; Seite „Arbeitsschritte“ im Servicebericht.
- [x] Büro: Einstellungen › Vorlagen für Arbeitsschritte und Textbausteine.
- [x] Messung: letzte Messwerte klein unter jedem Feld, starke Abweichungen orange, CO und qA über Grenzwert sofort rot bzw. gelb.
- [x] Messausdruck fotografieren: Werte werden erkannt und nach Bestätigung in den Messpunkt übernommen.
- [x] Störungshilfe: Fehlercode eintragen, „Frühere Fälle“ zeigt Ursachen und getauschte Teile bei gleichem Hersteller/Typ.
- [x] „Bin unterwegs“: Kunde per SMS (Absender NOVIS) oder E-Mail informieren, Ankunftszeit wählbar; Vermerk am Auftrag und auf der Tagesliste.
- [x] Kunde: Feld „Mobil (für SMS)“ und Haken „Über die Anfahrt informieren“.
- [x] Fehler behoben: Antippen des abgedunkelten Hintergrunds schließt das Hinweisblatt wieder.

## Update vom 07.11.2026 (großes Update)

Einspielen auf dem Server wie immer: `cd /docker/n-flow-test && sh ops/update.sh`
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
- [x] Ladebildschirm mit „service redefined.“ bei jedem weiteren Öffnen der App aus geschlossenem Zustand; die App startet immer auf „Heute“ (außer beim QR-Sprung).
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
