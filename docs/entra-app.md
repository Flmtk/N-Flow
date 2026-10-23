# Microsoft-Anmeldung einrichten (Entra ID)

Damit sich alle mit ihrem NOVIS-Microsoft-Konto bei N-Flow anmelden, braucht N-Flow eine „App-Registrierung“ in eurem Microsoft 365. Dauer: etwa 10 Minuten. Dafür braucht ihr ein Konto mit Administratorrechten in Microsoft 365.

## 1. App registrieren

1. <https://entra.microsoft.com> öffnen und mit dem Admin-Konto anmelden.
2. Links **Anwendungen → App-Registrierungen → Neue Registrierung**.
3. Ausfüllen:
   - **Name:** `N-Flow`
   - **Unterstützte Kontotypen:** *Nur Konten in diesem Organisationsverzeichnis* (Single Tenant)
   - **Umleitungs-URI:** Plattform **Web**, Adresse `https://test.novis-anlagentechnik.de/auth/callback`
4. **Registrieren**.

Auf der Übersichtsseite stehen jetzt zwei Werte – beide notieren:

| In Entra heißt es | In der `.env` |
|---|---|
| Anwendungs-ID (Client) | `MS_CLIENT_ID` |
| Verzeichnis-ID (Mandant) | `MS_TENANT_ID` |

## 2. Geheimen Schlüssel anlegen

1. In der App links **Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel**.
2. Beschreibung `N-Flow Server`, Ablauf **24 Monate**.
3. Den **Wert** (nicht die „Geheimnis-ID“) sofort kopieren – er wird nur einmal angezeigt. Er gehört nach `MS_CLIENT_SECRET`.

> Den Schlüssel nur direkt in die `.env` auf dem Server eintragen, nicht per Mail oder Chat weitergeben. Ablaufdatum im Kalender notieren (in 23 Monaten erneuern).

## 3. Berechtigungen

Unter **API-Berechtigungen** steht bereits `Microsoft Graph → User.Read`. Das genügt für die Anmeldung. Zusätzlich hinzufügen (**Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen**): `openid`, `profile`, `email`, `offline_access`. Danach **Administratorzustimmung für NOVIS erteilen**.

SharePoint-Rechte (Berichte und Rechnungen ablegen) kommen erst in Etappe 3 dazu.

## 4. E-Mails aus N-Flow senden (Terminbestätigungen)

1. **Postfach anlegen:** admin.microsoft.com → Teams & Gruppen → **Freigegebene Postfächer** → Postfach hinzufügen, Name `NOVIS Service`, Adresse `service@novis-anlagentechnik.de`. Kostet keine Lizenz. Dich und Jens als Mitglieder eintragen, dann seht ihr Antworten von Kunden in Outlook.
2. **Berechtigung:** Entra → App-Registrierungen → N-Flow → **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Anwendungsberechtigungen → `Mail.Send`** → Hinzufügen → **Administratorzustimmung erteilen**.
3. In der `.env` steht `MAIL_ABSENDER=service@novis-anlagentechnik.de`. Danach `docker compose up -d`.

> Vor dem Echtbetrieb einschränken, dass N-Flow nur aus diesem Postfach senden darf (Exchange-Zugriffsrichtlinie für Anwendungen). Ohne Einschränkung könnte die App technisch aus jedem Postfach der Firma senden.

## 5. Live-Adresse später ergänzen

Wenn die Live-Umgebung startet: unter **Authentifizierung → URI hinzufügen** zusätzlich `https://app.novis-anlagentechnik.de/auth/callback` eintragen.

## 5. Wer darf hinein?

- Die Adressen in `ADMIN_EMAILS` werden beim ersten Anmelden automatisch als Geschäftsführung angelegt.
- Alle anderen legt ihr in N-Flow unter **Mitarbeiter** an. Wer dort nicht steht, kommt nicht hinein – auch nicht mit gültigem Microsoft-Konto.
- Sperren in N-Flow wirkt sofort. Beim Austritt zusätzlich das Microsoft-Konto deaktivieren.
