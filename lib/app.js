'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

// ---------- Configuración (variables de entorno) ----------
const ENV_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD = ENV_PASSWORD || 'cambiame';
// En producción (Vercel) sin contraseña propia el panel queda cerrado: la de por defecto es pública.
const LOGIN_DISABLED = store.onVercel && !ENV_PASSWORD;
const SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('discreto:' + ADMIN_PASSWORD).digest('hex');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const IG_USER_ID = process.env.IG_USER_ID || '';
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const GRAPH = 'https://graph.facebook.com/v21.0';

// ---------- Validaciones ----------
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const money = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const moneyOrNull = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : money(v));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00'));
const isTime = (v) => v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => res.status(500).json({ error: e.message }));

// ---------- Sesión de admin (cookie firmada, sin estado: sirve en serverless) ----------
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
function makeToken() {
  const exp = String(Date.now() + 12 * 60 * 60 * 1000);
  return exp + '.' + sign(exp);
}
function validToken(t) {
  if (!t || !t.includes('.')) return false;
  const [exp, sig] = t.split('.');
  const good = sign(exp);
  if (sig.length !== good.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const isAdmin = (req) => !LOGIN_DISABLED && validToken(cookies(req).de_admin);
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'No autorizado' });
}
function passwordOk(input) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const attempts = new Map(); // ip -> { n, until }  (por instancia: freno básico)

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.post('/api/login', (req, res) => {
  if (LOGIN_DISABLED) return res.status(503).json({ error: 'El panel está cerrado: definí ADMIN_PASSWORD en Vercel.' });
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Demasiados intentos. Probá en unos minutos.' });
  if (!passwordOk(req.body && req.body.password)) {
    a.n += 1;
    if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
    attempts.set(ip, a);
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  attempts.delete(ip);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `de_admin=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'de_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) =>
  res.json({
    admin: isAdmin(req),
    defaultPassword: !ENV_PASSWORD,
    loginDisabled: LOGIN_DISABLED,
    persistent: store.persistent,
  })
);

// ---------- API pública ----------
app.get('/api/public', async (req, res) => {
  let db;
  try {
    db = await store.load();
  } catch (e) {
    console.error('Lectura de datos falló, uso la carta inicial:', e.message);
    db = store.seed(); // el sitio nunca queda en blanco
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    settings: db.settings,
    categories: [...db.categories].sort((a, b) => a.order - b.order),
    items: db.items,
    events: [...db.events].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
  });
});

// ---------- API admin ----------
const admin = express.Router();
admin.use(requireAdmin);

admin.get('/db', wrap(async (req, res) => res.json(await store.load())));

admin.put('/settings', wrap(async (req, res) => {
  const db = await store.load();
  const b = req.body || {};
  db.settings = {
    name: str(b.name, 80) || db.settings.name,
    tagline: str(b.tagline, 160),
    whatsapp: str(b.whatsapp, 20).replace(/\D/g, ''),
    phoneDisplay: str(b.phoneDisplay, 30),
    instagram: str(b.instagram, 40).replace(/^@/, ''),
    address: str(b.address, 160),
    mapsUrl: str(b.mapsUrl, 500),
    hours: str(b.hours, 200),
    hoursWeekend: str(b.hoursWeekend, 200),
  };
  await store.save(db);
  res.json(db.settings);
}));

// Secciones de la carta
admin.post('/categories', wrap(async (req, res) => {
  const db = await store.load();
  const name = str(req.body && req.body.name, 60);
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const order = Math.max(0, ...db.categories.map((c) => c.order)) + 1;
  const c = {
    id: crypto.randomUUID(), group: str(req.body.group, 40) || 'Carta', name,
    mainLabel: '', altLabel: '', note: '', order,
  };
  db.categories.push(c);
  await store.save(db);
  res.json(c);
}));
admin.put('/categories/:id', wrap(async (req, res) => {
  const db = await store.load();
  const c = db.categories.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {};
  if (b.name !== undefined) c.name = str(b.name, 60) || c.name;
  if (b.group !== undefined) c.group = str(b.group, 40) || c.group;
  if (b.mainLabel !== undefined) c.mainLabel = str(b.mainLabel, 20);
  if (b.altLabel !== undefined) c.altLabel = str(b.altLabel, 20);
  if (b.note !== undefined) c.note = str(b.note, 400);
  if (b.order !== undefined) c.order = money(b.order);
  await store.save(db);
  res.json(c);
}));
admin.delete('/categories/:id', wrap(async (req, res) => {
  const db = await store.load();
  db.categories = db.categories.filter((x) => x.id !== req.params.id);
  db.items = db.items.filter((x) => x.categoryId !== req.params.id);
  await store.save(db);
  res.json({ ok: true });
}));

// Productos
admin.post('/items', wrap(async (req, res) => {
  const db = await store.load();
  const b = req.body || {};
  if (!db.categories.some((c) => c.id === b.categoryId)) return res.status(400).json({ error: 'Sección inválida' });
  const name = str(b.name, 80);
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const item = {
    id: crypto.randomUUID(), categoryId: b.categoryId, name,
    description: str(b.description, 200), price: money(b.price), priceAlt: moneyOrNull(b.priceAlt),
    available: b.available !== false, tag: str(b.tag, 30),
  };
  db.items.push(item);
  await store.save(db);
  res.json(item);
}));
admin.put('/items/:id', wrap(async (req, res) => {
  const db = await store.load();
  const it = db.items.find((x) => x.id === req.params.id);
  if (!it) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {};
  if (b.name !== undefined) it.name = str(b.name, 80) || it.name;
  if (b.description !== undefined) it.description = str(b.description, 200);
  if (b.price !== undefined) it.price = money(b.price);
  if (b.priceAlt !== undefined) it.priceAlt = moneyOrNull(b.priceAlt);
  if (b.available !== undefined) it.available = !!b.available;
  if (b.tag !== undefined) it.tag = str(b.tag, 30);
  await store.save(db);
  res.json(it);
}));
admin.delete('/items/:id', wrap(async (req, res) => {
  const db = await store.load();
  db.items = db.items.filter((x) => x.id !== req.params.id);
  await store.save(db);
  res.json({ ok: true });
}));

// Eventos
function readEvent(b) {
  const title = str(b.title, 90);
  const date = str(b.date, 10);
  const time = str(b.time, 5);
  if (!title) return { error: 'Falta el título' };
  if (!isDate(date)) return { error: 'Fecha inválida' };
  if (!isTime(time)) return { error: 'Hora inválida' };
  const count = (v) => { const n = Math.floor(Number(v)); return v === '' || v == null || !Number.isFinite(n) || n < 0 ? null : Math.min(n, 100000); };
  const capacity = count(b.capacity);
  const reserved = count(b.reserved) || 0;
  return { value: { title, date, time, description: str(b.description, 400), capacity, reserved } };
}
admin.post('/events', wrap(async (req, res) => {
  const db = await store.load();
  const r = readEvent(req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  const ev = { id: crypto.randomUUID(), ...r.value, storyUrl: '' };
  db.events.push(ev);
  await store.save(db);
  res.json(ev);
}));
admin.put('/events/:id', wrap(async (req, res) => {
  const db = await store.load();
  const ev = db.events.find((x) => x.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'No existe' });
  const r = readEvent({ ...ev, ...(req.body || {}) });
  if (r.error) return res.status(400).json({ error: r.error });
  Object.assign(ev, r.value);
  await store.save(db);
  res.json(ev);
}));
admin.delete('/events/:id', wrap(async (req, res) => {
  const db = await store.load();
  db.events = db.events.filter((x) => x.id !== req.params.id);
  await store.save(db);
  res.json({ ok: true });
}));

// ---------- Historias de Instagram ----------
const imageHosting = () => store.useSupabase || /^https:\/\//.test(PUBLIC_URL);
const igConfigured = () => !!(IG_USER_ID && IG_ACCESS_TOKEN && imageHosting());

admin.get('/instagram-status', (req, res) => {
  res.json({
    configured: igConfigured(),
    missing: [
      !IG_USER_ID && 'IG_USER_ID',
      !IG_ACCESS_TOKEN && 'IG_ACCESS_TOKEN',
      !imageHosting() && 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o PUBLIC_URL con https)',
    ].filter(Boolean),
  });
});

async function graph(pathname, params, method = 'POST') {
  const body = new URLSearchParams({ ...params, access_token: IG_ACCESS_TOKEN });
  const url = method === 'GET' ? `${GRAPH}${pathname}?${body}` : `${GRAPH}${pathname}`;
  const r = await fetch(url, method === 'GET' ? {} : { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || `Instagram respondió ${r.status}`);
  return j;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function publishStory(imageUrl) {
  const container = await graph(`/${IG_USER_ID}/media`, { image_url: imageUrl, media_type: 'STORIES' });
  for (let i = 0; i < 10; i++) {
    const s = await graph(`/${container.id}`, { fields: 'status_code' }, 'GET');
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram no pudo procesar la imagen');
    await sleep(1500);
  }
  return graph(`/${IG_USER_ID}/media_publish`, { creation_id: container.id });
}

admin.post('/events/:id/story', wrap(async (req, res) => {
  const db = await store.load();
  const ev = db.events.find((x) => x.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'No existe el evento' });

  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec((req.body && req.body.image) || '');
  if (!m) return res.status(400).json({ error: 'Imagen inválida' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 1000 || buf.length > 3.5 * 1024 * 1024) return res.status(400).json({ error: 'Tamaño de imagen inválido' });

  const url = await store.saveStory(buf, `story-${ev.id.slice(0, 8)}-${Date.now()}.png`);
  ev.storyUrl = url;
  await store.save(db);

  if (!req.body.publish) return res.json({ saved: url, published: false });
  const abs = /^https:\/\//.test(url) ? url : PUBLIC_URL ? PUBLIC_URL + url : '';
  if (!igConfigured() || !abs.startsWith('https://')) {
    return res.status(400).json({ saved: url, published: false, error: 'Instagram todavía no está conectado (faltan variables de entorno).' });
  }
  try {
    const r = await publishStory(abs);
    res.json({ saved: url, published: true, mediaId: r.id });
  } catch (e) {
    res.status(502).json({ saved: url, published: false, error: e.message });
  }
}));

app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }));

// ---------- Estáticos (solo en local; en Vercel los sirve la CDN) ----------
if (!store.onVercel) {
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
}

module.exports = app;
module.exports.LOGIN_DISABLED = LOGIN_DISABLED;
