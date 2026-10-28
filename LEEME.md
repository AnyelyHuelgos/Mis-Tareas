# Mis Tareas — PWA personal

App de tareas por categorías con subtareas, checklist en verde, calendario,
voz y recordatorios en el celular. **Todo con planes gratuitos.**

En VS Code puedes ver este archivo bonito con `Ctrl + Shift + V`.

---

## Qué hace cada archivo

```
mis-tareas/
├── index.html            → La estructura: login, vistas, formularios
├── manifest.json         → Nombre, ícono y colores para instalarla en el celular
├── sw.js                 → Service worker: funciona sin internet y recibe notificaciones
├── css/styles.css        → Todo el diseño (colores en variables al inicio)
├── js/
│   ├── config.js         → ⚠ LO ÚNICO QUE TIENES QUE LLENAR
│   ├── fechas.js         → Ayudantes para hoy, mañana, sumar días…
│   ├── db.js             → Todo lo que habla con Supabase (leer y guardar)
│   ├── voz.js            → Escucha tu voz y la convierte en tarea
│   ├── calendario.js     → Dibuja el calendario mensual
│   ├── notificaciones.js → Pide permiso y registra tu celular para avisos
│   └── app.js            → La lógica principal: vistas, botones, formularios
├── icons/                → Íconos de la app
└── supabase/
    ├── 01_tablas.sql                → Crea las tablas y la seguridad
    ├── 02_recordatorio_diario.sql   → Programa el aviso de las 7 a. m.
    └── functions/recordatorios/     → Función que envía las notificaciones
```

---

## Paso 1. Crear la base de datos (Supabase)

1. Entra a supabase.com, crea una cuenta gratis y un **proyecto nuevo**.
2. Ve a **SQL Editor → New query**, pega todo el contenido de `supabase/01_tablas.sql` y dale **Run**.
3. Ve a **Authentication → Users → Add user → Create new user**. Pon tu correo y una contraseña. Marca **Auto Confirm User**.
4. Ve a **Authentication → Sign In / Providers** y desactiva **Allow new users to sign up**. Así nadie más puede crear cuenta.

> La primera vez que entres, la app crea sola tus categorías: Universidad, Trabajo, Planecitos, Geriani y Mi página. Puedes editarlas o borrarlas.

## Paso 2. Conectar la app

1. En Supabase ve a **Project Settings → API**.
2. Copia **Project URL** y la llave **anon public**.
3. Pégalas en `js/config.js`.

La llave `anon` es pública y es seguro ponerla ahí, porque las reglas RLS hacen que solo tú veas tus tareas. **Nunca** pongas la llave `service_role` en el frontend.

## Paso 3. Probar en el computador

1. Abre la carpeta en VS Code.
2. Instala la extensión **Live Server**.
3. Clic derecho en `index.html` → **Open with Live Server**.
4. Entra con tu correo y contraseña.

## Paso 4. Publicarla gratis (para usarla en el celular)

El celular necesita HTTPS para instalarla, la voz y las notificaciones.

**Opción fácil (Netlify):**
1. Entra a app.netlify.com/drop.
2. Arrastra la carpeta `mis-tareas` completa.
3. Te da un enlace tipo `https://algo.netlify.app`. Cámbiale el nombre en Site settings si quieres.

**Opción con GitHub** (mejor para ir actualizando): sube la carpeta a un repo y conéctalo en Netlify o Vercel. Cada `git push` la actualiza sola.

## Paso 5. Instalarla en el celular

- **Android (Chrome):** abre tu enlace → menú ⋮ → **Instalar aplicación**. También aparece el botón ⬇ arriba en la app.
- **iPhone (Safari):** abre tu enlace → botón Compartir → **Agregar a pantalla de inicio**.

Al entrar, deja marcado **Recordarme en este celular** y no tendrás que volver a poner la contraseña.

---

## Paso 6. Notificaciones con la app cerrada (opcional)

Sin este paso, igual te llega un resumen **cuando abres la app** cada día (si activaste la 🔔).
Con este paso, te llega **todos los días a las 7 a. m.** aunque no la abras.

