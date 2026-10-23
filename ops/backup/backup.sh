#!/bin/sh
# N-Flow · Nächtliche Datenbanksicherung
# Läuft dauerhaft im Container "backup", sichert täglich zur SICHERUNG_UHRZEIT
# und hält 14 Tages-, 8 Wochen- und 12 Monatssicherungen vor.
# Sofort sichern:  docker compose exec backup sh /backup.sh jetzt
set -eu

ZIEL=/sicherungen
UHRZEIT="${SICHERUNG_UHRZEIT:-02:00}"
mkdir -p "$ZIEL/taeglich" "$ZIEL/woechentlich" "$ZIEL/monatlich" "$ZIEL/.anstoss"
# Die App (ohne Root-Rechte) darf hier „Jetzt sichern“ anstoßen
chmod 777 "$ZIEL/.anstoss"

sichern() {
  stempel=$(date +%Y-%m-%d_%H%M)
  datei="$ZIEL/taeglich/nflow_$stempel.dump"
  echo "$(date '+%F %T') Sicherung startet → $datei"
  pg_dump --format=custom --compress=9 --file="$datei.teil"
  mv "$datei.teil" "$datei"
  # Sonntag: Wochensicherung, am 1.: Monatssicherung
  [ "$(date +%u)" = "7" ] && cp "$datei" "$ZIEL/woechentlich/"
  [ "$(date +%d)" = "01" ] && cp "$datei" "$ZIEL/monatlich/"
  aufraeumen taeglich 14
  aufraeumen woechentlich 8
  aufraeumen monatlich 12
  echo "$(date '+%F %T') Sicherung fertig ($(du -h "$datei" | cut -f1))"
}

# Behält die neuesten N Dateien eines Ordners
aufraeumen() {
  ls -1t "$ZIEL/$1"/nflow_*.dump 2>/dev/null | tail -n +"$(($2 + 1))" | while read -r alt; do
    rm -f "$alt"
  done
}

if [ "${1:-}" = "jetzt" ]; then
  sichern
  exit 0
fi

echo "Sicherung eingeplant täglich um $UHRZEIT ($(date +%Z))"
while true; do
  # „Jetzt sichern“ aus der Administration legt diese Datei an
  if [ -f "$ZIEL/.anstoss/jetzt" ]; then
    rm -f "$ZIEL/.anstoss/jetzt"
    sichern || echo "$(date '+%F %T') FEHLER: Sicherung fehlgeschlagen"
  fi
  if [ "$(date +%H:%M)" = "$UHRZEIT" ]; then
    sichern || echo "$(date '+%F %T') FEHLER: Sicherung fehlgeschlagen"
    sleep 61
  fi
  sleep 30
done
