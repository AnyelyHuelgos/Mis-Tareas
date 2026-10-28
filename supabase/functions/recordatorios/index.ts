// ============================================================
// EDGE FUNCTION: recordatorios
// Corre en los servidores de Supabase (gratis). pg_cron la llama cada 15 minutos.
//
// Qué manda:
//   1. A las 7:00 a. m. (hora Colombia): resumen del día
//      - lo de hoy y lo atrasado
//      - lo que vence en X días (campo "Avisarme")
//      - lo que toca insistir (campo "Insistirme cada X días")
//      - las rutinas de hoy
//   2. A la hora de cada rutina, si hoy le toca y no la has marcado
//   3. A la hora de cada tarea que vence hoy, si no la has marcado
//
// Prueba: llamarla con {"prueba": true} manda un aviso de prueba ya mismo.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:tu-correo@ejemplo.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const HORA_RESUMEN = Deno.env.get("HORA_RESUMEN") ?? "07:00"; // puedes cambiarla en Secrets
const MINUTOS_VENTANA = 15; // cada cuánto corre pg_cron

type Tarea = {
  id: string; user_id: string; titulo: string;
  fecha_limite: string | null; hora: string | null;
  recordar_dias_antes: number; recordar_cada: number;
  repetir_dias: number[]; ultima_completada: string | null; creado_en: string;
};

// ---------- Ayudantes de fecha (Colombia = UTC-5, sin horario de verano) ----------
function ahoraColombia(): Date { return new Date(Date.now() - 5 * 3600 * 1000); }
function fechaColombia(sumarDias = 0): string {
  return new Date(ahoraColombia().getTime() + sumarDias * 86400000).toISOString().slice(0, 10);
}
function diaColombia(timestamp: string): string {
  return new Date(Date.parse(timestamp) - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000);
}
function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
function horaBonita(hhmm: string): string {
  let [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const suf = h >= 12 ? "p. m." : "a. m.";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${suf}`;
}

// ¿La hora cae en esta vuelta de 15 minutos?
function enEstaVentana(hhmm: string, minutoActual: number): boolean {
  const inicio = Math.floor(minutoActual / MINUTOS_VENTANA) * MINUTOS_VENTANA;
  const m = aMinutos(hhmm);
  return m >= inicio && m < inicio + MINUTOS_VENTANA;
}

function esRutina(t: Tarea) { return Array.isArray(t.repetir_dias) && t.repetir_dias.length > 0; }

function tocaInsistir(t: Tarea, hoy: string): boolean {
  if (!t.recordar_cada || esRutina(t)) return false;
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

function lista(tareas: Tarea[], max = 3): string {
  const nombres = tareas.slice(0, max).map((t) => t.titulo).join(", ");
  return tareas.length > max ? `${nombres} y ${tareas.length - max} más` : nombres;
}

// ---------- Enviar a todos los celulares del usuario ----------
async function enviar(userId: string, titulo: string, cuerpo: string, tag: string): Promise<number> {
  const { data: subs } = await supabase
    .from("push_suscripciones").select("id, suscripcion").eq("user_id", userId);
  let enviadas = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.suscripcion, JSON.stringify({ titulo, cuerpo, tag }), { TTL: 86400, urgency: "high" });
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
      enviadas += await enviar(u, "Notificación de prueba",
        "¡Funciona! Así te llegarán tus recordatorios.", "prueba-" + Date.now());
    }
    return Response.json({ ok: true, prueba: true, enviadas });
  }

  const ahora = ahoraColombia();
  const hoy = fechaColombia();
  const diaSemana = ahora.getUTCDay(); // 0 = domingo
  const minutoActual = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const tocaResumen = enEstaVentana(HORA_RESUMEN, minutoActual);

  const { data, error } = await supabase
    .from("tareas")
    .select("id, user_id, titulo, fecha_limite, hora, recordar_dias_antes, recordar_cada, repetir_dias, ultima_completada, creado_en")
    .eq("hecha", false);
  if (error) return new Response(error.message, { status: 500 });

  // Agrupar por usuario
  const porUsuario = new Map<string, Tarea[]>();
  for (const t of (data ?? []) as Tarea[]) {
    porUsuario.set(t.user_id, [...(porUsuario.get(t.user_id) ?? []), t]);
  }

  let enviadas = 0;
  for (const [userId, tareas] of porUsuario) {
    const rutinasHoy = tareas.filter((t) => esRutina(t) && t.repetir_dias.includes(diaSemana) && t.ultima_completada !== hoy);
    const normales = tareas.filter((t) => !esRutina(t));

    // 1) Resumen de la mañana
    if (tocaResumen) {
      const deHoy = normales.filter((t) => t.fecha_limite === hoy);
      const atrasadas = normales.filter((t) => t.fecha_limite && t.fecha_limite < hoy);
      const pronto = normales.filter((t) => t.fecha_limite && diasEntre(hoy, t.fecha_limite) > 0 &&
        diasEntre(hoy, t.fecha_limite) === t.recordar_dias_antes);
      const yaVan = new Set([...deHoy, ...atrasadas, ...pronto].map((t) => t.id));
      const insistir = normales.filter((t) => !yaVan.has(t.id) && tocaInsistir(t, hoy));

      const partes: string[] = [];
      if (deHoy.length) partes.push(`Hoy: ${lista(deHoy)}`);
      if (atrasadas.length) partes.push(`Atrasadas: ${lista(atrasadas)}`);
      if (rutinasHoy.length) partes.push(`Rutinas: ${lista(rutinasHoy, 4)}`);
      if (pronto.length) partes.push("Se acerca: " + pronto.map((t) => `${t.titulo} (${cuentaRegresiva(t.fecha_limite!, hoy)})`).join(", "));
      if (insistir.length) partes.push("No te olvides: " + insistir.map((t) =>
        t.fecha_limite ? `${t.titulo} (${cuentaRegresiva(t.fecha_limite, hoy)})` : t.titulo).join(", "));

      if (partes.length) {
        const n = deHoy.length + atrasadas.length;
        const titulo = n ? `Tienes ${n} pendiente${n === 1 ? "" : "s"} para hoy` : "Tu día de hoy";
        enviadas += await enviar(userId, titulo, partes.join(". "), `resumen-${hoy}`);
      }
    }

    // 2) Rutinas a su hora
    for (const t of rutinasHoy) {
      if (t.hora && enEstaVentana(t.hora, minutoActual)) {
        enviadas += await enviar(userId, `Es hora de: ${t.titulo}`,
          `Tu rutina de las ${horaBonita(t.hora)}. Márcala cuando la termines.`, `rutina-${t.id}-${hoy}`);
      }
    }

    // 3) Tareas de hoy con hora
    for (const t of normales) {
      if (t.fecha_limite === hoy && t.hora && enEstaVentana(t.hora, minutoActual)) {
        enviadas += await enviar(userId, `Es hora de: ${t.titulo}`,
          `La programaste para las ${horaBonita(t.hora)}.`, `tarea-${t.id}-${hoy}`);
      }
    }
  }

  return Response.json({ ok: true, enviadas });
});
