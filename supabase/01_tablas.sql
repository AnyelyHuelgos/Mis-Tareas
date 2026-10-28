-- ============================================================
-- PASO 1: TABLAS + SEGURIDAD (RLS)
-- Copia todo esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- Categorías (Universidad, Trabajo, Planecitos…)
create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  color      text not null default '#4A6FA5',
  creado_en  timestamptz not null default now()
);

-- Tareas
create table if not exists public.tareas (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria_id         uuid not null references public.categorias(id) on delete cascade,
  titulo               text not null,
  notas                text,
  fecha_limite         date,
  hora                 time,
  prioridad            text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  recordar_dias_antes  int  not null default 2,
  hecha                boolean not null default false,
  creado_en            timestamptz not null default now()
);

-- Subtareas (cada una pertenece a una tarea)
create table if not exists public.subtareas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tarea_id   uuid not null references public.tareas(id) on delete cascade,
  titulo     text not null,
  hecha      boolean not null default false,
  orden      int not null default 0,
  creado_en  timestamptz not null default now()
);

-- Suscripciones de notificaciones (una por celular/navegador)
create table if not exists public.push_suscripciones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  suscripcion  jsonb not null,
  creado_en    timestamptz not null default now()
);

-- Índices para que las consultas sean rápidas
create index if not exists idx_tareas_usuario_fecha on public.tareas (user_id, fecha_limite);
create index if not exists idx_subtareas_tarea on public.subtareas (tarea_id);

-- ---------- SEGURIDAD: cada usuario solo ve y toca lo suyo ----------
alter table public.categorias         enable row level security;
alter table public.tareas             enable row level security;
alter table public.subtareas          enable row level security;
alter table public.push_suscripciones enable row level security;

create policy "solo mis categorias" on public.categorias
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "solo mis tareas" on public.tareas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "solo mis subtareas" on public.subtareas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "solo mis suscripciones" on public.push_suscripciones
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
