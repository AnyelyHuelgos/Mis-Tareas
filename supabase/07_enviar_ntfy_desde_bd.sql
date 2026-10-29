-- ============================================================
-- PASO 7: ENVIAR LOS AVISOS A NTFY DESDE LA BASE DE DATOS
-- (córrelo una sola vez en SQL Editor → Run)
--
-- Por qué: ntfy.sh limita los mensajes gratis por dirección de internet,
-- y las Edge Functions comparten su dirección con muchísimos usuarios,
-- así que el cupo se agota. La base de datos sale por otra dirección.
-- La función "recordatorios" llama a esta y esta le envía a ntfy.
-- ============================================================
create or replace function public.enviar_ntfy(
  p_topic     text,
  p_token     text,
  p_titulo    text,
  p_mensaje   text,
  p_prioridad int    default 3,
  p_etiquetas text[] default '{}',
  p_click     text   default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
begin
  if p_token is not null and p_token <> '' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || p_token);
  end if;

  select net.http_post(
    url     := 'https://ntfy.sh',
    headers := v_headers,
    body    := jsonb_build_object(
      'topic', p_topic,
      'title', p_titulo,
      'message', p_mensaje,
      'priority', p_prioridad,
      'tags', to_jsonb(p_etiquetas),
      'click', p_click
    ),
    timeout_milliseconds := 15000
  ) into v_id;

  return v_id;
end;
$$;

-- Seguridad: solo la función del servidor (service_role) puede usarla,
-- nadie desde la app ni desde internet.
revoke all on function public.enviar_ntfy(text, text, text, text, int, text[], text) from public, anon, authenticated;
grant execute on function public.enviar_ntfy(text, text, text, text, int, text[], text) to service_role;
