# N-Flow

Service-Software der NOVIS Anlagentechnik GmbH: Monteur-App (PWA), Planung im Büro und Administration. Läuft auf dem eigenen Server, Anmeldung über Microsoft 365, Ablage der Berichte und Rechnungen in SharePoint.

## Stand

| Etappe | Inhalt | Status |
|---|---|---|
| 1 | Server, Datenbank, Microsoft-Anmeldung, Mitarbeiter und Rechte, Protokoll, Sicherung | in Arbeit |
| 2 | Kunden, Anlagen, QR-Aufkleber und Inbetriebnahme | geplant |
| 3 | Monteur-App: Einsatz, Messblatt, Bericht, Ablage in SharePoint | geplant |
| 4 | Plantafel, Wartungsplanung, Terminbestätigung | geplant |
| 5 | Rechnungen, Preise (Formular K-01), Auswertungen, Push | geplant |

## Aufbau

```
server/          Fastify + TypeScript, PostgreSQL (postgres.js)
  src/           Programm
  migrations/    SQL-Dateien, laufen beim Start automatisch
web/             Oberfläche (ohne Build-Schritt)
ops/             Sicherung und Update-Skript
docs/            Einrichtung Server und Microsoft
```

## Lokal entwickeln

```sh
cd server
npm install
export BASE_URL=http://localhost:3000 DATABASE_URL=postgres://nflow:nflow@localhost/nflow \
  SESSION_SECRET=$(openssl rand -hex 32) AUTH_DEV=1 ADMIN_EMAILS=du@example.de
npm run dev
```

Anmelden ohne Microsoft über <http://localhost:3000/auth/dev> (nur außerhalb von `NODE_ENV=production`).

## Betrieb

Siehe [docs/einrichtung-server.md](docs/einrichtung-server.md) und [docs/entra-app.md](docs/entra-app.md).
