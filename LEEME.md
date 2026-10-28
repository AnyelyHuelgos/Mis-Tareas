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
    ├── 02_recordatorio_diario.sql   → Programa el aviso de las 7 a. m. (y trae la prueba)
    ├── 03_ideas_y_recordatorios.sql → Lluvia de ideas y "recuérdame cada X días"
    ├── 04_rutinas.sql               → Rutinas que se repiten ciertos días
    └── functions/recordatorios/     → Función que envía las notificaciones
```

---

## Paso 1. Crear la base de datos (Supabase)

1. Entra a supabase.com, crea una cuenta gratis y un **proyecto nuevo**.
2. Ve a **SQL Editor → New query**, pega todo el contenido de `supabase/01_tablas.sql` y dale **Run**. Luego haz lo mismo con `supabase/03_ideas_y_recordatorios.sql` y `supabase/04_rutinas.sql`.
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

## Paso 6. Notificaciones con la app cerrada

Sin este paso, solo ves el resumen **cuando abres la app**. Con este paso te llegan:
- el resumen todos los días a las **7:00 a. m.**,
- cada rutina **a su hora** (solo los días que elegiste),
- cada tarea de hoy que tenga hora.

**6.1 Generar las llaves VAPID** (una sola vez)
1. Necesitas Node.js. Revísalo en la terminal de VS Code con `node -v`. Si da error, instálalo desde nodejs.org (versión LTS) y reinicia VS Code.
2. En la terminal escribe:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Si pregunta "Ok to proceed?", escribe `y`.
3. Te muestra una **Public Key** y una **Private Key**. Cópialas en un bloc de notas.
4. Pega la **Public Key** en `js/config.js`, en `VAPID_PUBLIC_KEY`. Haz Commit y Sync.
5. La **Private Key** NO va en el código: va en Supabase (paso 6.3).

**6.2 Crear la función en Supabase**
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nómbrala exactamente `recordatorios`.
3. Borra el código de ejemplo y pega todo `supabase/functions/recordatorios/index.ts`.
4. Toca **Deploy**.
5. Entra a la función → **Details** (o Settings) y **desactiva "Verify JWT"** / "Enforce JWT verification". Guarda.

**6.3 Guardar los secretos**
Supabase → **Edge Functions** → **Secrets** (o Project Settings → Edge Functions). Agrega uno por uno:

| Nombre | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | tu Public Key |
| `VAPID_PRIVATE_KEY` | tu Private Key |
| `VAPID_SUBJECT` | `mailto:tucorreo@gmail.com` |
| `CRON_SECRET` | una clave larga que inventes, ej. `tareas-anyely-8f3k29dk` |
| `HORA_RESUMEN` | (opcional) la hora del resumen, ej. `06:30`. Si no la pones, es `07:00` |

**6.4 Programar los avisos**
1. Supabase → **Database → Extensions**: busca y activa **pg_cron** y **pg_net**.
2. Abre `supabase/02_recordatorio_diario.sql`, cambia `TU-PROYECTO` (lo ves en tu Project URL) y `TU-CLAVE-SECRETA-CRON` (la misma de `CRON_SECRET`).
3. Pégalo en el **SQL Editor** y dale **Run**.

**6.5 Activar en el celular**
- **Android:** abre la app en **Chrome** (instalada o no, funciona igual) → toca 🔔 → **Permitir**.
- **iPhone:** primero instálala desde Safari (Compartir → Agregar a pantalla de inicio), ábrela desde el ícono → toca 🔔 → **Permitir**.

**6.6 Probar:** al final de `02_recordatorio_diario.sql` está el bloque de PRUEBA. Quítale los `--`, cambia tus datos, selecciona solo esas líneas y dale **Run**. Te debe llegar "Notificación de prueba".

**Si no llega:** en el SQL Editor corre `select * from cron.job_run_details order by start_time desc limit 5;` y en **Edge Functions → recordatorios → Logs** mira si hay errores.

Cada tarea tiene estas opciones de aviso:
- **Repetir como rutina**: elige los días (o "Lunes a sábado") y la hora. Aparece esos días en Hoy y te avisa a esa hora.
- **Avisarme**: una vez, X días antes de la fecha límite.
- **Insistirme hasta que la marque como hecha**: todos los días, cada 2, cada 3 días o cada semana.

---

## Cómo hablarle 🎙

Toca el micrófono, habla, y vuelve a tocarlo para terminar. La app llena el formulario y tú revisas y tocas **Guardar tarea**.

Frases que entiende:

- "Nueva tarea, categoría Planecitos, tarea Lanzar web, pasos: uno, crear contenido; dos, subir la web; para el viernes"
- "Agrega una tarea para mañana que diga llamar a Jaime a las 3 de la tarde"
- "Tarea parcial de cálculo, categoría Universidad, para pasado mañana"
- "Nueva tarea categoría Mi página tarea contenido de Instagram, pasos contenido del lunes y crear todo el contenido, para el 15 de noviembre"

Palabras clave: **categoría**, **tarea**, **pasos** (separados por "uno, dos, tres" o por comas; "subtareas" también sirve, pero la voz la entiende peor), **para / fecha** (hoy, mañana, pasado mañana, un día de la semana o "15 de noviembre"), **a las** (hora).

- Rutina: "Nueva tarea, categoría Universidad, tarea practicar 30 minutos de inglés, de lunes a sábado a las 7 de la noche"

Para rutinas entiende: **todos los días**, **de lunes a sábado**, **de lunes a viernes**, **entre semana**.

Si dices una categoría que no existe, la app la crea.

**Para ideas sueltas** (van a la Lluvia de ideas de la categoría, no al calendario):
- "Añade una nueva lluvia de ideas a Planecitos que diga voy a armar 50 libros, 50 cuentos y 50 imprimibles"
- "Nueva idea en Mi página: hacer un reel de mi rutina"

Tómate tu tiempo: la app espera tus pausas y solo termina cuando tocas **Listo** o tras 12 segundos de silencio.

## El blog de cada categoría

En **Categorías**, toca una para abrir su página: lluvia de ideas, próximas entregas con cuántos días faltan, tareas sin fecha y completadas. Desde una idea puedes tocar **Pasar a tarea** cuando ya sepas cuándo hacerla.

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
