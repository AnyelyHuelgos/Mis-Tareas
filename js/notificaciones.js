// ============================================================
// NOTIFICACIONES
// - activarNotificaciones(): pide permiso y guarda la "suscripción"
//   del celular en Supabase. Con eso, la Edge Function puede
//   mandarte avisos aunque la app esté cerrada.
// - resumenLocal(): al abrir la app por primera vez en el día,
//   te muestra un aviso con lo pendiente (funciona sin servidor).
// ============================================================

// Convierte la llave VAPID (texto base64) al formato que pide el navegador
function base64AUint8(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(b64);
  return Uint8Array.from([...crudo].map((c) => c.charCodeAt(0)));
}

function pushConfigurado() {
  return CONFIG.VAPID_PUBLIC_KEY && !CONFIG.VAPID_PUBLIC_KEY.startsWith('PEGA-AQUI');
}

async function activarNotificaciones() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    throw new Error('Este navegador no admite notificaciones. En iPhone, primero instala la app en la pantalla de inicio.');
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error('No diste permiso. Actívalo en los ajustes del navegador para esta página.');
  }

  const registro = await navigator.serviceWorker.ready;

  if (pushConfigurado() && 'PushManager' in window) {
    let sub = await registro.pushManager.getSubscription();
    if (!sub) {
      sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64AUint8(CONFIG.VAPID_PUBLIC_KEY)
      });
    }
    await DB.guardarSuscripcion(sub.toJSON());
  }

  await registro.showNotification('Recordatorios activados', {
    body: pushConfigurado()
      ? 'Cada mañana te llegará lo que tienes pendiente.'
      : 'Verás tu resumen al abrir la app. Configura la llave VAPID para recibir avisos con la app cerrada.',
    icon: 'icons/icon-192.png'
  });
}

// Aviso local una vez al día, al abrir la app
async function resumenLocal(tareas) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const hoy = hoyISO();
  if (localStorage.getItem('ultimoResumen') === hoy) return;

  const pendientes = tareas.filter((t) => !t.hecha && t.fecha_limite);
  const deHoy = pendientes.filter((t) => t.fecha_limite <= hoy);
  const proximas = pendientes.filter((t) => {
    const faltan = diasEntre(hoy, t.fecha_limite);
    return faltan > 0 && faltan === (t.recordar_dias_antes ?? 2);
  });
  const insistir = pendientes.concat(tareas.filter((t) => !t.hecha && !t.fecha_limite))
    .filter((t) => t.fecha_limite !== hoy && !(t.fecha_limite < hoy) && tocaInsistir(t, hoy));
  if (!deHoy.length && !proximas.length && !insistir.length) return;

  const partes = [];
  if (deHoy.length) partes.push(`Hoy: ${deHoy.map((t) => t.titulo).slice(0, 3).join(', ')}${deHoy.length > 3 ? ` y ${deHoy.length - 3} más` : ''}`);
  if (insistir.length) partes.push(`No te olvides: ${insistir.map((t) => t.fecha_limite ? `${t.titulo} (${cuentaRegresiva(t.fecha_limite).toLowerCase()})` : t.titulo).join(', ')}`);
  if (proximas.length) partes.push(`Se acerca: ${proximas.map((t) => `${t.titulo} (${etiquetaFecha(t.fecha_limite).toLowerCase()})`).join(', ')}`);

  const registro = await navigator.serviceWorker.ready;
  const titulo = deHoy.length
    ? `Tienes ${deHoy.length} pendiente${deHoy.length === 1 ? '' : 's'} para hoy`
    : 'Recordatorio de tus tareas';
  await registro.showNotification(titulo, {
    body: partes.join('. '),
    icon: 'icons/icon-192.png',
    tag: 'resumen-local'
  });
  localStorage.setItem('ultimoResumen', hoy);
}
