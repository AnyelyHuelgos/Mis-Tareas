// ============================================================
// APP PRINCIPAL
// Flujo: revisar sesión → cargar datos → pintar la vista activa.
// Cada vez que algo cambia, actualizamos "estado" y llamamos render().
// ============================================================

const estado = {
  categorias: [],
  tareas: [],
  subtareas: [],
  vista: 'hoy',              // hoy | semana | calendario | categorias
  filtroCategoria: null,     // id de categoría o null = todas
  diaSeleccionado: hoyISO(),
  mes: { anio: new Date().getFullYear(), mes: new Date().getMonth() },
  categoriasAbiertas: new Set()
};

const COLORES = ['#4A6FA5', '#E07A5F', '#3E9B5F', '#9B5DE5', '#F2B33D',
  '#E5487A', '#2A9D8F', '#8D6E63', '#5C7AEA', '#C8463D'];

const CATEGORIAS_INICIALES = ['Universidad', 'Trabajo', 'Planecitos', 'Geriani', 'Mi página'];

// ---------- Atajos ----------
const $ = (sel) => document.querySelector(sel);
const contenido = $('#contenido');

function esc(texto = '') {
  return String(texto).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let temporizadorToast;
function toast(mensaje) {
  const t = $('#toast');
  t.textContent = mensaje;
  t.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), 3200);
}

function categoriaPorId(id) { return estado.categorias.find((c) => c.id === id); }
function colorDe(idCat) { return categoriaPorId(idCat)?.color || '#8A93AB'; }
function subtareasDe(idTarea) { return estado.subtareas.filter((s) => s.tarea_id === idTarea); }

function tareasFiltradas() {
  return estado.filtroCategoria
    ? estado.tareas.filter((t) => t.categoria_id === estado.filtroCategoria)
    : estado.tareas;
}

// Pendientes primero, luego por prioridad y hora
function ordenar(lista) {
  const peso = { alta: 0, media: 1, baja: 2 };
  return [...lista].sort((a, b) =>
    (a.hecha - b.hecha) ||
    ((a.fecha_limite || '9999') < (b.fecha_limite || '9999') ? -1 : (a.fecha_limite || '9999') > (b.fecha_limite || '9999') ? 1 : 0) ||
    (peso[a.prioridad] - peso[b.prioridad]) ||
    ((a.hora || '99') < (b.hora || '99') ? -1 : 1));
}

// ============================================================
// INICIO Y SESIÓN
// ============================================================
async function arrancar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
  }
  const usuario = await DB.usuarioActual();
  usuario ? iniciarApp() : mostrarLogin();
}

function mostrarLogin() {
  $('#pantallaApp').hidden = true;
  $('#pantallaLogin').hidden = false;
}

async function iniciarApp() {
  $('#pantallaLogin').hidden = true;
  $('#pantallaApp').hidden = false;

  const h = new Date().getHours();
  $('#saludo').textContent = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  $('#fechaHoy').textContent = fechaLarga();

  try {
    await recargar();
    if (!estado.categorias.length) await crearCategoriasIniciales();
    resumenLocal(estado.tareas);
  } catch (e) {
    console.error(e);
    toast('No pude cargar tus tareas. Revisa tu conexión.');
  }
}

async function recargar() {
  const datos = await DB.cargarTodo();
  Object.assign(estado, datos);
  render();
}

async function crearCategoriasIniciales() {
  for (let i = 0; i < CATEGORIAS_INICIALES.length; i++) {
    await DB.crearCategoria({ nombre: CATEGORIAS_INICIALES[i], color: COLORES[i] });
  }
  await recargar();
}

$('#formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#btnEntrar');
  $('#loginError').textContent = '';
  boton.disabled = true;
  boton.textContent = 'Entrando…';
  try {
    await DB.entrar($('#loginCorreo').value.trim(), $('#loginClave').value, $('#loginRecordar').checked);
    iniciarApp();
  } catch (err) {
    $('#loginError').textContent = 'Correo o contraseña incorrectos.';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
});

$('#btnSalir').addEventListener('click', async () => {
  if (!confirm('¿Cerrar sesión en este dispositivo?')) return;
  await DB.salir();
  mostrarLogin();
});

