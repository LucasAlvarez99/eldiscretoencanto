# El Discreto Encanto — sitio + panel

Sitio de la cafetería con menú que se edita solo, calendario de eventos y generador de historias de Instagram.
Stack: Node + Express, front en HTML/CSS/JS puro. Los datos viven en `data/db.json` (se crea solo la primera vez).

## Correrlo

```bash
npm install
ADMIN_PASSWORD=tu-clave npm start
```

- Sitio: http://localhost:3000
- Panel: http://localhost:3000/admin

## Qué se edita desde el panel (/admin)

- **Menú**: precios, nombres, descripciones, agregar/sacar productos y categorías, marcar "Disponible / Agotado".
- **Eventos**: crear, editar, borrar. Aparecen solos en el calendario del sitio.
- **Historia de Instagram**: botón "📸 Historia" en cada evento → genera la imagen 1080×1920 → "Descargar" o "Publicar en Instagram".
- **Ajustes**: nombre, WhatsApp, dirección, horarios, link de Maps, Instagram.

> El menú inicial es **de ejemplo**. Reemplazalo con los productos y precios reales desde el panel.

## Publicar historias automáticamente en Instagram

Sin configurar nada, el botón "Descargar imagen" siempre funciona (la subís a mano como historia).
Para que el botón "Publicar en Instagram" funcione hace falta:

1. Que la cuenta sea **profesional** (Business o Creator) y esté vinculada a una Página de Facebook.
2. Una app en Meta for Developers con el permiso `instagram_content_publish` (en modo desarrollo funciona con tu propia cuenta; para otras cuentas requiere revisión de Meta).
3. Un token de acceso de larga duración y el `IG_USER_ID` de la cuenta.
4. El sitio publicado en una URL **https** pública (`PUBLIC_URL`), porque Instagram descarga la imagen desde ahí. En `localhost` no funciona.

Cargá `IG_USER_ID`, `IG_ACCESS_TOKEN` y `PUBLIC_URL` como variables de entorno (ver `.env.example`).
Los tokens de larga duración vencen (~60 días): hay que renovarlos.

## Seguridad básica ya incluida

- Login con cookie firmada (HttpOnly, SameSite=Strict, `Secure` bajo https) y bloqueo de 5 min tras 5 intentos fallidos.
- Todo el contenido que se muestra en el sitio se escapa (sin HTML inyectado).
- Si usás la contraseña por defecto, el panel muestra un aviso y el servidor lo advierte en consola.

## Estructura

```
server.js        API + login + publicación en Instagram
seed.js          menú y ajustes iniciales (de ejemplo)
data/db.json     datos (se genera solo)
public/          sitio (index.html), panel (admin.html), css, js, assets
public/stories/  imágenes de historias generadas
```

## Próximos pasos sugeridos

- Tipografía y logos definitivos (hoy: Fraunces + DM Sans, y el logo del detective).
- Fotos reales por producto y galería.
- Deploy en Render/Railway/Fly (necesita disco persistente para `data/` o pasar los datos a una base como Supabase).
