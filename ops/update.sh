#!/bin/sh
# N-Flow · Update auf dem Server
# Aufruf im Ordner der Umgebung, z. B.:  cd /docker/n-flow-test && sh ops/update.sh
# Ablauf: Sicherung → neuen Stand holen → neu bauen → starten (Migrationen laufen automatisch) → Prüfung.
# Zurück auf den vorherigen Stand:  sh ops/update.sh zurueck
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" = "zurueck" ]; then
  vorher=$(cat .letzter-stand 2>/dev/null || true)
  [ -n "$vorher" ] || { echo "Kein vorheriger Stand gespeichert."; exit 1; }
  echo "Zurück auf $vorher …"
  git checkout -q "$vorher"
  echo "Hinweis: Die Datenbank bleibt auf dem neuen Stand. Falls nötig, Sicherung einspielen (siehe README)."
else
  echo "1/4 Sicherung vor dem Update"
  docker compose exec -T backup sh /backup.sh jetzt
  git rev-parse HEAD > .letzter-stand
  echo "2/4 Neuen Stand holen"
  git pull --ff-only
fi

echo "3/4 Bauen und starten"
APP_VERSION="$(git describe --tags --always)" docker compose up -d --build

echo "4/4 Prüfen"
for i in $(seq 1 30); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "N-Flow läuft: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 2
done
echo "N-Flow antwortet nicht. Protokoll ansehen mit:  docker compose logs --tail 80 app"
exit 1