// ============================================================
// RENDER
// ============================================================
function render() {
  renderChips();
  document.querySelectorAll('.barra-inferior [data-vista]').forEach((b) =>
    b.classList.toggle('activa', b.dataset.vista === estado.vista));

  const vistas = { hoy: vistaHoy, semana: vistaSemana, calendario: vistaCalendario, categorias: vistaCategorias };
  contenido.innerHTML = vistas[estado.vista]();
}

function renderChips() {
  const chips = [`<button class="chip ${!estado.filtroCategoria ? 'activo' : ''}" data-accion="filtrar" data-id="">Todas</button>`];
  estado.categorias.forEach((c) => {
    chips.push(`<button class="chip ${estado.filtroCategoria === c.id ? 'activo' : ''}" data-accion="filtrar" data-id="${c.id}">
      <span class="punto" style="background:${c.color}"></span>${esc(c.nombre)}</button>`);
  });
  chips.push('<button class="chip nuevo" data-accion="nueva-categoria">+ Categoría</button>');
  $('#chipsCategorias').innerHTML = chips.join('');
}

// ---------- Tarjeta de una tarea ----------
function htmlTarea(t) {
  const cat = categoriaPorId(t.categoria_id);
  const subs = subtareasDe(t.id);
  const hechas = subs.filter((s) => s.hecha).length;
  const hoy = hoyISO();
  const vencida = !t.hecha && t.fecha_limite && t.fecha_limite < hoy;

  const meta = [];
  if (cat && !estado.filtroCategoria) meta.push(`<span class="etiqueta-cat">${esc(cat.nombre)}</span>`);
  if (t.fecha_limite) meta.push(`<span class="${vencida ? 'vencida' : ''}">${vencida ? 'Venció: ' : ''}${etiquetaFecha(t.fecha_limite)}</span>`);
  if (t.hora) meta.push(`<span>${horaBonita(t.hora)}</span>`);
  if (t.prioridad === 'alta' && !t.hecha) meta.push('<span class="prioridad-alta">Prioridad alta</span>');
  if (subs.length) meta.push(`<span>${hechas} de ${subs.length} subtareas</span>`);

  const listaSubs = subs.length ? `
    <ul class="subtareas">
      ${subs.map((s) => `
        <li class="${s.hecha ? 'hecha' : ''}">
          <input type="checkbox" class="check chico" data-accion="marcar-subtarea" data-id="${s.id}"
            ${s.hecha ? 'checked' : ''} aria-label="Completar ${esc(s.titulo)}">
          <span>${esc(s.titulo)}</span>
        </li>`).join('')}
    </ul>` : '';

  return `
    <article class="tarea ${t.hecha ? 'hecha' : ''}" style="--color-cat:${cat?.color || '#8A93AB'}">
      <div class="tarea-fila">
        <input type="checkbox" class="check" data-accion="marcar-tarea" data-id="${t.id}"
          ${t.hecha ? 'checked' : ''} aria-label="Completar ${esc(t.titulo)}">
        <div class="tarea-cuerpo" data-accion="editar-tarea" data-id="${t.id}">
          <div class="tarea-titulo">${esc(t.titulo)}</div>
          ${meta.length ? `<div class="tarea-meta">${meta.join('')}</div>` : ''}
        </div>
      </div>
      ${listaSubs}
    </article>`;
}

function htmlLista(lista) { return ordenar(lista).map(htmlTarea).join(''); }

function htmlVacio(texto, boton = true) {
  return `<div class="vacio"><p>${texto}</p>${boton ? '<button class="btn primario" data-accion="nueva-tarea">Agregar tarea</button>' : ''}</div>`;
}

function htmlProgreso(lista, etiqueta) {
  const total = lista.length;
  const hechas = lista.filter((t) => t.hecha).length;
  const pct = total ? Math.round((hechas / total) * 100) : 0;
  return `
    <section class="progreso" aria-label="Progreso">
      <div class="progreso-texto"><span>${hechas} de ${total} ${etiqueta}</span><span>${pct}%</span></div>
      <div class="barra"><div class="barra-relleno" style="width:${pct}%"></div></div>
    </section>`;
}

