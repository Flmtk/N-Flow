-- N-Flow · Mitteilungen auch für „Arbeiten für“
-- Wer in der App für einen Monteur arbeitet, bekommt auf diesem Gerät auch dessen Mitteilungen.
alter table push_abos add column fuer uuid references mitarbeiter(id) on delete set null;
create index push_abos_fuer_idx on push_abos (fuer);
