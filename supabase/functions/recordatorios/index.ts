// ============================================================
// EDGE FUNCTION: recordatorios
// Corre en los servidores de Supabase (gratis). La llama pg_cron cada mañana.
// Revisa tus tareas pendientes y te manda una notificación push con:
//   - lo atrasado y lo de hoy
//   - lo que vence en X días (según "Avisarme" de cada tarea)
//   - lo que debes recordar cada X días hasta marcarlo como hecho
// Prueba: si la llamas con {"prueba": true} te manda un aviso de prueba ya mismo.
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

type Tarea = {
  id: string; user_id: string; titulo: string; fecha_limite: string | null;
  recordar_dias_antes: number; recordar_cada: number; creado_en: string;
};

// Día (en Colombia) en que se creó la tarea
function diaColombia(timestamp: string): string {
  return new Date(Date.parse(timestamp) - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function tocaInsistir(t: Tarea, hoy: string): boolean {
  if (!t.recordar_cada) return false;
  const dias = diasEntre(diaColombia(t.creado_en), hoy);
  return dias > 0 && dias % t.recordar_cada === 0;
}

function cuentaRegresiva(fecha: string, hoy: string): string {
  const d = diasEntre(hoy, fecha);
  if (d === 0) return "vence hoy";
  if (d === 1) return "vence mañana";
  if (d > 1) return `faltan ${d} días`;
  return `atrasada ${-d} día${d === -1 ? "" : "s"}`;
}

async function enviar(userId: string, mensaje: string): Promise<number> {
  const { data: subs } = await supabase
    .from("push_suscripciones")
    .select("id, suscripcion")
    .eq("user_id", userId);
  let enviadas = 0;
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
  return enviadas;
}

function lista(tareas: Tarea[], max = 3): string {
  const nombres = tareas.slice(0, max).map((t) => t.titulo).join(", ");
  return tareas.length > max ? `${nombres} y ${tareas.length - max} más` : nombres;
}

Deno.serve(async (req) => {
  // Solo pg_cron (que conoce la clave secreta) puede ejecutar esto
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("No autorizado", { status: 401 });
  }

  const cuerpo = await req.json().catch(() => ({}));

  // ---------- Modo prueba ----------
  if (cuerpo.prueba) {
    const { data: subs } = await supabase.from("push_suscripciones").select("user_id");
    const usuarios = [...new Set((subs ?? []).map((s) => s.user_id))];
    let enviadas = 0;
    for (const u of usuarios) {
      enviadas += await enviar(u, JSON.stringify({
        titulo: "Notificación de prueba",
        cuerpo: "¡Funciona! Así te llegarán tus recordatorios cada mañana.",
        tag: "prueba",
      }));
    }
    return new Response(JSON.stringify({ ok: true, prueba: true, enviadas }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const hoy = fechaColombia();
  const { data: tareas, error } = await supabase
    .from("tareas")
    .select("id, user_id, titulo, fecha_limite, recordar_dias_antes, recordar_cada, creado_en")
    .eq("hecha", false)
    .or(`fecha_limite.lte.${fechaColombia(14)},recordar_cada.gt.0`);

  if (error) return new Response(error.message, { status: 500 });

  // Agrupar por usuario
  const porUsuario = new Map<string, { atrasadas: Tarea[]; hoy: Tarea[]; pronto: Tarea[]; insistir: Tarea[] }>();
  for (const t of (tareas ?? []) as Tarea[]) {
    const g = porUsuario.get(t.user_id) ?? { atrasadas: [], hoy: [], pronto: [], insistir: [] };
    const faltan = t.fecha_limite ? diasEntre(hoy, t.fecha_limite) : null;
    if (faltan !== null && faltan < 0) g.atrasadas.push(t);
    else if (faltan === 0) g.hoy.push(t);
    else if (faltan !== null && faltan === t.recordar_dias_antes) g.pronto.push(t);
    else if (tocaInsistir(t, hoy)) g.insistir.push(t);
    porUsuario.set(t.user_id, g);
  }

  let enviadas = 0;
  for (const [userId, g] of porUsuario) {
    if (!g.atrasadas.length && !g.hoy.length && !g.pronto.length && !g.insistir.length) continue;

    const partes: string[] = [];
    if (g.hoy.length) partes.push(`Hoy: ${lista(g.hoy)}`);
    if (g.atrasadas.length) partes.push(`Atrasadas: ${lista(g.atrasadas)}`);
    if (g.pronto.length) {
      partes.push("Se acerca: " + g.pronto.map((t) => `${t.titulo} (${cuentaRegresiva(t.fecha_limite!, hoy)})`).join(", "));
    }
    if (g.insistir.length) {
      partes.push("No te olvides: " + g.insistir.map((t) =>
        t.fecha_limite ? `${t.titulo} (${cuentaRegresiva(t.fecha_limite, hoy)})` : t.titulo).join(", "));
    }
    const pendientesHoy = g.hoy.length + g.atrasadas.length;
    const mensaje = JSON.stringify({
      titulo: pendientesHoy
        ? `Tienes ${pendientesHoy} pendiente${pendientesHoy === 1 ? "" : "s"} para hoy`
        : "Recordatorio de tus tareas",
      cuerpo: partes.join(". "),
      tag: `resumen-${hoy}`,
    });
    enviadas += await enviar(userId, mensaje);
  }

  return new Response(JSON.stringify({ ok: true, enviadas }), {
    headers: { "Content-Type": "application/json" },
  });
});
