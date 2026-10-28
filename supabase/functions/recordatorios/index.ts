// ============================================================
// EDGE FUNCTION: recordatorios
// Corre en los servidores de Supabase (gratis). La llama pg_cron cada mañana.
// Revisa tus tareas pendientes y te manda una notificación push con:
//   - lo atrasado y lo de hoy
//   - lo que vence en X días (según "Avisarme" de cada tarea)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

// Estas variables las pones en Supabase → Edge Functions → Secrets
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen incluidas)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:tu-correo@ejemplo.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// Fecha de Colombia (UTC-5, sin horario de verano) en formato AAAA-MM-DD
function fechaColombia(sumarDias = 0): string {
  const ms = Date.now() - 5 * 3600 * 1000 + sumarDias * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
}

type Tarea = { id: string; user_id: string; titulo: string; fecha_limite: string; recordar_dias_antes: number };

function lista(tareas: Tarea[], max = 3): string {
  const nombres = tareas.slice(0, max).map((t) => t.titulo).join(", ");
  return tareas.length > max ? `${nombres} y ${tareas.length - max} más` : nombres;
}

Deno.serve(async (req) => {
  // Solo pg_cron (que conoce la clave secreta) puede ejecutar esto
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("No autorizado", { status: 401 });
  }

  const hoy = fechaColombia();
  const { data: tareas, error } = await supabase
    .from("tareas")
    .select("id, user_id, titulo, fecha_limite, recordar_dias_antes")
    .eq("hecha", false)
    .not("fecha_limite", "is", null)
    .lte("fecha_limite", fechaColombia(14));

  if (error) return new Response(error.message, { status: 500 });

  // Agrupar por usuario
  const porUsuario = new Map<string, { atrasadas: Tarea[]; hoy: Tarea[]; pronto: Tarea[] }>();
  for (const t of (tareas ?? []) as Tarea[]) {
    const g = porUsuario.get(t.user_id) ?? { atrasadas: [], hoy: [], pronto: [] };
    const faltan = diasEntre(hoy, t.fecha_limite);
    if (faltan < 0) g.atrasadas.push(t);
    else if (faltan === 0) g.hoy.push(t);
    else if (faltan === t.recordar_dias_antes) g.pronto.push(t);
    porUsuario.set(t.user_id, g);
  }

  let enviadas = 0;
  for (const [userId, g] of porUsuario) {
    if (!g.atrasadas.length && !g.hoy.length && !g.pronto.length) continue;

    const partes: string[] = [];
    if (g.hoy.length) partes.push(`Hoy: ${lista(g.hoy)}`);
    if (g.atrasadas.length) partes.push(`Atrasadas: ${lista(g.atrasadas)}`);
    if (g.pronto.length) {
      partes.push("Se acerca: " + g.pronto.map((t) => {
        const d = diasEntre(hoy, t.fecha_limite);
        return `${t.titulo} (en ${d} día${d === 1 ? "" : "s"})`;
      }).join(", "));
    }
    const pendientesHoy = g.hoy.length + g.atrasadas.length;
    const mensaje = JSON.stringify({
      titulo: pendientesHoy
        ? `Tienes ${pendientesHoy} pendiente${pendientesHoy === 1 ? "" : "s"} para hoy`
        : "Se acercan fechas límite",
      cuerpo: partes.join(". "),
      tag: `resumen-${hoy}`,
    });

    const { data: subs } = await supabase
      .from("push_suscripciones")
      .select("id, suscripcion")
      .eq("user_id", userId);

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.suscripcion, mensaje);
        enviadas++;
      } catch (e) {
        // 404/410 = ese celular ya no existe o quitó el permiso: lo borramos
        const codigo = (e as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) {
          await supabase.from("push_suscripciones").delete().eq("id", s.id);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, enviadas }), {
    headers: { "Content-Type": "application/json" },
  });
});
