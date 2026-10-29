// ============================================================
// EDGE FUNCTION: calendario
// Genera un calendario (.ics) con tus alarmas, rutinas y tareas con fecha.
// El iPhone se suscribe a este enlace y la app Calendario te da las alertas
// por su cuenta: no depende de notificaciones de internet.
//
// Enlace para suscribirte:
//   https://TU-PROYECTO.supabase.co/functions/v1/calendario?token=TU-CALENDARIO-TOKEN
//
// Secretos que usa: CALENDARIO_TOKEN (una clave que inventes)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DIAS_ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// ---------- Ayudantes del formato de calendario ----------
// Escapa los caracteres especiales del formato .ics
function texto(s: string): string {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Las líneas largas se parten en pedazos de máximo 75 bytes (lo exige el formato).
// Se corta por caracteres completos para no romper tildes ni emojis.
const codificador = new TextEncoder();
function doblar(linea: string): string {
  const partes: string[] = [];
  let actual = "";
  let bytes = 0;
  for (const ch of Array.from(linea)) {
    const n = codificador.encode(ch).length;
    const limite = partes.length === 0 ? 75 : 74; // las siguientes empiezan con un espacio
    if (bytes + n > limite) {
      partes.push(actual);
      actual = "";
      bytes = 0;
    }
    actual += ch;
    bytes += n;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

// '2026-11-03' + '14:30' → '20261103T143000'
function fechaHora(fecha: string, hora: string): string {
  return fecha.replace(/-/g, "") + "T" + hora.slice(0, 5).replace(":", "") + "00";
}
function soloFecha(fecha: string): string { return fecha.replace(/-/g, ""); }
function diaColombia(timestamp: string): string {
  return new Date(Date.parse(timestamp) - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function sumarDia(fecha: string): string {
  return new Date(Date.parse(fecha + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
}

// Alerta: minutos antes (positivo) o después (negativo) del inicio
function alerta(minutosAntes: number, descripcion: string): string[] {
  const m = Math.round(minutosAntes);
  const trigger = m >= 0 ? `-PT${m}M` : `PT${-m}M`;
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${texto(descripcion)}`, `TRIGGER:${trigger}`, "END:VALARM"];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!Deno.env.get("CALENDARIO_TOKEN") || url.searchParams.get("token") !== Deno.env.get("CALENDARIO_TOKEN")) {
    return new Response("No autorizado", { status: 401 });
  }

  const hace7 = new Date(Date.now() - 5 * 3600 * 1000 - 7 * 86400000).toISOString().slice(0, 10);
  const [{ data: categorias }, { data: alarmas }, { data: tareas }] = await Promise.all([
    supabase.from("categorias").select("id, nombre"),
    supabase.from("alarmas").select("*"),
    supabase.from("tareas").select("*").eq("hecha", false),
  ]);
  const nombreCat = (id: string) => (categorias ?? []).find((c) => c.id === id)?.nombre ?? "";
  const ahora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const l: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mis Tareas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Mis Tareas",
    "X-WR-TIMEZONE:America/Bogota",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
    "BEGIN:VTIMEZONE",
    "TZID:America/Bogota",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0500",
    "TZNAME:-05",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  const evento = (uid: string, lineas: string[]) => {
    l.push("BEGIN:VEVENT", `UID:${uid}@mis-tareas`, `DTSTAMP:${ahora}Z`, ...lineas, "END:VEVENT");
  };

  // 1) ALARMAS: un evento por cada hora, repetido si la alarma se repite
  for (const a of alarmas ?? []) {
    const dias: number[] = Array.isArray(a.repetir_dias) ? a.repetir_dias : [];
    if (!dias.length && a.fecha < hace7) continue;
    const cat = nombreCat(a.categoria_id);
    const horas: string[] = [a.hora, ...(a.horas_extra ?? [])].filter(Boolean);
    horas.forEach((h, i) => {
      evento(`alarma-${a.id}-${i}`, [
        `SUMMARY:${texto("⏰ " + a.titulo)}`,
        `DTSTART;TZID=America/Bogota:${fechaHora(a.fecha, h)}`,
        "DURATION:PT15M",
        ...(dias.length ? [`RRULE:FREQ=WEEKLY;BYDAY=${dias.map((d) => DIAS_ICS[d]).join(",")}`] : []),
        ...(cat ? [`CATEGORIES:${texto(cat)}`, `DESCRIPTION:${texto(cat)}`] : []),
        ...alerta(a.avisar_min_antes ?? 10, a.titulo),
      ]);
    });
  }

  // 2) RUTINAS: se repiten los días elegidos, con aviso a la hora
  for (const t of tareas ?? []) {
    const dias: number[] = Array.isArray(t.repetir_dias) ? t.repetir_dias : [];
    if (!dias.length) continue;
    const inicio = diaColombia(t.creado_en);
    const byday = dias.map((d) => DIAS_ICS[d]).join(",");
    const cat = nombreCat(t.categoria_id);
    const lineas = [
      `SUMMARY:${texto("↻ " + t.titulo)}`,
      ...(t.hora
        ? [`DTSTART;TZID=America/Bogota:${fechaHora(inicio, t.hora)}`, "DURATION:PT30M"]
        : [`DTSTART;VALUE=DATE:${soloFecha(inicio)}`, `DTEND;VALUE=DATE:${soloFecha(sumarDia(inicio))}`]),
      `RRULE:FREQ=WEEKLY;BYDAY=${byday}`,
      ...(cat ? [`CATEGORIES:${texto(cat)}`] : []),
      // con hora: avisa a la hora; sin hora: a las 8:30 a. m.
      ...alerta(t.hora ? 0 : -(8 * 60 + 30), t.titulo),
    ];
    evento(`rutina-${t.id}`, lineas);
  }

  // 3) TAREAS con fecha límite (las hechas desaparecen al actualizar)
  for (const t of tareas ?? []) {
    if (!t.fecha_limite || (Array.isArray(t.repetir_dias) && t.repetir_dias.length)) continue;
    const cat = nombreCat(t.categoria_id);
    const antes = Number(t.recordar_dias_antes ?? -1);
    const lineas = [
      `SUMMARY:${texto("📌 " + t.titulo)}`,
      ...(cat ? [`CATEGORIES:${texto(cat)}`] : []),
      ...(t.notas ? [`DESCRIPTION:${texto(t.notas)}`] : []),
    ];
    if (t.hora) {
      lineas.push(`DTSTART;TZID=America/Bogota:${fechaHora(t.fecha_limite, t.hora)}`, "DURATION:PT30M");
      lineas.push(...alerta(0, t.titulo));
      if (antes > 0) lineas.push(...alerta(antes * 24 * 60, `${t.titulo}: vence en ${antes} día${antes === 1 ? "" : "s"}`));
    } else {
      lineas.push(`DTSTART;VALUE=DATE:${soloFecha(t.fecha_limite)}`, `DTEND;VALUE=DATE:${soloFecha(sumarDia(t.fecha_limite))}`);
      // el mismo día a las 8:30 a. m.
      lineas.push(...alerta(-(8 * 60 + 30), `${t.titulo}: vence hoy`));
      // X días antes a las 8:30 a. m.
      if (antes > 0) lineas.push(...alerta(antes * 24 * 60 - (8 * 60 + 30), `${t.titulo}: vence en ${antes} día${antes === 1 ? "" : "s"}`));
    }
    evento(`tarea-${t.id}`, lineas);
  }

  l.push("END:VCALENDAR");
  return new Response(l.map(doblar).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mis-tareas.ics"',
      "Cache-Control": "no-cache",
    },
  });
});
