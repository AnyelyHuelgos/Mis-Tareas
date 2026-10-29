-- ============================================================
-- PASO 6: MEJORAS (córrelo una sola vez en SQL Editor → Run)
-- 1. "Insistirme cada X horas" (ej. cada 2 horas hasta que la marque)
-- 2. Alarmas con varias horas y que se repiten
--    (ej. medicamentos 3 veces al día, todos los días)
-- ============================================================

-- 1. Cada cuántas horas insistir (0 = no)
alter table public.tareas
  add column if not exists recordar_cada_horas int not null default 0;

-- 2. Días en que se repite la alarma (0 = domingo … 6 = sábado; vacío = solo ese día)
alter table public.alarmas
  add column if not exists repetir_dias int[] not null default '{}';

-- 2. Horas adicionales de la misma alarma (la primera va en "hora")
alter table public.alarmas
  add column if not exists horas_extra time[] not null default '{}';
