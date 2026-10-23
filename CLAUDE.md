# Hinweise für die Arbeit an N-Flow

- Sprache: Oberfläche, Bezeichner, Kommentare und Commit-Texte auf Deutsch (ohne Umlaute in Bezeichnern).
- Server: Node 22, TypeScript strict, Fastify 5, postgres.js. Prüfen mit `cd server && npm run check`.
- Datenbank nur über neue Dateien in `server/migrations/` ändern (fortlaufend nummeriert, nie bestehende ändern). Sie laufen beim Start automatisch.
- Jede Route mit Daten braucht `preHandler: brauche("<recht>")`. Rechte stehen in `server/src/rechte.ts`.
- Änderungen an Mitarbeitern, Rechten, Preisen und Rechnungen immer mit `protokolliere(...)` festhalten.
- Oberfläche in `web/` ohne Build-Schritt. Farben und Stil wie in den Prototypen „N-Flow Monteur“ und „N-Flow Büro“ (Figtree, Akzent #e9660f). Benutzertexte immer mit `esc()` ausgeben.
- Keine Geheimnisse ins Repository. `.env` liegt nur auf dem Server.
- Fachliches: qA nach 1. BImSchV, Messblatt wie Servicebericht NOVIS v11 (Heizgerät Q min/Q max, Brenner P0–P9, Bu, Bo), Wartungspauschale nach Formular K-01.
- Daten von Büro und App laufen über `/api/daten` und `web/js/nf.js`. Neue Sammlungen in `SAMMLUNGEN` (daten.ts) mit Rechten eintragen.
- `web/buero/index.html` und `web/app/index.html` sind aus den Prototypen entstanden. Die Prototyp-Strukturen (z. B. `S.anl`, `ANLAGEN`) werden in `aufbauen()` aus dem Speicher gebildet, Änderungen gehen über `NF.setze` bzw. `NF.abgleich` zurück.
- PDFs erzeugt der Server mit Chromium aus `/buero/?druck=bericht|rechnung|kunde&id=…` (druck.ts, `drucken()` im Büro). Ablage in SharePoint über die Warteschlange in `ablage.ts`; neue Dokumentarten dort in `nachSpeichernAblage` und `verarbeiten` ergänzen.
