// ============================================================
// CALENDARIO MENSUAL
// Dibuja una cuadrícula de 7 columnas (lunes a domingo).
// Cada día muestra un punto de color por cada tarea de esa fecha.
// ============================================================
function htmlCalendario({ anio, mes, seleccionado, tareas, colorDe }) {
  const primero = new Date(anio, mes, 1);
  // getDay(): domingo=0. Lo convertimos para que la semana empiece en lunes.
  const desplazamiento = (primero.getDay() + 6) % 7;
  const inicio = new Date(anio, mes, 1 - desplazamiento);
  const hoy = hoyISO();

  // Agrupar tareas por fecha
  const porFecha = {};
  tareas.forEach((t) => {
    if (!t.fecha_limite) return;
    (porFecha[t.fecha_limite] ||= []).push(t);
  });

  let celdas = DIAS_CORTOS.map((d) => `<div class="cal-dia-nombre">${d}</div>`).join('');

  for (let i = 0; i < 42; i++) {
    const f = new Date(inicio);
    f.setDate(inicio.getDate() + i);
    const iso = aISO(f);
    const delDia = porFecha[iso] || [];
    const clases = ['cal-dia'];
    if (f.getMonth() !== mes) clases.push('otro-mes');
    if (iso === hoy) clases.push('hoy');
    if (iso === seleccionado) clases.push('seleccionado');

    const puntos = delDia.slice(0, 4).map((t) =>
      `<i style="background:${t.hecha ? 'var(--hecha)' : colorDe(t.categoria_id)}"></i>`
    ).join('');

    celdas += `
      <button class="${clases.join(' ')}" data-accion="elegir-dia" data-fecha="${iso}"
        aria-label="${etiquetaFecha(iso)}, ${delDia.length} tareas">
        ${f.getDate()}
        <span class="cal-puntos">${puntos}</span>
      </button>`;
  }

  return `
    <div class="cal">
      <div class="cal-cabeza">
        <button data-accion="mes-anterior" aria-label="Mes anterior">‹</button>
        <h2>${mayuscula(MESES[mes])} ${anio}</h2>
        <button data-accion="mes-siguiente" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal-grid">${celdas}</div>
    </div>`;
}
