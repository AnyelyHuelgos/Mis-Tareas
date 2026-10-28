// ============================================================
// AYUDANTES DE FECHAS
// Guardamos las fechas como texto 'AAAA-MM-DD' (formato ISO).
// Así se pueden comparar directamente: '2026-10-27' < '2026-10-30'
// ============================================================
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Date -> 'AAAA-MM-DD' usando la hora LOCAL (no UTC, para no cambiar de día)
function aISO(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

// 'AAAA-MM-DD' -> Date
function desdeISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function hoyISO() { return aISO(new Date()); }

function sumarDias(iso, dias) {
  const f = desdeISO(iso);
  f.setDate(f.getDate() + dias);
  return aISO(f);
}

function diasEntre(desde, hasta) {
  return Math.round((desdeISO(hasta) - desdeISO(desde)) / 86400000);
}

function mayuscula(texto) { return texto.charAt(0).toUpperCase() + texto.slice(1); }

// "Hoy", "Mañana", "Viernes 30 de octubre"…
function etiquetaFecha(iso) {
  if (!iso) return 'Sin fecha';
  const hoy = hoyISO();
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  if (iso === sumarDias(hoy, -1)) return 'Ayer';
  const f = desdeISO(iso);
  return `${mayuscula(DIAS[f.getDay()])} ${f.getDate()} de ${MESES[f.getMonth()]}`;
}

function fechaLarga(fecha = new Date()) {
  return `${mayuscula(DIAS[fecha.getDay()])} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

// "15:30" -> "3:30 p. m."
function horaBonita(hhmm) {
  if (!hhmm) return '';
  let [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  const sufijo = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${sufijo}`;
}