// ---------- Vista: HOY ----------
function vistaHoy() {
  const hoy = hoyISO();
  const lista = tareasFiltradas();
  const vencidas = lista.filter((t) => !t.hecha && t.fecha_limite && t.fecha_limite < hoy);
  const deHoy = lista.filter((t) => t.fecha_limite === hoy);
  const sinFecha = lista.filter((t) => !t.fecha_limite && !t.hecha);

  let html = htmlProgreso([...vencidas, ...deHoy], 'hechas hoy');

  if (vencidas.length) html += `<h2 class="titulo-seccion">Atrasadas <small>${vencidas.length}</small></h2>${htmlLista(vencidas)}`;
  html += `<h2 class="titulo-seccion">Para hoy <small>${deHoy.length}</small></h2>`;
  html += deHoy.length ? htmlLista(deHoy) : htmlVacio('No tienes nada para hoy.');
  if (sinFecha.length) html += `<h2 class="titulo-seccion">Sin fecha <small>${sinFecha.length}</small></h2>${htmlLista(sinFecha)}`;
  return html;
}

// ---------- Vista: SEMANA (hoy + 6 días) ----------
function vistaSemana() {
  const hoy = hoyISO();
  const lista = tareasFiltradas();
  const enSemana = lista.filter((t) => t.fecha_limite >= hoy && t.fecha_limite <= sumarDias(hoy, 6));
  let html = htmlProgreso(enSemana, 'hechas esta semana');

  for (let i = 0; i < 7; i++) {
    const dia = sumarDias(hoy, i);
    const delDia = lista.filter((t) => t.fecha_limite === dia);
    const pendientes = delDia.filter((t) => !t.hecha).length;
    html += `<h2 class="titulo-seccion">${etiquetaFecha(dia)} <small>${delDia.length ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : 'Libre'}</small></h2>`;
    html += htmlLista(delDia);
  }
  return html;
}

// ---------- Vista: CALENDARIO ----------
function vistaCalendario() {
  const lista = tareasFiltradas();
  const delDia = lista.filter((t) => t.fecha_limite === estado.diaSeleccionado);
  return htmlCalendario({
    anio: estado.mes.anio,
    mes: estado.mes.mes,
    seleccionado: estado.diaSeleccionado,
    tareas: lista,
    colorDe
  }) + `<h2 class="titulo-seccion">${etiquetaFecha(estado.diaSeleccionado)} <small>${delDia.length} tarea${delDia.length === 1 ? '' : 's'}</small></h2>`
    + (delDia.length ? htmlLista(delDia) : htmlVacio('Nada este día.'));
}

// ---------- Vista: CATEGORÍAS ----------
function vistaCategorias() {
  const cats = estado.filtroCategoria
    ? estado.categorias.filter((c) => c.id === estado.filtroCategoria)
    : estado.categorias;

  let html = `<h2 class="titulo-seccion">Tus categorías
    <button class="btn suave" data-accion="nueva-categoria">+ Nueva categoría</button></h2>`;

  if (!cats.length) return html + htmlVacio('Crea tu primera categoría para empezar.', false);

  cats.forEach((c) => {
    const delaCat = estado.tareas.filter((t) => t.categoria_id === c.id);
    const hechas = delaCat.filter((t) => t.hecha).length;
    const pct = delaCat.length ? Math.round((hechas / delaCat.length) * 100) : 0;
    const abierta = estado.categoriasAbiertas.has(c.id);
    html += `
      <section class="cat-tarjeta" style="--color-cat:${c.color}">
        <div class="cat-cabeza">
          <div data-accion="abrir-categoria" data-id="${c.id}" style="flex:1;cursor:pointer">
            <h3>${esc(c.nombre)}</h3>
            <small>${hechas} de ${delaCat.length} hechas ${abierta ? '▴' : '▾'}</small>
          </div>
          <button class="btn suave" data-accion="editar-categoria" data-id="${c.id}">Editar</button>
        </div>
        <div class="barra"><div class="barra-relleno" style="width:${pct}%"></div></div>
        ${abierta ? `<div class="cat-tareas">${delaCat.length ? htmlLista(delaCat) : '<p class="vacio">Sin tareas todavía.</p>'}
          <button class="btn suave" data-accion="nueva-tarea" data-categoria="${c.id}">+ Tarea en ${esc(c.nombre)}</button></div>` : ''}
      </section>`;
  });
  return html;
}

