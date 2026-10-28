-- ============================================================
-- PASO 2 (opcional, para notificaciones con la app cerrada)
-- Programa la Edge Function "recordatorios" todos los días a las 7:00 a. m. (hora de Colombia).
--
-- Antes de correr esto:
--   1. Database → Extensions: activa "pg_cron" y "pg_net".
--   2. Ya debes haber desplegado la función (ver LEEME.md, paso 6).
--   3. Reemplaza TU-PROYECTO y TU-CLAVE-SECRETA-CRON abajo.
--
-- Colombia es UTC-5, así que 7:00 a. m. = 12:00 UTC → '0 12 * * *'
-- ============================================================
select cron.schedule(
  'recordatorio-diario-tareas',
  '0 12 * * *',
  $$
  select net.http_post(
    url     := 'https://TU-PROYECTO.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'TU-CLAVE-SECRETA-CRON'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver los trabajos programados:
--   select * from cron.job;
-- Para borrarlo si te equivocaste:
--   select cron.unschedule('recordatorio-diario-tareas');
