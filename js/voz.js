// ============================================================
// VOZ
// 1. escuchar(): usa el reconocimiento de voz del navegador (gratis).
// 2. interpretarComando(): convierte lo que dijiste en una tarea.
//
// Forma recomendada de hablarle:
// "Nueva tarea, categoría Planecitos, tarea Lanzar web,
//  subtareas: uno, crear contenido; dos, subir la web; para el viernes"
// ============================================================

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconocimiento = null;

function vozDisponible() { return Boolean(Reconocedor); }

// Empieza a escuchar.
// - alTexto(texto): se llama mientras hablas, para mostrarlo en vivo.
// - alTerminar({ texto, cancelado, huboError }): se llama siempre al final.
// Es PACIENTE: si haces una pausa, sigue escuchando. Solo termina cuando
// tocas "Listo", tras 12 segundos de silencio o al llegar a 90 segundos.
const SILENCIO_MAXIMO = 12000;
const DURACION_MAXIMA = 90000;

function escuchar({ alTerminar, alEmpezar, alError, alTexto }) {
  if (!Reconocedor) {
    alError?.('Este navegador no tiene reconocimiento de voz. Usa Chrome, o escríbelo.');
    alTerminar?.({ texto: '', cancelado: false, huboError: true });
    return;
  }

  let finales = '';
  let parcial = '';
  let cancelado = false;
  let terminar = false;     // true cuando ya queremos cerrar de verdad
  let errorGrave = false;
  let silencio;
  const limite = Date.now() + DURACION_MAXIMA;

  const rec = new Reconocedor();
  rec.lang = CONFIG.IDIOMA_VOZ;
  rec.continuous = true;
  rec.interimResults = true;

  const reiniciarSilencio = () => {
    clearTimeout(silencio);
    silencio = setTimeout(() => { terminar = true; rec.stop(); }, SILENCIO_MAXIMO);
  };

  let yaEmpezo = false;
  rec.onstart = () => {
    if (!yaEmpezo) { yaEmpezo = true; alEmpezar?.(); reiniciarSilencio(); }
  };

  rec.onresult = (e) => {
    parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const trozo = e.results[i][0].transcript;
      if (e.results[i].isFinal) finales += ' ' + trozo;
      else parcial += ' ' + trozo;
    }
    alTexto?.((finales + parcial).trim());
    reiniciarSilencio();
  };

  rec.onerror = (e) => {
    // "no-speech" y "aborted" no son graves: solo hiciste silencio o cancelaste
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    errorGrave = true;
    const mensajes = {
      'not-allowed': 'Debes dar permiso al micrófono.',
      'network': 'El reconocimiento de voz falló. En Edge pasa seguido: prueba en Chrome o escríbelo.',
      'audio-capture': 'No encontré un micrófono.'
    };
    alError?.(mensajes[e.error] || 'No pude escucharte. Intenta de nuevo o escríbelo.');
  };

  rec.onend = () => {
    // Muchos celulares cortan solos en cada pausa: si no queríamos terminar, seguimos
    if (!cancelado && !terminar && !errorGrave && Date.now() < limite) {
      finales += ' ' + parcial;
      parcial = '';
      try { rec.start(); return; } catch (_) { /* si no deja reiniciar, terminamos */ }
    }
    clearTimeout(silencio);
    reconocimiento = null;
    const texto = (finales + ' ' + parcial).replace(/\s+/g, ' ').trim();
    alTerminar?.({ texto: cancelado ? '' : texto, cancelado, huboError: errorGrave });
  };

  rec._terminar = () => { terminar = true; rec.stop(); };
  rec._cancelar = () => { cancelado = true; terminar = true; rec.abort(); };
  reconocimiento = rec;
  rec.start();
}

function detenerVoz() { reconocimiento?._terminar(); }
function cancelarVoz() { reconocimiento?._cancelar(); }
function escuchandoAhora() { return reconocimiento !== null; }

// ------------------------------------------------------------
// INTERPRETAR EL TEXTO
// ------------------------------------------------------------