// ============================================================
// ACCIONES (un solo "escuchador" para todos los clics)
// ============================================================
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const { accion, id } = el.dataset;

  switch (accion) {
    case 'filtrar':
      estado.filtroCategoria = id || null;
      render();
      break;
    case 'nueva-tarea':
      abrirTarea(null, { categoria_id: el.dataset.categoria || estado.filtroCategoria });
      break;
    case 'editar-tarea':
      abrirTarea(estado.tareas.find((t) => t.id === id));
      break;
    case 'marcar-tarea':
      await marcarTarea(id, el.checked);
      break;
    case 'marcar-subtarea':
      await marcarSubtarea(id, el.checked);
      break;
    case 'nueva-categoria':
      abrirCategoria(null);
      break;
    case 'editar-categoria':
      abrirCategoria(categoriaPorId(id));
      break;
    case 'abrir-categoria':
      estado.categoriasAbiertas.has(id) ? estado.categoriasAbiertas.delete(id) : estado.categoriasAbiertas.add(id);
      render();
      break;
    case 'elegir-dia':
      estado.diaSeleccionado = el.dataset.fecha;
      render();
      break;
    case 'mes-anterior':
    case 'mes-siguiente': {
      const f = new Date(estado.mes.anio, estado.mes.mes + (accion === 'mes-siguiente' ? 1 : -1), 1);
      estado.mes = { anio: f.getFullYear(), mes: f.getMonth() };
      render();
      break;
    }
  }
});

document.querySelectorAll('.barra-inferior [data-vista]').forEach((b) =>
  b.addEventListener('click', () => { estado.vista = b.dataset.vista; render(); window.scrollTo(0, 0); }));

$('#btnNuevaTarea').addEventListener('click', () => abrirTarea(null, { categoria_id: estado.filtroCategoria }));

// ---------- Marcar como hecha ----------
async function marcarTarea(id, hecha) {
  const t = estado.tareas.find((x) => x.id === id);
  const subs = subtareasDe(id);
  const antes = { tarea: t.hecha, subs: subs.map((s) => s.hecha) };

  // Cambiamos en pantalla primero (se siente instantáneo) y luego guardamos
  t.hecha = hecha;
  if (hecha) subs.forEach((s) => (s.hecha = true));
  render();
  if (hecha) toast('¡Tarea completada!');

  try {
    await DB.editarTarea(id, { hecha });
    if (hecha) await Promise.all(subs.filter((s, i) => !antes.subs[i]).map((s) => DB.editarSubtarea(s.id, { hecha: true })));
  } catch (err) {
    t.hecha = antes.tarea;
    subs.forEach((s, i) => (s.hecha = antes.subs[i]));
    render();
    toast('No se pudo guardar. Revisa tu conexión.');
  }
}

async function marcarSubtarea(id, hecha) {
  const s = estado.subtareas.find((x) => x.id === id);
  const t = estado.tareas.find((x) => x.id === s.tarea_id);
  const antes = { sub: s.hecha, tarea: t.hecha };

  s.hecha = hecha;
  // Si todas las subtareas están hechas, la tarea se completa sola
  const todas = subtareasDe(t.id).every((x) => x.hecha);
  t.hecha = todas;
  render();
  if (todas && !antes.tarea) toast('¡Completaste todas las subtareas!');

  try {
    await DB.editarSubtarea(id, { hecha });
    if (t.hecha !== antes.tarea) await DB.editarTarea(t.id, { hecha: t.hecha });
  } catch (err) {
    s.hecha = antes.sub;
    t.hecha = antes.tarea;
    render();
    toast('No se pudo guardar. Revisa tu conexión.');
  }
}

// ============================================================
// DIÁLOGO DE TAREA (crear y editar)
// ============================================================
const dlgTarea = $('#dlgTarea');
let tareaEditando = null;

function filaSubtarea(titulo = '', id = '') {
  const li = document.createElement('li');
  li.innerHTML = `
    <div class="sub-fila">
      <input type="text" value="${esc(titulo)}" data-id="${id}" placeholder="Subtarea" maxlength="140">
      <button type="button" aria-label="Quitar subtarea">×</button>
    </div>`;
  li.querySelector('button').addEventListener('click', () => li.remove());
  return li;
}

