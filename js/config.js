// ============================================================
// CONFIGURACIÓN — Lo único que tienes que llenar tú.
// Estos datos están en Supabase → Project Settings → API.
// La "anon key" es pública: es seguro ponerla aquí porque
// las reglas RLS de la base de datos protegen tus tareas.
// ¡NUNCA pongas aquí la "service_role key"!
// ============================================================
const CONFIG = {
  SUPABASE_URL: 'https://bcuxxjyrixxqubswivbx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjdXh4anlyaXh4cXVic3dpdmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNDU5MzksImV4cCI6MjEwODcyMTkzOX0.Fx8jniAWXAj5JWxmQt6HH6zVNuEGGv98Boi-RSVcghg  ',

  // Llave PÚBLICA de notificaciones (paso 6 del LEEME).
  // Si la dejas así, la app funciona igual, pero sin notificaciones push.
  VAPID_PUBLIC_KEY: 'PEGA-AQUI-TU-VAPID-PUBLIC-KEY',

  // Idioma del reconocimiento de voz
  IDIOMA_VOZ: 'es-CO'
};
