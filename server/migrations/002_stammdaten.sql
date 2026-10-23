-- N-Flow · Stammdaten und Vorgänge (Gerüst für Etappe 2 und 3)
-- Die Tabellen entsprechen den Prototypen „N-Flow Monteur“ und „N-Flow Büro“.

create table kunden (
  id          uuid primary key default gen_random_uuid(),
  nummer      text not null unique,                -- K-10023
  name1       text not null,
  name2       text not null default '',
  strasse     text not null default '',
  plz         text not null default '',
  ort         text not null default '',
  telefon     text not null default '',
  email       text not null default '',
  erstellt_am timestamptz not null default now()
);

create table anlagen (
  id          uuid primary key default gen_random_uuid(),
  nummer      text not null unique,                -- NV-00042
  qr_kennung  text unique,                         -- zufällig, steht im QR-Aufkleber
  kunde_id    uuid not null references kunden(id),
  standort    jsonb not null default '{}',         -- abweichender Anlagenstandort
  ansprechpartner text not null default '',
  zugang      text not null default '',
  hersteller  text not null default '',
  typ         text not null default '',
  seriennummer text not null default '',
  baujahr     smallint,
  leistung_kw numeric(7,1),
  energie     text not null default 'Gas' check (energie in ('Gas', 'Öl', 'Wärmepumpe', 'Sonstige')),
  details     jsonb not null default '{}',         -- Brenner, Regelung, Hydraulik, Warmwasser …
  erstellt_am timestamptz not null default now()
);
create index anlagen_kunde_idx on anlagen (kunde_id);

create table vertraege (
  id            uuid primary key default gen_random_uuid(),
  nummer        text not null unique,              -- W-2027-007
  anlage_id     uuid not null references anlagen(id),
  intervall_monate smallint not null default 12,
  pauschale     numeric(10,2),                     -- leer = nach Formular K-01
  betreuer_id   uuid references mitarbeiter(id),   -- Wartungspool
  beginn        date not null default current_date,
  ende          date
);

create table auftraege (
  id          uuid primary key default gen_random_uuid(),
  nummer      text not null unique,                -- A-2027-0311
  anlage_id   uuid references anlagen(id),         -- leer bei internen Tätigkeiten
  art         text not null,                       -- Wartung, Störung, Reparatur, Umbau, Sonstiges, Intern, Inbetriebnahme, Folgeauftrag
  leistung    text not null default '',
  quelle      text not null default 'Büro',
  prioritaet  text not null default 'normal',
  dauer_h     numeric(5,2) not null default 1,
  abrechnung  text not null default 'Aufwand',
  pauschale   numeric(10,2),
  monteur_id  uuid references mitarbeiter(id),
  termin      timestamptz,
  status      text not null default 'offen' check (status in ('offen', 'geplant', 'erledigt', 'storniert')),
  folge_von   uuid references auftraege(id),
  erstellt_am timestamptz not null default now()
);
create index auftraege_termin_idx on auftraege (monteur_id, termin);

create table berichte (
  id          uuid primary key default gen_random_uuid(),
  nummer      text not null unique,                -- SB-2026-0042
  auftrag_id  uuid references auftraege(id),
  monteur_id  uuid references mitarbeiter(id),
  daten       jsonb not null,                      -- Befund, Zeiten, Material, Messblatt, Unterschriften
  status      text not null default 'neu' check (status in ('neu', 'geprüft', 'abgerechnet')),
  pdf_pfad    text,                                -- Ablage in SharePoint
  eingegangen_am timestamptz not null default now()
);

create table rechnungen (
  id          uuid primary key default gen_random_uuid(),
  nummer      text not null unique,                -- RE-2026-0009
  bericht_id  uuid references berichte(id),
  kunde_id    uuid references kunden(id),
  datum       date not null default current_date,
  positionen  jsonb not null,
  netto       numeric(12,2) not null,
  ust         numeric(12,2) not null,
  status      text not null default 'offen' check (status in ('offen', 'bezahlt', 'storniert')),
  bezahlt_am  date
);

create table artikel (
  nummer      text primary key,
  bezeichnung text not null,
  hersteller  text not null default '',
  ek_netto    numeric(10,2) not null default 0
);

create table arbeitsmittel (
  id          uuid primary key default gen_random_uuid(),
  bezeichnung text not null,
  art         text not null default 'Messgerät',
  seriennummer text not null default '',
  mitarbeiter_id uuid references mitarbeiter(id),
  pruefung    text not null default 'Kalibrierung',
  intervall_monate smallint not null default 12,
  letzte_pruefung date
);

create table abwesenheiten (
  id          uuid primary key default gen_random_uuid(),
  mitarbeiter_id uuid not null references mitarbeiter(id),
  art         text not null check (art in ('Urlaub', 'Block')),
  von         timestamptz not null,
  bis         timestamptz not null,
  begruendung text not null default '',
  status      text not null default 'offen' check (status in ('offen', 'genehmigt', 'abgelehnt'))
);

-- Fortlaufende Nummernkreise je Jahr: SB, RE, A, FA
create table nummernkreise (
  kreis       text not null,
  jahr        smallint not null,
  letzte      integer not null default 0,
  primary key (kreis, jahr)
);
