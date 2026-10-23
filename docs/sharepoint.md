# Ablage in SharePoint einrichten

N-Flow legt Serviceberichte, Rechnungen, Fotos, Belege und ein Kundenstammblatt automatisch in einer eigenen SharePoint-Website ab. Dauer der Einrichtung: etwa 15 Minuten, mit Administratorkonto.

## Aufbau in SharePoint

```
Kunden/
  K-10001 Müller, Petra/
    Kundenstammblatt.pdf
    Rechnungen/RE-2027-0007 2027-03-04.pdf      (Rechnung mit Servicebericht als Anlage)
    NV-00012 Buderus GB192 (Ringstraße 4, Gelnhausen)/
      Berichte/SB-2027-0001 Wartung 2027-03-04.pdf
      Fotos/SB-2027-0001 Foto 1.jpg
Belege/2027/2027-03/2027-03-04 Tanken 89,40 EUR Frank Tetzlaff (….).jpg
Intern/   (Einsätze ohne Kundenanlage)
```

- Bei jeder Änderung in N-Flow wird die Datei ersetzt. SharePoint behält die ältere Fassung im Versionsverlauf.
- Ändert sich ein Kundenname, benennt N-Flow den Ordner um. Die Akte bleibt zusammen.
- Ist SharePoint kurz nicht erreichbar, versucht N-Flow es später erneut. Nichts geht verloren.
- Berichte gehen **nicht** automatisch an Kunden. Rechnungen verschickt das Büro über „Per E-Mail senden“.

## 1. Website anlegen

1. <https://www.office.com> → **SharePoint** → **+ Website erstellen** → **Teamwebsite**.
2. Name `NOVIS Ablage`, Datenschutz **Privat**, Sprache Deutsch. Jens als Mitglied hinzufügen.
3. Die Adresse aus der Browserzeile notieren, z. B. `https://novisanlagentechnik.sharepoint.com/sites/NOVISAblage`.

## 2. Berechtigung in Entra

<https://entra.microsoft.com> → **App-Registrierungen → N-Flow → API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Anwendungsberechtigungen**:

- `Sites.Selected` (dauerhaft: N-Flow darf nur auf Websites, die ausdrücklich freigegeben sind)
- `Sites.FullControl.All` (**nur vorübergehend** für Schritt 4)

Danach **Administratorzustimmung für NOVIS erteilen**.

## 3. Adresse in die .env

Im Hostinger-Terminal:

```sh
cd /docker/n-flow-test
nano .env
```

Unten ergänzen (eure Adresse aus Schritt 1):

```
SHAREPOINT_SEITE=https://novisanlagentechnik.sharepoint.com/sites/NOVISAblage
```

Speichern (Ctrl+O, Enter, Ctrl+X), dann `sh ops/update.sh`.

## 4. Freischalten und aufräumen

1. N-Flow Büro → **Administration → SharePoint → N-Flow für die Website freischalten**.
2. Zurück in Entra: bei `Sites.FullControl.All` auf **…** → **Berechtigung entfernen** (und Zustimmung widerrufen, falls gefragt).
3. In N-Flow **Aktualisieren**: Es muss weiterhin **Verbunden** stehen. Jetzt hat N-Flow nur noch Zugriff auf diese eine Website.
4. **Alles nachholen**: Vorhandene Kunden, Berichte, Rechnungen und Belege werden abgelegt.

## Wenn etwas nicht klappt

Unter **Administration → SharePoint** stehen Hinweise und Fehler mit Grund. „Fotos noch nicht hochgeladen“ ist normal, wenn ein Handy offline war. Das erledigt sich, sobald das Handy wieder Netz hat.