function abrirTarea(tarea, prellenado = {}, transcripcion = '') {
  if (!estado.categorias.length) {
    toast('Primero crea una categoría.');
    abrirCategoria(null);
    return;
  }
  tareaEditando = tarea || null;
  const datos = tarea || prellenado;

  $('#dlgTareaTitulo').textContent = tarea ? 'Editar tarea' : 'Nueva tarea';
  $('#transcripcion').hidden = !transcripcion;
  $('#transcripcion').textContent = transcripcion ? `Escuché: "${transcripcion}"` : '';

  $('#tCategoria').innerHTML = estado.categorias
    .map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');

  $('#tTitulo').value = datos.titulo || '';
  $('#tCategoria').value = datos.categoria_id || estado.categorias[0].id;
  $('#tFecha').value = datos.fecha_limite || '';
  $('#tHora').value = datos.hora ? datos.hora.slice(0, 5) : '';
  $('#tPrioridad').value = datos.prioridad || 'media';
  $('#tRecordar').value = String(datos.recordar_dias_antes ?? 2);
  $('#tNotas').value = datos.notas || '';

  const lista = $('#listaSubEditor');
  lista.innerHTML = '';
  const subs = tarea ? subtareasDe(tarea.id) : (prellenado.subtareas || []).map((titulo) => ({ titulo, id: '' }));
  subs.forEach((s) => lista.appendChild(filaSubtarea(s.titulo, s.id)));

  $('#btnEliminarTarea').hidden = !tarea;
  dlgTarea.showModal();
  if (!datos.titulo) setTimeout(() => $('#tTitulo').focus(), 50);
}

$('#btnAgregarSub').addEventListener('click', () => {
  const fila = filaSubtarea();
  $('#listaSubEditor').appendChild(fila);
  fila.querySelector('input').focus();
});

$('#formTarea').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    titulo: $('#tTitulo').value.trim(),
    categoria_id: $('#tCategoria').value,
    fecha_limite: $('#tFecha').value || null,
    hora: $('#tHora').value || null,
    prioridad: $('#tPrioridad').value,
    recordar_dias_antes: Number($('#tRecordar').value),
    notas: $('#tNotas').value.trim() || null
  };
  if (!datos.titulo) return;

  // Leer las subtareas del formulario
  const filas = [...$('#listaSubEditor').querySelectorAll('input')]
    .map((inp, i) => ({ id: inp.dataset.id, titulo: inp.value.trim(), orden: i }))
    .filter((f) => f.titulo);

  try {
    if (!tareaEditando) {
      const nueva = await DB.crearTarea(datos);
      await DB.crearSubtareas(filas.map((f) => ({ tarea_id: nueva.id, titulo: f.titulo, orden: f.orden })));
      toast('Tarea guardada');
    } else {
      await DB.editarTarea(tareaEditando.id, datos);
      const existentes = subtareasDe(tareaEditando.id);
      const idsQueQuedan = filas.filter((f) => f.id).map((f) => f.id);
      // 1. Borrar las que quitaste
      await DB.eliminarSubtareas(existentes.filter((s) => !idsQueQuedan.includes(s.id)).map((s) => s.id));
      // 2. Actualizar las que siguen
      await Promise.all(filas.filter((f) => f.id).map((f) => DB.editarSubtarea(f.id, { titulo: f.titulo, orden: f.orden })));
      // 3. Crear las nuevas
      await DB.crearSubtareas(filas.filter((f) => !f.id).map((f) => ({ tarea_id: tareaEditando.id, titulo: f.titulo, orden: f.orden })));
      toast('Cambios guardados');
    }
    dlgTarea.close();
    await recargar();
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar la tarea. Revisa tu conexión.');
  }
});

$('#btnEliminarTarea').addEventListener('click', async () => {
  if (!tareaEditando || !confirm('¿Eliminar esta tarea y sus subtareas?')) return;
  try {
    await DB.eliminarTarea(tareaEditando.id);
    dlgTarea.close();
    toast('Tarea eliminada');
    await recargar();
  } catch (err) {
    toast('No se pudo eliminar. Revisa tu conexión.');
  }
});

// ============================================================
// DIÁLOGO DE CATEGORÍA
// ============================================================
const dlgCategoria = $('#dlgCategoria');
let categoriaEditando = null;
let colorElegido = COLORES[0];

function pintarPaleta() {
  $('#paletaColores').innerHTML = COLORES.map((c) =>
    `<button type="button" class="color-opcion ${c === colorElegido ? 'elegido' : ''}"
      style="background:${c}" data-color="${c}" aria-label="Color ${c}"></button>`).join('');
}