// Quita tildes SIN cambiar la longitud del texto, así las posiciones
// encontradas en la versión sin tildes sirven para cortar el original.
function sinTildes(t) {
  return t.normalize('NFC').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const NUMEROS = 'uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|primero|segundo|tercero|cuarto|quinto|\\d{1,2}';
const MESES_SIN_TILDE = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

function limpiar(t) {
  return t
    .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Borra un pedazo del texto reemplazándolo por espacios (mantiene posiciones)
function borrarTramo(obj, inicio, fin) {
  const relleno = ' '.repeat(fin - inicio);
  obj.original = obj.original.slice(0, inicio) + relleno + obj.original.slice(fin);
  obj.bajo = obj.bajo.slice(0, inicio) + relleno + obj.bajo.slice(fin);
}

function fechaDesdePalabra(p) {
  const hoy = hoyISO();
  if (p === 'hoy') return hoy;
  if (p === 'manana') return sumarDias(hoy, 1);
  if (p === 'pasado manana') return sumarDias(hoy, 2);

  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const idx = dias.indexOf(p);
  if (idx >= 0) {
    const hoyDia = new Date().getDay();
    let faltan = (idx - hoyDia + 7) % 7;
    if (faltan === 0) faltan = 7; // "el lunes" dicho un lunes = el próximo lunes
    return sumarDias(hoy, faltan);
  }

  // "15" o "15 de noviembre"
  const m = p.match(new RegExp(`^(\\d{1,2})(?:\\s+de\\s+(${MESES_SIN_TILDE}))?$`));
  if (m) {
    const ahora = new Date();
    const dia = Number(m[1]);
    const NUM_MES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
      agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
    const mes = m[2] ? NUM_MES[m[2]] : ahora.getMonth();
    let anio = ahora.getFullYear();
    let f = new Date(anio, mes, dia);
    if (aISO(f) < hoy) f = m[2] ? new Date(anio + 1, mes, dia) : new Date(anio, mes + 1, dia);
    return aISO(f);
  }
  return null;
}

function interpretarComando(textoOriginal, categorias) {
  const t = { original: ' ' + textoOriginal.normalize('NFC') + ' ', bajo: '' };
  t.bajo = sinTildes(t.original);

  const resultado = { titulo: '', categoriaId: null, categoriaNueva: null, subtareas: [], fecha: null, hora: null };

  // 1) FECHA: "para mañana", "para el viernes", "fecha 15 de noviembre"
  const reFecha = new RegExp(
    `\\b(?:para(?: el)?|fecha(?: el)?|el dia)\\s+(hoy|pasado manana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\\d{1,2}(?:\\s+de\\s+(?:${MESES_SIN_TILDE}))?)\\b`
  );
  const mf = t.bajo.match(reFecha);
  if (mf) {
    resultado.fecha = fechaDesdePalabra(mf[1]);
    borrarTramo(t, mf.index, mf.index + mf[0].length);
  }

  // 2) HORA: "a las 3", "a las 3 de la tarde", "a las 15:30"
  const mh = t.bajo.match(/\ba las (\d{1,2})(?::(\d{2}))?(?:\s+(?:de la|en la|de|por la)\s+(manana|tarde|noche))?\b/);
  if (mh) {
    let h = Number(mh[1]);
    const min = mh[2] || '00';
    if ((mh[3] === 'tarde' || mh[3] === 'noche') && h < 12) h += 12;
    resultado.hora = `${String(h).padStart(2, '0')}:${min}`;
    borrarTramo(t, mh.index, mh.index + mh[0].length);
  }

  // 3) Quitar la orden inicial: "oye, agrega esta nueva tarea"
  const mo = t.bajo.match(/^\s*(?:oye[\s,]*)?(?:por favor[\s,]*)?(?:agrega(?:r|me)?|anade|anadir|crea(?:r)?|pon(?:er|me)?|nueva)?\s*(?:una|esta|la)?\s*(?:nueva\s+)?tarea\b/);
  if (mo) borrarTramo(t, mo.index, mo.index + mo[0].length);

  // 4) Partir el texto por palabras clave
  const reClaves = /\b(?:en la )?(categoria|tarea|titulo|subtareas|subtarea|pasos)\b/g;
  const marcas = [...t.bajo.matchAll(reClaves)];
  const tramos = { inicio: '', categoria: '', titulo: '', subtareas: '' };

  const finPrimero = marcas.length ? marcas[0].index : t.original.length;
  tramos.inicio = t.original.slice(0, finPrimero);

  marcas.forEach((m, i) => {
    const desde = m.index + m[0].length;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].index : t.original.length;
    const contenido = t.original.slice(desde, hasta);
    const clave = m[1];
    if (clave === 'categoria') tramos.categoria += ' ' + contenido;
    else if (clave === 'tarea' || clave === 'titulo') tramos.titulo += ' ' + contenido;
    else tramos.subtareas += ' ' + contenido;
  });

  // Quita muletillas: "con las siguientes", "que diga", "llamada"
  const quitarMuletillas = (s) => limpiar(
    s.replace(/\b(con|y)\s+(las|los)\s+siguientes\b/gi, ' ')
     .replace(/\bsiguientes\b/gi, ' ')
     .replace(/^\s*[,.:]?\s*(que diga|que se llama|llamada|llamado|de nombre|:)\s+/i, ' ')
  );

  // 5) CATEGORÍA
  const buscarCategoria = (texto) => {
    const tx = sinTildes(texto);
    return categorias.find((c) => {
      const n = sinTildes(c.nombre);
      return n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(tx);
    });
  };

  const textoCat = quitarMuletillas(tramos.categoria);
  if (textoCat) {
    const encontrada = buscarCategoria(textoCat);
    if (encontrada) resultado.categoriaId = encontrada.id;
    else resultado.categoriaNueva = mayuscula(textoCat.split(/[,.;]/)[0].trim());
  }

  // 6) TÍTULO
  let titulo = quitarMuletillas(tramos.titulo);
  let inicio = quitarMuletillas(tramos.inicio);

  // Si dijiste el nombre de la categoría al principio ("…tarea, Planecitos, …")
  if (!resultado.categoriaId && !resultado.categoriaNueva && inicio) {
    const cat = buscarCategoria(inicio);
    if (cat) {
      resultado.categoriaId = cat.id;
      const reNombre = new RegExp(sinTildes(cat.nombre), 'i');
      const pos = sinTildes(inicio).search(reNombre);
      if (pos >= 0) inicio = limpiar(inicio.slice(0, pos) + ' ' + inicio.slice(pos + cat.nombre.length));
    }
  }
  if (!titulo) titulo = inicio;
  resultado.titulo = mayuscula(limpiar(titulo.replace(/^(de|para|en)\s+/i, '')));

  // 7) SUBTAREAS: "uno, crear contenido; dos, subir la web"
  const textoSub = quitarMuletillas(tramos.subtareas).replace(/^\s*:?\s*/, '');
  if (textoSub) {
    const bajoSub = ' ' + sinTildes(textoSub);
    const origSub = ' ' + textoSub;
    const reNum = new RegExp(`(?:^|[\\s,.;:])(?:(?:el|la)\\s+)?(?:numero\\s+|n\\.?\\s?)?(?:${NUMEROS})\\b[\\s,.:)\\-]*`, 'g');
    const cortes = [...bajoSub.matchAll(reNum)];
    let piezas = [];
    if (cortes.length) {
      cortes.forEach((c, i) => {
        const desde = c.index + c[0].length;
        const hasta = i + 1 < cortes.length ? cortes[i + 1].index : origSub.length;
        piezas.push(origSub.slice(desde, hasta));
      });
    } else {
      piezas = textoSub.split(/[,;]|\sy luego\s|\sy después\s|\sy despues\s|\sy\s/i);
    }
    resultado.subtareas = piezas.map((p) => mayuscula(limpiar(p))).filter(Boolean);
  }

  return resultado;
}


// ------------------------------------------------------------
// IDEAS: "añade una nueva lluvia de ideas a Planecitos que diga…"
// ------------------------------------------------------------
function esIdea(texto) {
  const t = sinTildes(texto).slice(0, 60);
  return /\b(lluvia de ideas|idea|ideas|apunte)\b/.test(t) && !/\btarea\b/.test(t.split(/idea/)[0]);
}

function interpretarIdea(textoOriginal, categorias) {
  const t = { original: ' ' + textoOriginal.normalize('NFC') + ' ', bajo: '' };
  t.bajo = sinTildes(t.original);
  const resultado = { texto: '', categoriaId: null, categoriaNueva: null };

  // 1) Quitar la orden: "oye, añade una nueva lluvia de ideas"
  const mo = t.bajo.match(/^\s*(?:oye[\s,]*)?(?:por favor[\s,]*)?(?:agrega(?:r|me)?|anade|anadir|anota(?:r|me)?|guarda(?:r|me)?|crea(?:r)?|pon(?:er|me)?|nueva)?\s*(?:una|un|esta|la)?\s*(?:nueva|nuevo)?\s*(?:lluvia de ideas|idea|ideas|apunte)\b/);
  if (mo) borrarTramo(t, mo.index, mo.index + mo[0].length);

  // 2) Buscar la categoría: "a Planecitos", "en Planecitos", "categoría Planecitos"
  let encontrada = null;
  for (const c of categorias) {
    const n = sinTildes(c.nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:\\b(?:a|en|para|de|categoria)\\s+(?:la\\s+)?(?:categoria\\s+)?)?\\b${n}\\b`);
    const m = t.bajo.match(re);
    if (m) { encontrada = c; borrarTramo(t, m.index, m.index + m[0].length); break; }
  }
  if (encontrada) resultado.categoriaId = encontrada.id;
  else {
    // "categoría Gimnasio que diga…" con una categoría que aún no existe
    const mc = t.bajo.match(/\bcategoria\s+([a-z0-9 ]+?)(?=\s+(?:que diga|que dice|dice)\b|[,.:]|$)/);
    if (mc) {
      resultado.categoriaNueva = mayuscula(limpiar(t.original.slice(mc.index + mc[0].length - mc[1].length, mc.index + mc[0].length)));
      borrarTramo(t, mc.index, mc.index + mc[0].length);
    }
  }

  // 3) El texto de la idea: lo que queda, sin "que diga"
  let texto = limpiar(t.original);
  texto = texto.replace(/^(?:[,.:]\s*)?(?:que diga|que dice|dice|diciendo|de que)\s*[,:]?\s*/i, '');
  resultado.texto = mayuscula(limpiar(texto));
  return resultado;
}
