# Hinweise für die Arbeit an N-Flow

- Sprache: Oberfläche, Bezeichner, Kommentare und Commit-Texte auf Deutsch (ohne Umlaute in Bezeichnern).
- Server: Node 22, TypeScript strict, Fastify 5, postgres.js. Prüfen mit `cd server && npm run check`.
- Datenbank nur über neue Dateien in `server/migrations/` ändern (fortlaufend nummeriert, nie bestehende ändern). Sie laufen beim Start automatisch.
- Jede Route mit Daten braucht `preHandler: brauche("<recht>")`. Rechte stehen in `server/src/rechte.ts`.
- Änderungen an Mitarbeitern, Rechten, Preisen und Rechnungen immer mit `protokolliere(...)` festhalten.
- Oberfläche in `web/` ohne Build-Schritt. Farben und Stil wie in den Prototypen „N-Flow Monteur“ und „N-Flow Büro“ (Figtree, Akzent #e9660f). Benutzertexte immer mit `esc()` ausgeben.
- Keine Geheimnisse ins Repository. `.env` liegt nur auf dem Server.
- Fachliches: qA nach 1. BImSchV, Messblatt wie Servicebericht NOVIS v11 (Heizgerät Q min/Q max, Brenner P0–P9, Bu, Bo), Wartungspauschale nach Formular K-01.
