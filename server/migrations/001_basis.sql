-- N-Flow · Basis: Mitarbeiter, Sitzungen, Einstellungen, Protokoll

create extension if not exists pgcrypto;

create table mitarbeiter (
  id            uuid primary key default gen_random_uuid(),
  kuerzel       text not null,
  name          text not null,
  email         text not null,
  rolle         text not null check (rolle in ('Monteur', 'Innendienst', 'Geschäftsführung')),
  telefon       text not null default '',
  standort      text not null default 'Biebergemünd',
  einsatzgebiet text not null default '',
  wochenstunden numeric(4,1) not null default 40,
  selbstkosten  numeric(8,2),                      -- €/h aus der Stundensatz-Kalkulation
  qualifikationen text[] not null default '{}',
  farbe         smallint not null default 1,
  eintritt      date,
  aktiv         boolean not null default true,
  gesperrt      boolean not null default false,
  letzte_anmeldung timestamptz,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);
create unique index mitarbeiter_email_idx on mitarbeiter (lower(email));

create table sitzungen (
  token_hash    text primary key,                  -- SHA-256 des Cookie-Werts, der Klartext liegt nie in der DB
  mitarbeiter_id uuid not null references mitarbeiter(id) on delete cascade,
  erstellt_am   timestamptz not null default now(),
  laeuft_ab     timestamptz not null,
  geraet        text not null default ''
);
create index sitzungen_mitarbeiter_idx on sitzungen (mitarbeiter_id);

create table einstellungen (
  schluessel    text primary key,
  wert          jsonb not null,
  geaendert_am  timestamptz not null default now()
);

-- Protokoll: wird nur angehängt, nie geändert
create table protokoll (
  id            bigserial primary key,
  zeit          timestamptz not null default now(),
  wer           text not null,
  aktion        text not null,
  details       text not null default ''
);
create index protokoll_zeit_idx on protokoll (zeit desc);

create or replace function protokoll_unveraenderlich() returns trigger language plpgsql as $$
begin
  raise exception 'Das Protokoll kann nicht geändert oder gelöscht werden.';
end $$;
create trigger protokoll_schutz before update or delete on protokoll
  for each row execute function protokoll_unveraenderlich();

-- Rechte je Rolle (Reihenfolge wie in der Oberfläche)
insert into einstellungen (schluessel, wert) values ('rechte', '{
  "Monteur":          {"eigene": true, "planung": false, "berichte_pruefen": false, "rechnungen": false, "preise": false, "mitarbeiter": false, "admin": false},
  "Innendienst":      {"eigene": true, "planung": true,  "berichte_pruefen": true,  "rechnungen": false, "preise": false, "mitarbeiter": false, "admin": false},
  "Geschäftsführung": {"eigene": true, "planung": true,  "berichte_pruefen": true,  "rechnungen": true,  "preise": true,  "mitarbeiter": true,  "admin": true}
}');