$('#paletaColores').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  colorElegido = b.dataset.color;
  pintarPaleta();
});

function abrirCategoria(cat) {
  categoriaEditando = cat || null;
  $('#dlgCatTitulo').textContent = cat ? 'Editar categoría' : 'Nueva categoría';
  $('#cNombre').value = cat?.nombre || '';
  colorElegido = cat?.color || COLORES[estado.categorias.length % COLORES.length];
  pintarPaleta();
  $('#btnEliminarCat').hidden = !cat;
  dlgCategoria.showModal();
  setTimeout(() => $('#cNombre').focus(), 50);
}

$('#formCategoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = { nombre: $('#cNombre').value.trim(), color: colorElegido };
  if (!datos.nombre) return;
  try {
    if (categoriaEditando) await DB.editarCategoria(categoriaEditando.id, datos);
    else await DB.crearCategoria(datos);
    dlgCategoria.close();
    toast(categoriaEditando ? 'Categoría actualizada' : `Categoría "${datos.nombre}" creada`);
    await recargar();
  } catch (err) {
    toast('No se pudo guardar la categoría.');
  }
});

$('#btnEliminarCat').addEventListener('click', async () => {
  if (!categoriaEditando) return;
  const n = estado.tareas.filter((t) => t.categoria_id === categoriaEditando.id).length;
  if (!confirm(`¿Eliminar "${categoriaEditando.nombre}"?${n ? ` También se borrarán sus ${n} tareas.` : ''}`)) return;
  try {
    await DB.eliminarCategoria(categoriaEditando.id);
    if (estado.filtroCategoria === categoriaEditando.id) estado.filtroCategoria = null;
    dlgCategoria.close();
    toast('Categoría eliminada');
    await recargar();
  } catch (err) {
    toast('No se pudo eliminar.');
  }
});

// Botones "Cancelar" de los diálogos
document.querySelectorAll('[data-cerrar]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));

// ============================================================
// VOZ
// ============================================================
$('#btnVoz').addEventListener('click', () => {
  if (escuchandoAhora()) { detenerVoz(); return; }
  escuchar({
    alEmpezar: () => {
      $('#escuchando').hidden = false;
      $('#btnVoz').classList.add('activo');
    },
    alTerminar: (texto) => {
      $('#escuchando').hidden = true;
      $('#btnVoz').classList.remove('activo');
      if (texto) procesarVoz(texto);
    },
    alError: (mensaje) => {
      $('#escuchando').hidden = true;
      $('#btnVoz').classList.remove('activo');
      toast(mensaje);
    }
  });
});

async function procesarVoz(texto) {
  const r = interpretarComando(texto, estado.categorias);
  let categoriaId = r.categoriaId;

  // Si nombraste una categoría que no existe, la creamos
  if (!categoriaId && r.categoriaNueva) {
    try {
      const nueva = await DB.crearCategoria({
        nombre: r.categoriaNueva,
        color: COLORES[estado.categorias.length % COLORES.length]
      });
      await recargar();
      categoriaId = nueva.id;
      toast(`Creé la categoría "${nueva.nombre}"`);
    } catch (err) {
      toast('No pude crear la categoría.');
    }
  }

  // Abrimos el formulario ya lleno para que revises y toques "Guardar tarea"
  abrirTarea(null, {
    titulo: r.titulo,
    categoria_id: categoriaId || estado.filtroCategoria,
    fecha_limite: r.fecha,
    hora: r.hora,
    subtareas: r.subtareas
  }, texto);
}

// ============================================================
// NOTIFICACIONES E INSTALACIÓN
// ============================================================
$('#btnNotificaciones').addEventListener('click', async () => {
  try {
    await activarNotificaciones();
    toast('Recordatorios activados');
  } catch (err) {
    toast(err.message || 'No se pudieron activar las notificaciones.');
  }
});

let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  $('#btnInstalar').hidden = false;
});
$('#btnInstalar').addEventListener('click', async () => {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar = null;
  $('#btnInstalar').hidden = true;
});

// Si vuelves a la app otro día sin cerrarla, se actualiza la fecha
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#pantallaApp').hidden) {
    $('#fechaHoy').textContent = fechaLarga();
    recargar().catch(() => {});
  }
});

arrancar();
