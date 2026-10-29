// ============================================================
// APP PRINCIPAL
// Flujo: revisar sesión → cargar datos → pintar la vista activa.
// Cada vez que algo cambia, actualizamos "estado" y llamamos render().
// ============================================================

const estado = {
  categorias: [],
  tareas: [],
  subtareas: [],
  ideas: [],
  alarmas: [],
  vista: 'hoy',              // hoy | semana | calendario | categorias | categoria
  categoriaAbierta: null,    // id de la categoría que estás viendo como "blog"
  filtroCategoria: null,     // id de categoría o null = todas
  diaSeleccionado: hoyISO(),
  mes: { anio: new Date().getFullYear(), mes: new Date().getMonth() }
};

// Lila, rosado, oliva, café, beige oscuro, ciruela, salvia, rosa viejo, lavanda, terracota suave
const COLORES = ['#9C83C9', '#D9839B', '#6F7D3C', '#8A5A44', '#C29A72',
  '#7B4F78', '#8FA27A', '#B5727F', '#B7A6DB', '#C47A5A'];

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

// Rutina = tarea que se repite ciertos días (ej. inglés de lunes a sábado)
function esRutina(t) { return Array.isArray(t.repetir_dias) && t.repetir_dias.length > 0; }
function rutinaToca(t, fechaISO) { return esRutina(t) && t.repetir_dias.includes(desdeISO(fechaISO).getDay()); }
function sinRutinas(lista) { return lista.filter((t) => !esRutina(t)); }

const NOMBRES_DIAS = ['D', 'L', 'M', 'Mi', 'J', 'V', 'S'];
function textoDias(dias) {
  const orden = [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).join(',');
  if (orden === '1,2,3,4,5,6,0') return 'Todos los días';
  if (orden === '1,2,3,4,5,6') return 'Lunes a sábado';
  if (orden === '1,2,3,4,5') return 'Lunes a viernes';
  return orden.split(',').map((d) => NOMBRES_DIAS[d]).join(', ');
}

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
  // En las rutinas, "hecha" significa "hecha HOY"
  const hoy = hoyISO();
  datos.tareas.forEach((t) => { if (esRutina(t)) t.hecha = t.ultima_completada === hoy; });
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
  const vistaMenu = estado.vista === 'categoria' ? 'categorias' : estado.vista;
  document.querySelectorAll('.barra-inferior [data-vista]').forEach((b) =>
    b.classList.toggle('activa', b.dataset.vista === vistaMenu));

  const vistas = { hoy: vistaHoy, semana: vistaSemana, calendario: vistaCalendario, categorias: vistaCategorias, categoria: vistaCategoria };
  contenido.innerHTML = vistas[estado.vista]();
}

