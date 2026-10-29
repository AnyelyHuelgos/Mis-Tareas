-- ============================================================
-- PASO 2: PROGRAMAR LOS AVISOS (para notificaciones con la app cerrada)
--
-- La función "recordatorios" se ejecuta cada 5 minutos y decide qué mandar:
--   - 7:00 a. m.: el resumen del día (hoy, atrasadas, lo que se acerca, rutinas)
--   - a la hora exacta de cada rutina (ej. inglés a las 7:00 p. m. de lunes a sábado)
--   - a la hora de las tareas que vencen hoy y tienen hora
--   - las alarmas, X minutos antes
--
-- Antes de correr esto:
--   1. Database → Extensions: activa "pg_cron" y "pg_net".
--   2. Ya debes haber creado la función (ver LEEME.md, paso 6).
--   3. Reemplaza TU-PROYECTO y TU-CLAVE-SECRETA-CRON abajo.
-- ============================================================

-- Si ya habías programado una versión anterior, la quitamos
select cron.unschedule(jobname) from cron.job where jobname = 'recordatorio-diario-tareas';

select cron.schedule(
  'recordatorio-diario-tareas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://bcuxxjyrixxqubswivbx.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'TU-CLAVE-SECRETA-CRON'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver lo programado:          select * from cron.job;
-- Para ver si se está ejecutando:  select * from cron.job_run_details order by start_time desc limit 10;
-- Para borrarlo:                   select cron.unschedule('recordatorio-diario-tareas');


-- ============================================================
-- PROBAR LAS NOTIFICACIONES YA MISMO
-- Quítale los "--" a las 5 líneas de abajo, cambia TU-PROYECTO y
-- TU-CLAVE-SECRETA-CRON, selecciónalas solo a ellas y dale Run.
-- Te debe llegar "Notificación de prueba" al celular en unos segundos.
-- ============================================================
-- select net.http_post(
--   url     := 'https://bcuxxjyrixxqubswivbx.supabase.co/functions/v1/recordatorios',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'TU-CLAVE-SECRETA-CRON'),
--   body    := '{"prueba": true}'::jsonb
-- );
