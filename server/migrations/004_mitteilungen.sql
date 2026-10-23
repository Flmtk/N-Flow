-- N-Flow · Push-Mitteilungen aufs Handy

-- Ein Eintrag je Gerät, auf dem jemand Mitteilungen erlaubt hat
create table push_abos (
  endpoint       text primary key,
  mitarbeiter_id uuid not null references mitarbeiter(id) on delete cascade,
  schluessel     jsonb not null,
  geraet         text not null default '',
  erstellt_am    timestamptz not null default now()
);
create index push_abos_mitarbeiter_idx on push_abos (mitarbeiter_id);

-- Welche Mitteilungen jemand bekommen möchte, z. B. {"vorschau": false}. Fehlt ein Eintrag, ist er an.
alter table mitarbeiter add column mitteilungen jsonb not null default '{}';
