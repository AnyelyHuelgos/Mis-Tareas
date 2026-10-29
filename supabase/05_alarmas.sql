-- ============================================================
-- PASO 5: ALARMAS (córrelo una sola vez en SQL Editor → Run)
-- Eventos con hora exacta, separados de las tareas:
-- "Reunión con mi jefe a las 2 p. m., avísame 10 minutos antes"
-- ============================================================
create table if not exists public.alarmas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria_id      uuid not null references public.categorias(id) on delete cascade,
  titulo            text not null,
  fecha             date not null,
  hora              time not null,
  avisar_min_antes  int  not null default 10,
  avisada           boolean not null default false,   -- true cuando ya se envió el aviso
  creado_en         timestamptz not null default now()
);

create index if not exists idx_alarmas_fecha on public.alarmas (user_id, fecha);

alter table public.alarmas enable row level security;

create policy "solo mis alarmas" on public.alarmas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
