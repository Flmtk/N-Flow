-- N-Flow · Ablage in SharePoint

-- Warteschlange: ein Eintrag je Dokument (Bericht, Rechnung, Beleg, Kundenstammblatt).
-- Ändert sich etwas, wird der Eintrag wieder auf „offen“ gesetzt und die Datei ersetzt.
create table ablage (
  id           bigserial primary key,
  art          text not null,
  ref          text not null,
  status       text not null default 'offen',   -- offen, erledigt, fehler
  versuche     integer not null default 0,
  naechster    timestamptz not null default now(),
  fehler       text,
  url          text,
  erstellt_am  timestamptz not null default now(),
  erledigt_am  timestamptz,
  unique (art, ref)
);
create index ablage_offen_idx on ablage (naechster) where status = 'offen';

-- Ordner in SharePoint mit festem Schlüssel (z. B. „kunde:K-10001“), damit Umbenennen möglich ist
create table ablage_ordner (
  schluessel  text primary key,
  element_id  text not null,
  name        text not null
);
