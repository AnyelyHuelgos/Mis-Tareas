// ============================================================
// SERVICE WORKER
// 1. Guarda los archivos de la app para que abra rápido y sin internet.
// 2. Recibe las notificaciones push y las muestra en el celular.
// Cada vez que cambies archivos, sube la versión (v1 -> v2) para que se actualice.
// ============================================================
const CACHE = 'mis-tareas-v1';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/fechas.js',
  './js/db.js',
  './js/voz.js',
  './js/calendario.js',
  './js/notificaciones.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((llaves) =>
      Promise.all(llaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Las peticiones a Supabase (datos) siempre van a internet, nunca a la caché.
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return;

  e.respondWith(
    caches.match(e.request).then((guardado) => {
      const deRed = fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => guardado || caches.match('./index.html'));
      return guardado || deRed;
    })
  );
});

// ---------- Notificaciones push ----------
self.addEventListener('push', (e) => {
  let datos = { titulo: 'Mis Tareas', cuerpo: 'Tienes tareas pendientes.' };
  try { datos = e.data.json(); } catch (_) { if (e.data) datos.cuerpo = e.data.text(); }

  e.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: datos.tag || 'resumen',
      data: { url: './index.html' }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) if ('focus' in v) return v.focus();
      return self.clients.openWindow(e.notification.data.url);
    })
  );
});
