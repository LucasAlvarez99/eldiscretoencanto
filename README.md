# El Discreto Encanto

Sitio de la cafetería (Av. Piedrabuena 4978, CABA): carta con precios, calendario de eventos y panel de administración con publicación de historias en Instagram.

Stack: Node 22 + Express (API) y front en HTML/CSS/JS plano. Pensado para **Vercel + Supabase**.

## Correr local

```bash
npm install
ADMIN_PASSWORD=tuclave npm start   # http://localhost:3000  ·  panel en /admin
```

Sin Supabase guarda en `data/db.json`.

## Publicar en Vercel

1. Importá el repo en Vercel (framework: Other). `vercel.json` ya está listo.
2. Creá un proyecto en [Supabase](https://supabase.com) y ejecutá `docs/supabase.sql` en el SQL Editor (crea la tabla `site_data` y el bucket público `stories`).
3. En Vercel → Settings → Environment Variables:

| Variable | Para qué |
|---|---|
| `ADMIN_PASSWORD` | Clave del panel. Sin ella el panel queda cerrado. |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta (service role). Nunca en el front. |
| `SESSION_SECRET` | Opcional, string largo al azar |
| `IG_USER_ID`, `IG_ACCESS_TOKEN` | Opcionales, para historias automáticas |

4. Redeploy. En `/admin` desaparecen los avisos rojos cuando todo está conectado.

## Panel (`/admin`)

- **Carta**: editar precios (caliente/frío), descripciones, disponibilidad; agregar y borrar productos y secciones.
- **Eventos**: crear eventos (aparecen en el calendario del sitio) y generar la historia 1080×1920 con la marca.
- **Ajustes**: teléfono, WhatsApp, dirección, horarios, Maps.

## Que la base nunca se pause (UptimeRobot)

El plan gratis de Supabase pausa los proyectos sin actividad durante una semana. `GET /api/ping` hace una consulta mínima a la base (no devuelve datos) y responde `{"ok":true,...}`, o `503` si la base no contesta.

En uptimerobot.com → **Add New Monitor** → tipo **HTTP(s)**, URL `https://eldiscretoencanto.vercel.app/api/ping`, intervalo 5 minutos y alertas por email.

## Instagram

Requiere cuenta Business/Creator vinculada a una página de Facebook y una app de Meta con el permiso `instagram_content_publish`. Con un token de larga duración y el ID de la cuenta, el botón "Publicar en Instagram" sube la historia. La imagen se hospeda en el bucket `stories` de Supabase. Si no está configurado, la historia se descarga como PNG para subirla a mano.

## Marca

Colores Terracota/Brasas, Archivo + Bodoni Moda + DM Mono (sustitutas de las tipografías del manual). Las marcas son PNG con alfa recoloreados por CSS en `public/assets`.
