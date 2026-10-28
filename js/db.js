// ============================================================
// BASE DE DATOS (Supabase)
// Aquí está todo lo que lee o guarda en la nube.
// Si mañana cambias de base de datos, solo cambias este archivo.
// ============================================================

// "Recordarme": si está activo, la sesión se guarda en localStorage
// (queda abierta para siempre en el celular). Si no, en sessionStorage
// (se cierra al cerrar la app).
const almacenSesion = {
  getItem: (k) => localStorage.getItem(k) ?? sessionStorage.getItem(k),
  setItem: (k, v) => {
    const recordar = localStorage.getItem('recordarme') !== 'no';
    (recordar ? localStorage : sessionStorage).setItem(k, v);
  },
  removeItem: (k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); }
};

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { storage: almacenSesion, persistSession: true, autoRefreshToken: true }
});

// Lanza el error si Supabase devolvió uno, para atraparlo con try/catch
function revisar({ data, error }) {
  if (error) throw error;
  return data;
}

const DB = {
  // ---------- Sesión ----------
  async entrar(correo, clave, recordar) {
    localStorage.setItem('recordarme', recordar ? 'si' : 'no');
    return revisar(await sb.auth.signInWithPassword({ email: correo, password: clave }));
  },
  async salir() { await sb.auth.signOut(); },
  async usuarioActual() {
    const { data } = await sb.auth.getSession();
    return data.session?.user ?? null;
  },

  // ---------- Cargar todo ----------
  async cargarTodo() {
    const [categorias, tareas, subtareas, ideas] = await Promise.all([
      sb.from('categorias').select('*').order('creado_en'),
      sb.from('tareas').select('*').order('fecha_limite', { ascending: true, nullsFirst: false }),
      sb.from('subtareas').select('*').order('orden'),
      sb.from('ideas').select('*').order('creado_en', { ascending: false })
    ]);
    return {
      categorias: revisar(categorias),
      tareas: revisar(tareas),
      subtareas: revisar(subtareas),
      ideas: revisar(ideas)
    };
  },

  // ---------- Categorías ----------
  async crearCategoria(datos) {
    return revisar(await sb.from('categorias').insert(datos).select().single());
  },
  async editarCategoria(id, datos) {
    return revisar(await sb.from('categorias').update(datos).eq('id', id).select().single());
  },
  async eliminarCategoria(id) {
    revisar(await sb.from('categorias').delete().eq('id', id));
  },

  // ---------- Tareas ----------
  async crearTarea(datos) {
    return revisar(await sb.from('tareas').insert(datos).select().single());
  },
  async editarTarea(id, datos) {
    return revisar(await sb.from('tareas').update(datos).eq('id', id).select().single());
  },
  async eliminarTarea(id) {
    revisar(await sb.from('tareas').delete().eq('id', id));
  },

  // ---------- Subtareas ----------
  async crearSubtareas(lista) {
    if (!lista.length) return [];
    return revisar(await sb.from('subtareas').insert(lista).select());
  },
  async editarSubtarea(id, datos) {
    return revisar(await sb.from('subtareas').update(datos).eq('id', id).select().single());
  },
  async eliminarSubtareas(ids) {
    if (!ids.length) return;
    revisar(await sb.from('subtareas').delete().in('id', ids));
  },

  // ---------- Ideas ----------
  async crearIdea(datos) {
    return revisar(await sb.from('ideas').insert(datos).select().single());
  },
  async editarIdea(id, datos) {
    return revisar(await sb.from('ideas').update(datos).eq('id', id).select().single());
  },
  async eliminarIdea(id) {
    revisar(await sb.from('ideas').delete().eq('id', id));
  },

  // ---------- Notificaciones ----------
  async guardarSuscripcion(json) {
    revisar(await sb.from('push_suscripciones')
      .upsert({ endpoint: json.endpoint, suscripcion: json }, { onConflict: 'endpoint' }));
  }
};
