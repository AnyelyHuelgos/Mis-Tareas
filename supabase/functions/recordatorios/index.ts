// ============================================================
// EDGE FUNCTION: recordatorios
// Corre en los servidores de Supabase (gratis). pg_cron la llama cada 5 minutos.
//
// Por dónde manda los avisos:
//   - ntfy (app gratis para iPhone y Android) si configuras el secreto NTFY_TOPIC
//   - notificaciones web (Web Push) a los celulares registrados con la campana
//
// Qué manda:
//   1. A las 8:30 a. m. (hora Colombia, cámbiala con el secreto HORA_RESUMEN): resumen del día
//      - lo de hoy y lo atrasado
//      - lo que vence en X días (campo "Avisarme")
//      - lo que toca insistir (campo "Insistirme cada X días")
//      - las rutinas de hoy
//   2. A la hora de cada rutina, si hoy le toca y no la has marcado
//   3. A la hora de cada tarea que vence hoy, si no la has marcado
//   4. Las ALARMAS, X minutos antes (ej. reunión a las 2 p. m., aviso a la 1:50),
//      con varias horas y repetición (ej. medicamentos 8 a. m., 1 p. m. y 7 p. m. todos los días)
//   5. "Insistirme cada X horas" entre la hora del resumen y HORA_FIN, hasta marcarla
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

const HORA_RESUMEN = Deno.env.get("HORA_RESUMEN") ?? "08:30"; // puedes cambiarla en Secrets
const HORA_FIN = Deno.env.get("HORA_FIN") ?? "21:00";         // hasta qué hora insistir cada X horas
const MINUTOS_VENTANA = 5; // cada cuánto corre pg_cron
const NTFY_TOPIC = Deno.env.get("NTFY_TOPIC");
// Token de tu cuenta gratis de ntfy.sh: así el límite diario es solo tuyo
// y no se comparte con otros usuarios de Supabase.
const NTFY_TOKEN = Deno.env.get("NTFY_TOKEN");
let ultimoNtfy = "sin intentar"; // para el diagnóstico de la prueba
const NTFY_SERVIDOR = Deno.env.get("NTFY_SERVIDOR") ?? "https://ntfy.sh";
const APP_URL = Deno.env.get("APP_URL") ?? "https://tareas-anyely.netlify.app";

type Tarea = {
  id: string; user_id: string; titulo: string;
  fecha_limite: string | null; hora: string | null;
  recordar_dias_antes: number; recordar_cada: number; recordar_cada_horas: number;
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

// ---------- ntfy: app gratis que sí funciona bien en iPhone ----------
// prioridad: 3 normal, 4 alta, 5 urgente (vibra más fuerte)
async function enviarNtfy(titulo: string, cuerpo: string, prioridad = 3, etiquetas: string[] = []): Promise<number> {
  if (!NTFY_TOPIC) return 0;
  try {
    const r = await fetch(NTFY_SERVIDOR, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(NTFY_TOKEN ? { Authorization: `Bearer ${NTFY_TOKEN}` } : {}),
      },
      body: JSON.stringify({ topic: NTFY_TOPIC, title: titulo, message: cuerpo, priority: prioridad, tags: etiquetas, click: APP_URL }),
    });
    ultimoNtfy = `${r.status} ${await r.text()}`.slice(0, 300);
    return r.ok ? 1 : 0;
  } catch (e) {
    ultimoNtfy = "error: " + String(e);
    return 0;
  }
}