function renderChips() {
  const activa = estado.vista === 'categoria' ? estado.categoriaAbierta : estado.filtroCategoria;
  const chips = [`<button class="chip ${!activa ? 'activo' : ''}" data-accion="filtrar" data-id="">Todas</button>`];
  estado.categorias.forEach((c) => {
    chips.push(`<button class="chip ${activa === c.id ? 'activo' : ''}" style="--c:${c.color}" data-accion="filtrar" data-id="${c.id}">
      <span class="nombre">${esc(c.nombre)}</span></button>`);
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
  if (t.fecha_limite) meta.push(`<span class="${vencida ? 'vencida' : ''}">${etiquetaFecha(t.fecha_limite)}${!t.hecha ? ` (${cuentaRegresiva(t.fecha_limite).toLowerCase()})` : ''}</span>`);
  if (esRutina(t)) meta.push(`<span>↻ ${textoDias(t.repetir_dias)}${t.hora ? ` a las ${horaBonita(t.hora)}` : ''}</span>`);
  else if (t.hora) meta.push(`<span>${horaBonita(t.hora)}</span>`);
  if (t.recordar_cada && !t.hecha) meta.push(`<span>↻ ${t.recordar_cada === 1 ? 'Te recuerdo a diario' : `Te recuerdo cada ${t.recordar_cada} días`}</span>`);
  if (t.prioridad === 'alta' && !t.hecha) meta.push('<span class="prioridad-alta">Prioridad alta</span>');
  if (subs.length) meta.push(`<span>${hechas} de ${subs.length} pasos</span>`);

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

// ---------- Alarmas ----------
function alarmasFiltradas() {
  const cat = categoriaActual();
  return cat ? estado.alarmas.filter((a) => a.categoria_id === cat) : estado.alarmas;
}
function textoAviso(min) {
  if (!min) return 'Te aviso a la hora';
  if (min === 1440) return 'Te aviso 1 día antes';
  if (min >= 60) return `Te aviso ${min / 60} hora${min === 60 ? '' : 's'} antes`;
  return `Te aviso ${min} min antes`;
}
function alarmaPasada(a) {
  const ahora = new Date();
  const [h, m] = a.hora.slice(0, 5).split(':').map(Number);
  const f = desdeISO(a.fecha);
  f.setHours(h, m, 0, 0);
  return f < ahora;
}
function htmlAlarma(a) {
  const cat = categoriaPorId(a.categoria_id);
  const pasada = alarmaPasada(a);
  return `
    <article class="alarma ${pasada ? 'pasada' : ''}" style="--color-cat:${cat?.color || '#8A93AB'}" data-accion="editar-alarma" data-id="${a.id}">
      <div class="alarma-hora">${horaBonita(a.hora)}</div>
      <div class="alarma-cuerpo">
        <div class="tarea-titulo">${esc(a.titulo)}</div>
        <div class="tarea-meta">
          ${cat && !categoriaActual() ? `<span class="etiqueta-cat">${esc(cat.nombre)}</span>` : ''}
          ${a.fecha !== hoyISO() ? `<span>${etiquetaFecha(a.fecha)}</span>` : ''}
          <span>${pasada ? 'Ya pasó' : '⏰ ' + textoAviso(a.avisar_min_antes)}</span>
        </div>
      </div>
    </article>`;
}
function htmlAlarmas(lista) {
  return [...lista].sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? -1 : 1)).map(htmlAlarma).join('');
}

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
// Solo lo de hoy: lo que vence hoy, lo atrasado y lo que hoy toca recordarte.
function vistaHoy() {
  const hoy = hoyISO();
  const lista = tareasFiltradas();
  const deHoy = sinRutinas(lista).filter((t) => t.fecha_limite === hoy);
  const vencidas = sinRutinas(lista).filter((t) => !t.hecha && t.fecha_limite && t.fecha_limite < hoy);
  const yaListadas = new Set([...deHoy, ...vencidas].map((t) => t.id));
  const recordatorios = lista.filter((t) => !yaListadas.has(t.id) && tocaInsistir(t, hoy));
  const rutinas = lista.filter((t) => rutinaToca(t, hoy));

  const alarmasHoy = alarmasFiltradas().filter((a) => a.fecha === hoy);

  let html = htmlProgreso([...deHoy, ...rutinas], 'hechas hoy');
  html += `<h2 class="titulo-seccion">Alarmas de hoy <button class="btn suave chico" data-accion="nueva-alarma">+ Alarma</button></h2>`;
  html += alarmasHoy.length ? htmlAlarmas(alarmasHoy) : '<p class="rutinas-dia">Sin alarmas para hoy.</p>';
  if (rutinas.length) html += `<h2 class="titulo-seccion">Rutinas de hoy <small>${rutinas.filter((t) => t.hecha).length} de ${rutinas.length}</small></h2>${htmlLista(rutinas)}`;
  html += `<h2 class="titulo-seccion">Para hoy <small>${deHoy.length}</small></h2>`;
  html += deHoy.length ? htmlLista(deHoy) : htmlVacio(rutinas.length ? 'Fuera de tus rutinas, no tienes nada más para hoy.' : 'No tienes nada para hoy.');
  if (vencidas.length) html += `<h2 class="titulo-seccion">Atrasadas <small>${vencidas.length}</small></h2>${htmlLista(vencidas)}`;
  if (recordatorios.length) html += `<h2 class="titulo-seccion">No te olvides <small>${recordatorios.length}</small></h2>${htmlLista(recordatorios)}`;
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
    const rutinasDia = lista.filter((t) => rutinaToca(t, dia));
    html += `<h2 class="titulo-seccion">${etiquetaFecha(dia)} <small>${delDia.length ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'}` : 'Libre'}</small></h2>`;
    if (rutinasDia.length) html += `<p class="rutinas-dia">Rutinas: ${rutinasDia.map((t) => esc(t.titulo)).join(', ')}</p>`;
    html += htmlAlarmas(alarmasFiltradas().filter((a) => a.fecha === dia));
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
    + htmlAlarmas(alarmasFiltradas().filter((a) => a.fecha === estado.diaSeleccionado))
    + (delDia.length ? htmlLista(delDia) : htmlVacio('Nada este día.'));
}

// ---------- Vista: CATEGORÍAS (lista) ----------
function vistaCategorias() {
  let html = `<h2 class="titulo-seccion">Tus categorías
    <button class="btn suave" data-accion="nueva-categoria">+ Nueva categoría</button></h2>`;
  if (!estado.categorias.length) return html + htmlVacio('Crea tu primera categoría para empezar.', false);

  const hoy = hoyISO();
  estado.categorias.forEach((c) => {
    const delaCat = sinRutinas(estado.tareas).filter((t) => t.categoria_id === c.id);
    const pendientes = delaCat.filter((t) => !t.hecha);
    const hechas = delaCat.length - pendientes.length;
    const ideas = estado.ideas.filter((i) => i.categoria_id === c.id && !i.convertida).length;
    const proxima = pendientes.filter((t) => t.fecha_limite).sort((a, b) => a.fecha_limite < b.fecha_limite ? -1 : 1)[0];
    const pct = delaCat.length ? Math.round((hechas / delaCat.length) * 100) : 0;
    html += `
      <button class="cat-tarjeta cat-boton" style="--color-cat:${c.color}" data-accion="abrir-categoria" data-id="${c.id}">
        <div class="cat-cabeza">
          <h3>${esc(c.nombre)}</h3>
          <span class="flecha" aria-hidden="true">›</span>
        </div>
        <p class="cat-resumen">${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}, ${ideas} idea${ideas === 1 ? '' : 's'}</p>
        ${proxima ? `<p class="cat-proxima ${proxima.fecha_limite < hoy ? 'vencida' : ''}">Próxima: ${esc(proxima.titulo)} (${cuentaRegresiva(proxima.fecha_limite).toLowerCase()})</p>` : ''}
        <div class="barra"><div class="barra-relleno" style="width:${pct}%"></div></div>
      </button>`;
  });
  return html;
}

// ---------- Vista: UNA CATEGORÍA (su "blog") ----------
function htmlIdea(i) {
  return `
    <article class="idea ${i.convertida ? 'convertida' : ''}">
      <p class="idea-texto">${esc(i.texto)}</p>
      <div class="idea-pie">
        <span>${i.convertida ? 'Ya es tarea' : etiquetaFecha(aISO(new Date(i.creado_en)))}</span>
        <span class="espacio"></span>
        ${i.convertida ? '' : `<button class="mini" data-accion="idea-a-tarea" data-id="${i.id}">Pasar a tarea</button>`}
        <button class="mini" data-accion="editar-idea" data-id="${i.id}">Editar</button>
      </div>
    </article>`;
}

function vistaCategoria() {
  const c = categoriaPorId(estado.categoriaAbierta);
  if (!c) { estado.vista = 'categorias'; return vistaCategorias(); }

  const rutinasCat = estado.tareas.filter((t) => t.categoria_id === c.id && esRutina(t));
  const delaCat = sinRutinas(estado.tareas).filter((t) => t.categoria_id === c.id);
  const pendientes = delaCat.filter((t) => !t.hecha);
  const conFecha = pendientes.filter((t) => t.fecha_limite);
  const sinFecha = pendientes.filter((t) => !t.fecha_limite);
  const hechas = delaCat.filter((t) => t.hecha);
  const ideas = estado.ideas.filter((i) => i.categoria_id === c.id);
  const ideasActivas = ideas.filter((i) => !i.convertida);
  const pct = delaCat.length ? Math.round((hechas.length / delaCat.length) * 100) : 0;

  return `
    <button class="volver" data-accion="volver-categorias">‹ Categorías</button>
    <section class="blog-portada" style="--color-cat:${c.color}">
      <h2>${esc(c.nombre)}</h2>
      <p>${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}, ${hechas.length} hecha${hechas.length === 1 ? '' : 's'}, ${ideasActivas.length} idea${ideasActivas.length === 1 ? '' : 's'}</p>
      <div class="barra"><div class="barra-relleno" style="width:${pct}%"></div></div>
      <div class="blog-botones">
        <button class="btn primario" data-accion="nueva-tarea" data-categoria="${c.id}">+ Tarea</button>
        <button class="btn suave" data-accion="editar-categoria" data-id="${c.id}">Editar categoría</button>
      </div>
    </section>

    <h2 class="titulo-seccion">Lluvia de ideas <small>${ideasActivas.length}</small></h2>
    <form class="idea-rapida" data-form="idea-rapida" data-categoria="${c.id}">
      <input type="text" name="texto" placeholder="Anota una idea suelta…" maxlength="500" aria-label="Nueva idea">
      <button class="btn rosa" type="submit">Guardar</button>
    </form>
    <div class="ideas">${ideas.length ? ideas.map(htmlIdea).join('') : '<p class="vacio">Aquí van tus ideas sueltas. También puedes dictarlas con el micrófono.</p>'}</div>

    <h2 class="titulo-seccion">Próximas alarmas <button class="btn suave chico" data-accion="nueva-alarma" data-categoria="${c.id}">+ Alarma</button></h2>
    ${(() => { const al = estado.alarmas.filter((a) => a.categoria_id === c.id && !alarmaPasada(a)); return al.length ? htmlAlarmas(al) : '<p class="rutinas-dia">Sin alarmas próximas.</p>'; })()}

    ${rutinasCat.length ? `<h2 class="titulo-seccion">Rutinas <small>${rutinasCat.length}</small></h2>${htmlLista(rutinasCat)}` : ''}

    <h2 class="titulo-seccion">Próximas entregas <small>${conFecha.length}</small></h2>
    ${conFecha.length ? htmlLista(conFecha) : '<p class="vacio">Sin entregas con fecha.</p>'}

    ${sinFecha.length ? `<h2 class="titulo-seccion">Sin fecha <small>${sinFecha.length}</small></h2>${htmlLista(sinFecha)}` : ''}
    ${hechas.length ? `<h2 class="titulo-seccion">Completadas <small>${hechas.length}</small></h2>${htmlLista(hechas)}` : ''}
  `;
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
      if (estado.vista === 'categoria' || estado.vista === 'categorias') {
        if (id) { estado.vista = 'categoria'; estado.categoriaAbierta = id; }
        else estado.vista = 'categorias';
      } else {
        estado.filtroCategoria = id || null;
      }
      render();
      window.scrollTo(0, 0);
      break;
    case 'volver-categorias':
      estado.vista = 'categorias';
      render();
      break;
    case 'nueva-alarma':
      abrirAlarma(null, { categoria_id: el.dataset.categoria || categoriaActual() });
      break;
    case 'editar-alarma':
      abrirAlarma(estado.alarmas.find((a) => a.id === id));
      break;
    case 'editar-idea':
      abrirIdea(estado.ideas.find((i) => i.id === id));
      break;
    case 'idea-a-tarea': {
      const idea = estado.ideas.find((i) => i.id === id);
      abrirTarea(null, { titulo: idea.texto.slice(0, 140), categoria_id: idea.categoria_id, ideaId: idea.id });
      break;
    }
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
      estado.vista = 'categoria';
      estado.categoriaAbierta = id;
      render();
      window.scrollTo(0, 0);
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

function categoriaActual() {
  return estado.vista === 'categoria' ? estado.categoriaAbierta : estado.filtroCategoria;
}
$('#btnNuevaTarea').addEventListener('click', () => abrirTarea(null, { categoria_id: categoriaActual() }));

// Guardar idea rápida desde el "blog" de la categoría
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form="idea-rapida"]');
  if (!form) return;
  e.preventDefault();
  const texto = form.texto.value.trim();
  if (!texto) return;
  try {
    await DB.crearIdea({ categoria_id: form.dataset.categoria, texto });
    toast('Idea guardada');
    await recargar();
  } catch (err) {
    toast('No se pudo guardar la idea.');
  }
});

// ---------- Marcar como hecha ----------
async function marcarTarea(id, hecha) {
  const t = estado.tareas.find((x) => x.id === id);
  if (esRutina(t)) return marcarRutina(t, hecha);
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

// Las rutinas se marcan "hechas hoy": mañana vuelven a salir pendientes
async function marcarRutina(t, hecha) {
  const antes = { hecha: t.hecha, fecha: t.ultima_completada };
  t.hecha = hecha;
  t.ultima_completada = hecha ? hoyISO() : null;
  render();
  if (hecha) toast('¡Rutina de hoy cumplida!');
  try {
    await DB.editarTarea(t.id, { ultima_completada: t.ultima_completada });
  } catch (err) {
    t.hecha = antes.hecha;
    t.ultima_completada = antes.fecha;
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
    if (t.hecha !== antes.tarea) {
      if (esRutina(t)) await DB.editarTarea(t.id, { ultima_completada: t.hecha ? hoyISO() : null });
      else await DB.editarTarea(t.id, { hecha: t.hecha });
    }
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
let ideaOrigen = null; // si la tarea viene de "Pasar a tarea"

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
  ideaOrigen = prellenado.ideaId || null;
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
  $('#tRecordarCada').value = String(datos.recordar_cada ?? 0);
  marcarDias(datos.repetir_dias || []);
  $('#tNotas').value = datos.notas || '';

  const lista = $('#listaSubEditor');
  lista.innerHTML = '';
  const subs = tarea ? subtareasDe(tarea.id) : (prellenado.subtareas || []).map((titulo) => ({ titulo, id: '' }));
  subs.forEach((s) => lista.appendChild(filaSubtarea(s.titulo, s.id)));

  $('#btnEliminarTarea').hidden = !tarea;
  dlgTarea.showModal();
  if (!datos.titulo) setTimeout(() => $('#tTitulo').focus(), 50);
}

function marcarDias(dias) {
  document.querySelectorAll('#tDias input').forEach((c) => { c.checked = dias.includes(Number(c.value)); });
}
function diasElegidos() {
  return [...document.querySelectorAll('#tDias input:checked')].map((c) => Number(c.value));
}
document.querySelectorAll('.atajos-dias button').forEach((b) =>
  b.addEventListener('click', () => marcarDias(b.dataset.dias ? b.dataset.dias.split(',').map(Number) : [])));

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
    recordar_cada: Number($('#tRecordarCada').value),
    repetir_dias: diasElegidos(),
    notas: $('#tNotas').value.trim() || null
  };
  if (!datos.titulo) return;
  if (datos.repetir_dias.length && !datos.hora) {
    toast('Pon una hora para que te avise ese día.');
    $('#tHora').focus();
    return;
  }

  // Leer las subtareas del formulario
  const filas = [...$('#listaSubEditor').querySelectorAll('input')]
    .map((inp, i) => ({ id: inp.dataset.id, titulo: inp.value.trim(), orden: i }))
    .filter((f) => f.titulo);

  try {
    if (!tareaEditando) {
      const nueva = await DB.crearTarea(datos);
      await DB.crearSubtareas(filas.map((f) => ({ tarea_id: nueva.id, titulo: f.titulo, orden: f.orden })));
      if (ideaOrigen) await DB.editarIdea(ideaOrigen, { convertida: true });
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
  const ni = estado.ideas.filter((i) => i.categoria_id === categoriaEditando.id).length;
  if (!confirm(`¿Eliminar "${categoriaEditando.nombre}"?${n || ni ? ` También se borrarán sus ${n} tareas y ${ni} ideas.` : ''}`)) return;
  try {
    await DB.eliminarCategoria(categoriaEditando.id);
    if (estado.filtroCategoria === categoriaEditando.id) estado.filtroCategoria = null;
    if (estado.categoriaAbierta === categoriaEditando.id) estado.vista = 'categorias';
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
function cerrarEscucha() {
  $('#escuchando').hidden = true;
  $('#btnVoz').classList.remove('activo');
}

$('#btnVoz').addEventListener('click', () => {
  if (escuchandoAhora()) { detenerVoz(); return; }
  $('#textoVivo').textContent = 'Habla ahora';
  escuchar({
    alEmpezar: () => {
      $('#escuchando').hidden = false;
      $('#btnVoz').classList.add('activo');
    },
    alTexto: (texto) => { $('#textoVivo').textContent = texto; },
    alError: (mensaje) => toast(mensaje),
    alTerminar: ({ texto, cancelado, huboError }) => {
      cerrarEscucha();
      if (cancelado) return;
      if (texto) procesarVoz(texto);
      else if (!huboError) toast('No te escuché. Intenta de nuevo o escríbelo.');
      if (huboError && !texto) abrirEscribir();
    }
  });
});

$('#btnListoVoz').addEventListener('click', () => detenerVoz());
$('#btnCancelarVoz').addEventListener('click', () => { cancelarVoz(); cerrarEscucha(); });
$('#btnEscribirEnVez').addEventListener('click', () => { cancelarVoz(); cerrarEscucha(); abrirEscribir(); });

// Escribir la tarea como si la dijeras (usa el mismo intérprete que la voz)
function abrirEscribir() {
  $('#eTexto').value = '';
  $('#dlgEscribir').showModal();
  setTimeout(() => $('#eTexto').focus(), 50);
}
$('#formEscribir').addEventListener('submit', (e) => {
  e.preventDefault();
  const texto = $('#eTexto').value.trim();
  if (!texto) return;
  $('#dlgEscribir').close();
  procesarVoz(texto);
});

// Crea la categoría si la nombraste y no existe; devuelve su id
async function asegurarCategoria(idEncontrada, nombreNuevo) {
  if (idEncontrada || !nombreNuevo) return idEncontrada;
  try {
    const nueva = await DB.crearCategoria({ nombre: nombreNuevo, color: COLORES[estado.categorias.length % COLORES.length] });
    await recargar();
    toast(`Creé la categoría "${nueva.nombre}"`);
    return nueva.id;
  } catch (err) {
    toast('No pude crear la categoría.');
    return null;
  }
}

async function procesarVoz(texto) {
  if (esAlarma(texto)) {
    const r = interpretarAlarma(texto, estado.categorias);
    abrirAlarma(null, {
      titulo: r.titulo, categoria_id: r.categoriaId || categoriaActual(),
      fecha: r.fecha, hora: r.hora, avisar_min_antes: r.avisarMin
    }, texto);
    return;
  }
  if (esIdea(texto)) {
    const r = interpretarIdea(texto, estado.categorias);
    const categoriaId = await asegurarCategoria(r.categoriaId, r.categoriaNueva);
    abrirIdea(null, { texto: r.texto, categoria_id: categoriaId || categoriaActual() }, texto);
    return;
  }
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
    categoria_id: categoriaId || categoriaActual(),
    fecha_limite: r.fecha,
    hora: r.hora,
    repetir_dias: r.repetirDias,
    subtareas: r.subtareas
  }, texto);
}

// ============================================================
// DIÁLOGO DE ALARMA
// ============================================================
const dlgAlarma = $('#dlgAlarma');
let alarmaEditando = null;

function abrirAlarma(alarma, prellenado = {}, transcripcion = '') {
  if (!estado.categorias.length) { toast('Primero crea una categoría.'); abrirCategoria(null); return; }
  alarmaEditando = alarma || null;
  const d = alarma || prellenado;
  $('#dlgAlarmaTitulo').textContent = alarma ? 'Editar alarma' : 'Nueva alarma';
  $('#transcripcionAlarma').hidden = !transcripcion;
  $('#transcripcionAlarma').textContent = transcripcion ? `Escuché: "${transcripcion}"` : '';
  $('#aCategoria').innerHTML = estado.categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  $('#aCategoria').value = d.categoria_id || estado.categorias[0].id;
  $('#aTitulo').value = d.titulo || '';
  $('#aFecha').value = d.fecha || hoyISO();
  $('#aHora').value = d.hora ? d.hora.slice(0, 5) : '';
  const opcion = String(d.avisar_min_antes ?? 10);
  if (![...$('#aAvisar').options].some((o) => o.value === opcion)) {
    $('#aAvisar').insertAdjacentHTML('beforeend', `<option value="${opcion}">${opcion} minutos antes</option>`);
  }
  $('#aAvisar').value = opcion;
  $('#btnEliminarAlarma').hidden = !alarma;
  dlgAlarma.showModal();
}

$('#formAlarma').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    titulo: $('#aTitulo').value.trim(),
    categoria_id: $('#aCategoria').value,
    fecha: $('#aFecha').value,
    hora: $('#aHora').value,
    avisar_min_antes: Number($('#aAvisar').value),
    avisada: false // si la cambias, vuelve a avisar
  };
  if (!datos.titulo || !datos.fecha || !datos.hora) return;
  try {
    if (alarmaEditando) await DB.editarAlarma(alarmaEditando.id, datos);
    else await DB.crearAlarma(datos);
    dlgAlarma.close();
    toast(alarmaEditando ? 'Alarma actualizada' : `Alarma lista: ${textoAviso(datos.avisar_min_antes).toLowerCase()}`);
    await recargar();
  } catch (err) {
    toast('No se pudo guardar la alarma.');
  }
});

$('#btnEliminarAlarma').addEventListener('click', async () => {
  if (!alarmaEditando || !confirm('¿Eliminar esta alarma?')) return;
  try {
    await DB.eliminarAlarma(alarmaEditando.id);
    dlgAlarma.close();
    toast('Alarma eliminada');
    await recargar();
  } catch (err) {
    toast('No se pudo eliminar.');
  }
});

// ============================================================
// DIÁLOGO DE IDEA
// ============================================================
const dlgIdea = $('#dlgIdea');
let ideaEditando = null;

function abrirIdea(idea, prellenado = {}, transcripcion = '') {
  if (!estado.categorias.length) { toast('Primero crea una categoría.'); abrirCategoria(null); return; }
  ideaEditando = idea || null;
  const datos = idea || prellenado;
  $('#dlgIdeaTitulo').textContent = idea ? 'Editar idea' : 'Nueva idea';
  $('#transcripcionIdea').hidden = !transcripcion;
  $('#transcripcionIdea').textContent = transcripcion ? `Escuché: "${transcripcion}"` : '';
  $('#iCategoria').innerHTML = estado.categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
  $('#iCategoria').value = datos.categoria_id || categoriaActual() || estado.categorias[0].id;
  $('#iTexto').value = datos.texto || '';
  $('#btnEliminarIdea').hidden = !idea;
  dlgIdea.showModal();
}

$('#formIdea').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = { categoria_id: $('#iCategoria').value, texto: $('#iTexto').value.trim() };
  if (!datos.texto) return;
  try {
    if (ideaEditando) await DB.editarIdea(ideaEditando.id, datos);
    else await DB.crearIdea(datos);
    dlgIdea.close();
    toast(ideaEditando ? 'Idea actualizada' : 'Idea guardada');
    await recargar();
  } catch (err) {
    toast('No se pudo guardar la idea.');
  }
});

$('#btnEliminarIdea').addEventListener('click', async () => {
  if (!ideaEditando || !confirm('¿Eliminar esta idea?')) return;
  try {
    await DB.eliminarIdea(ideaEditando.id);
    dlgIdea.close();
    toast('Idea eliminada');
    await recargar();
  } catch (err) {
    toast('No se pudo eliminar.');
  }
});

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
const yaInstalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Mostramos el botón siempre que no esté instalada; si el navegador no ofrece
// la instalación directa, explicamos cómo hacerlo a mano.
$('#btnInstalar').hidden = yaInstalada;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
});
window.addEventListener('appinstalled', () => { $('#btnInstalar').hidden = true; });

$('#btnInstalar').addEventListener('click', async () => {
  if (eventoInstalar) {
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
    return;
  }
  const ua = navigator.userAgent;
  const esIphone = /iPhone|iPad|iPod/i.test(ua);
  const esAndroid = /Android/i.test(ua);
  const enChrome = /Chrome/i.test(ua) && !/EdgA|OPR|SamsungBrowser|Instagram|FBAN|FBAV/i.test(ua);
  let pasos;
  if (esIphone) {
    pasos = `<ol>
      <li>Abre esta página en <b>Safari</b> (no desde Instagram, WhatsApp ni otro navegador).</li>
      <li>Toca el botón <b>Compartir</b> (el cuadrito con la flecha hacia arriba).</li>
      <li>Baja y toca <b>Agregar a pantalla de inicio</b>.</li>
      <li>Toca <b>Agregar</b>. Abre la app desde el ícono nuevo.</li></ol>`;
  } else if (esAndroid && !enChrome) {
    pasos = `<ol>
      <li>Copia el enlace de esta página.</li>
      <li>Ábrelo en <b>Google Chrome</b>. Si lo abriste desde WhatsApp o Instagram, toca los tres puntos y elige "Abrir en Chrome".</li>
      <li>Toca el menú <b>⋮</b> y elige <b>Instalar aplicación</b> o <b>Agregar a la pantalla principal</b>.</li></ol>`;
  } else if (esAndroid) {
    pasos = `<ol>
      <li>Toca el menú <b>⋮</b> arriba a la derecha de Chrome.</li>
      <li>Elige <b>Instalar aplicación</b> o <b>Agregar a la pantalla principal</b>.</li>
      <li>Confirma. Abre la app desde el ícono nuevo.</li></ol>
      <p>Si no ves la opción, recarga la página una vez y vuelve a intentar.</p>`;
  } else {
    pasos = `<p>En el computador, busca el ícono de instalar en la barra de direcciones del navegador, o abre el menú y elige <b>Instalar Mis Tareas</b>.</p>`;
  }
  $('#instruccionesInstalar').innerHTML = pasos;
  $('#dlgInstalar').showModal();
});

// Si vuelves a la app otro día sin cerrarla, se actualiza la fecha
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#pantallaApp').hidden) {
    $('#fechaHoy').textContent = fechaLarga();
    recargar().catch(() => {});
  }
});

arrancar();
