-- Wöchentliche Neuanmeldung: bestehende Anmeldungen enden spätestens am nächsten Montag 0:00 Uhr (deutsche Zeit)
update sitzungen
set laeuft_ab = least(laeuft_ab, (date_trunc('week', now() at time zone 'Europe/Berlin') + interval '7 days') at time zone 'Europe/Berlin');
