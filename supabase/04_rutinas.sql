-- ============================================================
-- PASO 4: RUTINAS (córrelo una sola vez en SQL Editor → Run)
-- Tareas que se repiten ciertos días, como "Practicar inglés 30 minutos"
-- de lunes a sábado, con aviso a una hora fija.
-- ============================================================

-- Días en que se repite: 0 = domingo, 1 = lunes … 6 = sábado. Vacío = no se repite.
alter table public.tareas
  add column if not exists repetir_dias int[] not null default '{}';

-- Último día en que marcaste la rutina como hecha
alter table public.tareas
  add column if not exists ultima_completada date;