// ---------- Enviar a todos los celulares del usuario ----------
async function enviar(userId: string, titulo: string, cuerpo: string, tag: string, prioridad = 3, etiquetas: string[] = []): Promise<number> {
  let enviadas = await enviarNtfy(titulo, cuerpo, prioridad, etiquetas);
  const { data: subs } = await supabase
    .from("push_suscripciones").select("id, suscripcion").eq("user_id", userId);
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

  // Todos los usuarios de la app (los que tienen categorías)
  const { data: cats } = await supabase.from("categorias").select("user_id");
  const usuarios = [...new Set((cats ?? []).map((c) => c.user_id))];

  // ---------- Modo prueba ----------
  if (cuerpo.prueba) {
    let enviadas = 0;
    for (const u of usuarios) {
      enviadas += await enviar(u, "Notificación de prueba",
        "¡Funciona! Así te llegarán tus recordatorios.", "prueba-" + Date.now(), 4, ["tada"]);
    }
    return Response.json({
      ok: true, prueba: true, enviadas,
      usuarios: usuarios.length, ntfyConfigurado: Boolean(NTFY_TOPIC), ntfy: ultimoNtfy,
    });
  }

  const ahora = ahoraColombia();
  const hoy = fechaColombia();
  const diaSemana = ahora.getUTCDay(); // 0 = domingo
  const minutoActual = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const tocaResumen = enEstaVentana(HORA_RESUMEN, minutoActual);

  const { data, error } = await supabase
    .from("tareas")
    .select("id, user_id, titulo, fecha_limite, hora, recordar_dias_antes, recordar_cada, recordar_cada_horas, repetir_dias, ultima_completada, creado_en")
    .eq("hecha", false);
  if (error) return new Response(error.message, { status: 500 });

  // Agrupar por usuario
  const porUsuario = new Map<string, Tarea[]>();
  for (const t of (data ?? []) as Tarea[]) {
    porUsuario.set(t.user_id, [...(porUsuario.get(t.user_id) ?? []), t]);
  }

  // Alarmas de hoy y mañana que aún no se han avisado
  const { data: alarmas } = await supabase
    .from("alarmas")
    .select("id, user_id, titulo, fecha, hora, horas_extra, repetir_dias, avisar_min_antes");
  const inicioVentana = Math.floor(minutoActual / MINUTOS_VENTANA) * MINUTOS_VENTANA;
  const base = aMinutos(HORA_RESUMEN);

  let enviadas = 0;
  for (const userId of usuarios) {
    const tareas = porUsuario.get(userId) ?? [];
    const rutinasHoy = tareas.filter((t) => esRutina(t) && t.repetir_dias.includes(diaSemana) && t.ultima_completada !== hoy);
    const normales = tareas.filter((t) => !esRutina(t));

    // 1) Resumen de la mañana
    if (tocaResumen) {
      const deHoy = normales.filter((t) => t.fecha_limite === hoy);
      const atrasadas = normales.filter((t) => t.fecha_limite && t.fecha_limite < hoy);
      const pronto = normales.filter((t) => t.fecha_limite && diasEntre(hoy, t.fecha_limite) > 0 &&
        diasEntre(hoy, t.fecha_limite) === t.recordar_dias_antes);
      const yaVan = new Set([...deHoy, ...atrasadas, ...pronto].map((t) => t.id));
      const insistir = normales.filter((t) => !yaVan.has(t.id) && (tocaInsistir(t, hoy) || t.recordar_cada_horas > 0));

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
        enviadas += await enviar(userId, titulo, partes.join(". "), `resumen-${hoy}`, 3, ["sunny"]);
      }
    }

    // 2) Rutinas a su hora
    for (const t of rutinasHoy) {
      if (t.hora && enEstaVentana(t.hora, minutoActual)) {
        enviadas += await enviar(userId, `Es hora de: ${t.titulo}`,
          `Tu rutina de las ${horaBonita(t.hora)}. Márcala cuando la termines.`, `rutina-${t.id}-${hoy}`, 4, ["repeat"]);
      }
    }

    // 3) Tareas de hoy con hora
    for (const t of normales) {
      if (t.fecha_limite === hoy && t.hora && enEstaVentana(t.hora, minutoActual)) {
        enviadas += await enviar(userId, `Es hora de: ${t.titulo}`,
          `La programaste para las ${horaBonita(t.hora)}.`, `tarea-${t.id}-${hoy}`, 4, ["pushpin"]);
      }
    }

    // 4) Alarmas: cada hora de la alarma, X minutos antes.
    //    Revisamos hoy y mañana (por si el aviso es de 1 día antes).
    for (const a of (alarmas ?? []).filter((x) => x.user_id === userId)) {
      const dias: number[] = Array.isArray(a.repetir_dias) ? a.repetir_dias : [];
      const horas: string[] = [a.hora, ...(a.horas_extra ?? [])].filter(Boolean);
      for (const sumar of [0, 1, 2]) {
        const fecha = fechaColombia(sumar);
        const diaSem = new Date(Date.parse(fecha + "T12:00:00Z")).getUTCDay();
        const toca = dias.length ? (a.fecha <= fecha && dias.includes(diaSem)) : a.fecha === fecha;
        if (!toca) continue;
        for (const h of horas) {
          // minuto del aviso contado desde hoy a medianoche (puede ser de mañana)
          const aviso = sumar * 1440 + aMinutos(h) - (a.avisar_min_antes ?? 0);
          if (aviso >= inicioVentana && aviso < inicioVentana + MINUTOS_VENTANA) {
            const cuando = a.avisar_min_antes
              ? (a.avisar_min_antes >= 1440 ? "Mañana" : `En ${a.avisar_min_antes} minutos`)
              : "Ahora";
            enviadas += await enviar(userId, `⏰ ${a.titulo}`,
              `${cuando}, a las ${horaBonita(h)}.`, `alarma-${a.id}-${fecha}-${h}`, 5, ["alarm_clock"]);
          }
        }
      }
    }

    // 5) Insistir cada X horas, desde la hora del resumen hasta HORA_FIN
    if (inicioVentana > base && inicioVentana <= aMinutos(HORA_FIN)) {
      for (const t of normales) {
        const cada = t.recordar_cada_horas || 0;
        if (cada && (inicioVentana - base) % (cada * 60) === 0) {
          const extra = t.fecha_limite ? ` (${cuentaRegresiva(t.fecha_limite, hoy)}${t.hora ? `, ${horaBonita(t.hora)}` : ""})` : "";
          enviadas += await enviar(userId, `🔔 No te olvides: ${t.titulo}`,
            `Sigue pendiente${extra}. Márcala cuando la termines.`, `insistir-${t.id}-${inicioVentana}`, 4, ["bell"]);
        }
      }
    }
  }

  return Response.json({ ok: true, enviadas });
});
