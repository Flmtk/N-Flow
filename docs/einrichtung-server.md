# N-Flow auf dem Server einrichten

Server: Hostinger-VPS `srv1794208.hstgr.cloud` (152.239.118.237), Ubuntu 24.04, Docker und Traefik sind vorhanden.
Alle Befehle im Hostinger-Browser-Terminal als `root`.

## 1. Zugriff auf das Repository (Deploy Key, nur lesen)

```sh
ssh-keygen -t ed25519 -N "" -C "n-flow-server" -f /root/.ssh/nflow_deploy
cat /root/.ssh/nflow_deploy.pub
```

Die ausgegebene Zeile (beginnt mit `ssh-ed25519`) in GitHub eintragen:
**Flmtk/N-Flow → Settings → Deploy keys → Add deploy key**, Titel `Hostinger`, *Allow write access* **nicht** anhaken.

```sh
cat >> /root/.ssh/config <<'EOF'
Host github-nflow
  HostName github.com
  User git
  IdentityFile /root/.ssh/nflow_deploy
  IdentitiesOnly yes
EOF
ssh -o StrictHostKeyChecking=accept-new -T github-nflow   # meldet "successfully authenticated"
```

## 2. Testumgebung holen

```sh
git clone github-nflow:Flmtk/N-Flow.git /docker/n-flow-test
cd /docker/n-flow-test
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
chmod 600 .env
nano .env     # MS_… (siehe docs/entra-app.md) und ADMIN_EMAILS eintragen
```

## 3. Platzhalter abschalten

Der Platzhalter in `/docker/nflow` beansprucht noch `test.novis-anlagentechnik.de`. Er hat seinen Zweck erfüllt und wird abgeschaltet (`app.` zeigt bis zum Start der Live-Umgebung eine leere Seite):

```sh
cd /docker/nflow && docker compose down
```

## 4. Starten

```sh
cd /docker/n-flow-test
docker compose up -d --build
docker compose ps
docker compose logs --tail 40 app
```

Danach <https://test.novis-anlagentechnik.de> öffnen und mit Microsoft anmelden.

## Alltag

| Was | Befehl (im Ordner `/docker/n-flow-test`) |
|---|---|
| Update einspielen | `sh ops/update.sh` |
| Zurück auf vorherigen Stand | `sh ops/update.sh zurueck` |
| Sofort sichern | `docker compose exec backup sh /backup.sh jetzt` |
| Sicherungen ansehen | `ls -lh sicherungen/*` |
| Protokoll der App | `docker compose logs --tail 80 app` |

### Sicherung zurückspielen

```sh
docker compose stop app
docker compose exec -T db dropdb -U nflow nflow
docker compose exec -T db createdb -U nflow nflow
docker compose exec -T db pg_restore -U nflow -d nflow < sicherungen/taeglich/nflow_DATUM.dump
docker compose start app
```

### Sicherungen außer Haus

Die Sicherungen liegen bisher nur auf dem Server. Vor dem Echtbetrieb (März 2027) kommt eine zweite Kopie außerhalb dazu (Hostinger-Snapshots plus Kopie nach SharePoint oder in einen Speicher-Bucket).

## Vor echten Kundendaten erledigen

- SSH-Schlüssel einrichten und die Passwort-Anmeldung abschalten.
- Live-Umgebung `/docker/n-flow` mit `INSTANZ=live` und `DOMAIN=app.novis-anlagentechnik.de` anlegen, Platzhalter entfernen.
- Sicherung außer Haus einrichten und das Zurückspielen einmal ausprobieren.
