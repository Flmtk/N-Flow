-- N-Flow · Fahrzeuglager: welche Berichte schon vom Fahrzeugbestand abgebucht sind
create table lager_buchungen (
  bericht     text primary key,
  fahrzeug    text not null,
  positionen  jsonb not null,          -- {"Artikelnr": Menge}
  zeit        timestamptz not null default now()
);