**6.1 Generar las llaves VAPID** (en la terminal de VS Code):
```bash
npx web-push generate-vapid-keys
```
Te da una **Public Key** y una **Private Key**.
- Pega la **Public Key** en `js/config.js` (`VAPID_PUBLIC_KEY`).
- La **Private Key** NO va en el código: va en los secretos de Supabase.

**6.2 Crear la Edge Function**
1. En Supabase ve a **Edge Functions → Deploy a new function → Via Editor**.
2. Nómbrala `recordatorios` y pega el contenido de `supabase/functions/recordatorios/index.ts`.
3. En la configuración de la función, desactiva **Verify JWT** (la protegemos con nuestra propia clave).
4. Ve a **Edge Functions → Secrets** y agrega:

| Nombre | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | tu Public Key |
| `VAPID_PRIVATE_KEY` | tu Private Key |
| `VAPID_SUBJECT` | `mailto:tucorreo@gmail.com` |
| `CRON_SECRET` | una clave larga que inventes, ej. `tareas-anyely-8f3k29dk` |

**6.3 Programar el aviso diario**
1. **Database → Extensions**: activa `pg_cron` y `pg_net`.
2. Abre `supabase/02_recordatorio_diario.sql`, cambia `TU-PROYECTO` y `TU-CLAVE-SECRETA-CRON` (la misma de `CRON_SECRET`).
3. Pégalo en el SQL Editor y dale **Run**.

**6.4 Activar en el celular:** abre la app y toca 🔔. Acepta el permiso.

> En iPhone las notificaciones solo funcionan si la app está instalada en la pantalla de inicio (iOS 16.4 o más reciente).

Cada tarea tiene el campo **Avisarme** (el mismo día, 1, 2, 3 o 7 días antes). El resumen de la mañana incluye lo de hoy, lo atrasado y lo que vence según ese aviso.

---

## Cómo hablarle 🎙

Toca el micrófono, habla, y vuelve a tocarlo para terminar. La app llena el formulario y tú revisas y tocas **Guardar tarea**.

Frases que entiende:

- "Nueva tarea, categoría Planecitos, tarea Lanzar web, subtareas: uno, crear contenido; dos, subir la web; para el viernes"
- "Agrega una tarea para mañana que diga llamar a Jaime a las 3 de la tarde"
- "Tarea parcial de cálculo, categoría Universidad, para pasado mañana"
- "Nueva tarea categoría Mi página tarea contenido de Instagram, subtareas contenido del lunes y crear todo el contenido, para el 15 de noviembre"

Palabras clave: **categoría**, **tarea**, **subtareas** (separadas por "uno, dos, tres" o por comas), **para / fecha** (hoy, mañana, pasado mañana, un día de la semana o "15 de noviembre"), **a las** (hora).

Si dices una categoría que no existe, la app la crea.

> La voz funciona mejor en **Chrome de Android**. En iPhone es más limitada, sobre todo con la app instalada.

---

## Qué cuesta

| Servicio | Plan | Costo |
|---|---|---|
| Supabase (base de datos, login, función, cron) | Free | $0 |
| Netlify o Vercel (hosting con HTTPS) | Free | $0 |
| Voz (Web Speech API del navegador) | Incluida | $0 |
| Notificaciones (Web Push) | Incluida | $0 |

Ojo: Supabase pausa los proyectos gratis después de 7 días sin uso. Si la usas a diario, no pasa. Si se pausa, la reactivas con un clic desde el panel.

---

## Cuando cambies algo

Sube la versión en la primera línea de `sw.js` (`mis-tareas-v1` → `mis-tareas-v2`). Así el celular descarga los archivos nuevos en vez de usar los guardados.

## Ideas para seguir mejorándola

- Tareas que se repiten (diarias, de lunes a viernes, semanales)
- Arrastrar para reordenar tareas
- Temporizador Pomodoro dentro de cada tarea
- Resumen semanal de lo que completaste
- Hablarle de forma libre usando una IA con capa gratuita desde una Edge Function
