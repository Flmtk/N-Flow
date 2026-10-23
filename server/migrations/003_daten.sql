-- N-Flow · Gemeinsamer Datenspeicher für Büro und Monteur-App
-- Die Tabellen aus 002 waren nur ein Gerüst und sind leer. Sie werden ersetzt durch
-- einen Speicher je Sammlung (Kunden, Anlagen, Aufträge, Berichte …) mit Versionsstand,
-- damit Büro und App Änderungen abgleichen können, auch nach Offline-Zeiten.

drop table if exists rechnungen, berichte, auftraege, vertraege, anlagen, kunden,
  artikel, arbeitsmittel, abwesenheiten cascade;

create table daten (
  sammlung      text not null,
  id            text not null,
  daten         jsonb not null,
  version       integer not null default 1,
  geloescht     boolean not null default false,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default clock_timestamp(),
  geaendert_von text not null default '',
  primary key (sammlung, id)
);
create index daten_geaendert_idx on daten (geaendert_am);
create index daten_tech_idx on daten (sammlung, (daten->>'tech'));
create unique index daten_qr_idx on daten ((daten->>'qr'))
  where sammlung = 'anlagen' and not geloescht and coalesce(daten->>'qr', '') <> '';

-- Fotos, Unterschriften, Anlagenschemata, Belege. Liegen in der Datenbank,
-- damit die nächtliche Sicherung sie mit erfasst.
create table dateien (
  id            uuid primary key,
  name          text not null default '',
  typ           text not null,
  groesse       integer not null,
  inhalt        bytea not null,
  erstellt_von  uuid references mitarbeiter(id),
  erstellt_am   timestamptz not null default now()
);

-- Persönliche Kalenderadresse (webcal) je Mitarbeiter
alter table mitarbeiter add column kalender_token text unique;
