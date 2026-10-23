# N-Flow

Service-Software der NOVIS Anlagentechnik GmbH: Monteur-App (PWA), Planung im Büro und Administration. Läuft auf dem eigenen Server, Anmeldung über Microsoft 365, Ablage der Berichte und Rechnungen in SharePoint.

## Stand

| Bereich | Inhalt | Status |
|---|---|---|
| Grundlage | Server, Datenbank, Microsoft-Anmeldung, Rechte, Protokoll, Sicherung | läuft |
| Büro (`/buero/`) | Übersicht, Plantafel mit Empfehlung, Wartungsplanung, Kunden und Anlagen, Berichte (A4), Rechnungen, Team, Einstellungen, Administration | läuft |
| Monteur-App (`/app/`) | Tour, QR-Scan, Anlagenakte, Einsatz mit Messblatt, Inbetriebnahme, Folgeauftrag, Fehlanfahrt, Wartungspool, Zeit, Belege, Urlaub/Block, Kalenderabo, offline-fähig | läuft |
| QR-Aufkleber (`/a/<Kennung>`) | öffentlich: Störung melden; Kunde mit PIN: Historie; Mitarbeiter: Anlagenakte | läuft |
| Microsoft 365 | Mail (Terminbestätigung, Rechnung mit PDF), Push | läuft |
| SharePoint | automatische Ablage nach Kunde: Kundenstammblatt, Berichte, Fotos, Rechnungen, Belege (`docs/sharepoint.md`) | läuft |

## Datenmodell

Büro und App teilen einen Speicher je Sammlung (`daten`: kunden, anlagen, auftraege, berichte, rechnungen, abwesenheiten, belege, zeiten, artikel, arbeitsmittel, kontakte, bestaetigungen, einstellungen). Rechte je Sammlung in `server/src/routes/daten.ts`. Die Oberflächen arbeiten über `web/js/nf.js`: sofort lokal speichern, Postausgang, Abgleich alle 20 s. Fotos und Unterschriften liegen in `dateien`. Rechnungsnummern vergibt nur der Server (lückenlos).

## Aufbau

```
server/          Fastify + TypeScript, PostgreSQL (postgres.js)
  src/           Programm
  migrations/    SQL-Dateien, laufen beim Start automatisch
web/             Oberflächen ohne Build-Schritt: buero/, app/ (PWA), js/nf.js
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
