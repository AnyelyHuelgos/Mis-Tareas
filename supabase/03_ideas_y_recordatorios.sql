-- ============================================================
-- PASO 3: MEJORAS (córrelo una sola vez en SQL Editor → Run)
-- 1. Recordatorio repetido: "recuérdame cada X días hasta que la marque como hecha"
-- 2. Lluvia de ideas por categoría
-- ============================================================

-- 1. Cada cuántos días insistir (0 = no insistir)
alter table public.tareas
  add column if not exists recordar_cada int not null default 0;

-- 2. Ideas sueltas de cada categoría
create table if not exists public.ideas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria_id  uuid not null references public.categorias(id) on delete cascade,
  texto         text not null,
  convertida    boolean not null default false,   -- true cuando ya la pasaste a tarea
  creado_en     timestamptz not null default now()
);

create index if not exists idx_ideas_categoria on public.ideas (categoria_id);

alter table public.ideas enable row level security;

create policy "solo mis ideas" on public.ideas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
