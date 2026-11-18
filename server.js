'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seed = require('./seed');

// ---------- Configuración (variables de entorno) ----------
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cambiame';
const SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('discreto:' + ADMIN_PASSWORD).digest('hex');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, ''); // https://tudominio.com
const IG_USER_ID = process.env.IG_USER_ID || '';
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const GRAPH = 'https://graph.facebook.com/v21.0';

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const STORIES_DIR = path.join(__dirname, 'public', 'stories');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STORIES_DIR, { recursive: true });

// ---------- "Base de datos" en un JSON ----------
function saveDb(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function loadDb() {
  if (!fs.existsSync(DB_FILE)) saveDb(seed());
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// ---------- Validaciones ----------
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const money = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00'));
const isTime = (v) => v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// ---------- Sesión de admin (cookie firmada) ----------
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
function requireAdmin(req, res, next) {
  if (validToken(cookies(req).de_admin)) return next();
  res.status(401).json({ error: 'No autorizado' });
}

const attempts = new Map(); // ip -> { n, until }
function passwordOk(input) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Demasiados intentos. Probá en unos minutos.' });
  if (!passwordOk(req.body?.password)) {
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
app.get('/api/me', (req, res) => res.json({ admin: validToken(cookies(req).de_admin), defaultPassword: ADMIN_PASSWORD === 'cambiame' }));

// ---------- API pública ----------
app.get('/api/public', (req, res) => {
  const db = loadDb();
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

admin.get('/db', (req, res) => res.json(loadDb()));

admin.put('/settings', (req, res) => {
  const db = loadDb();
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
  };
  saveDb(db);
  res.json(db.settings);
});

// Categorías
admin.post('/categories', (req, res) => {
  const db = loadDb();
  const name = str(req.body?.name, 60);
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const order = Math.max(0, ...db.categories.map((c) => c.order)) + 1;
  const c = { id: crypto.randomUUID(), name, order };
  db.categories.push(c);
  saveDb(db);
  res.json(c);
});
admin.put('/categories/:id', (req, res) => {
  const db = loadDb();
  const c = db.categories.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe' });
  if (req.body.name !== undefined) c.name = str(req.body.name, 60) || c.name;
  if (req.body.order !== undefined) c.order = money(req.body.order);
  saveDb(db);
  res.json(c);
});
admin.delete('/categories/:id', (req, res) => {
  const db = loadDb();
  db.categories = db.categories.filter((x) => x.id !== req.params.id);
  db.items = db.items.filter((x) => x.categoryId !== req.params.id);
  saveDb(db);
  res.json({ ok: true });
});

// Productos
admin.post('/items', (req, res) => {
  const db = loadDb();
  const b = req.body || {};
  if (!db.categories.some((c) => c.id === b.categoryId)) return res.status(400).json({ error: 'Categoría inválida' });
  const name = str(b.name, 80);
  if (!name) return res.status(400).json({ error: 'Falta el nombre' });
  const item = {
    id: crypto.randomUUID(),
    categoryId: b.categoryId,
    name,
    description: str(b.description, 200),
    price: money(b.price),
    available: b.available !== false,
    tag: str(b.tag, 30),
  };
  db.items.push(item);
  saveDb(db);
  res.json(item);
});
admin.put('/items/:id', (req, res) => {
  const db = loadDb();
  const it = db.items.find((x) => x.id === req.params.id);
  if (!it) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {};
  if (b.name !== undefined) it.name = str(b.name, 80) || it.name;
  if (b.description !== undefined) it.description = str(b.description, 200);
  if (b.price !== undefined) it.price = money(b.price);
  if (b.available !== undefined) it.available = !!b.available;
  if (b.tag !== undefined) it.tag = str(b.tag, 30);
  saveDb(db);
  res.json(it);
});
admin.delete('/items/:id', (req, res) => {
  const db = loadDb();
  db.items = db.items.filter((x) => x.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true });
});

// Eventos
function readEvent(b) {
  const title = str(b.title, 90);
  const date = str(b.date, 10);
  const time = str(b.time, 5);
  if (!title) return { error: 'Falta el título' };
  if (!isDate(date)) return { error: 'Fecha inválida' };
  if (!isTime(time)) return { error: 'Hora inválida' };
  return { value: { title, date, time, description: str(b.description, 400) } };
}
admin.post('/events', (req, res) => {
  const db = loadDb();
  const r = readEvent(req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  const ev = { id: crypto.randomUUID(), ...r.value, storyUrl: '' };
  db.events.push(ev);
  saveDb(db);
  res.json(ev);
});
admin.put('/events/:id', (req, res) => {
  const db = loadDb();
  const ev = db.events.find((x) => x.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'No existe' });
  const r = readEvent({ ...ev, ...(req.body || {}) });
  if (r.error) return res.status(400).json({ error: r.error });
  Object.assign(ev, r.value);
  saveDb(db);
  res.json(ev);
});
admin.delete('/events/:id', (req, res) => {
  const db = loadDb();
  db.events = db.events.filter((x) => x.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true });
});

// ---------- Historias de Instagram ----------
const igConfigured = () => !!(IG_USER_ID && IG_ACCESS_TOKEN && /^https:\/\//.test(PUBLIC_URL));

admin.get('/instagram-status', (req, res) => {
  res.json({
    configured: igConfigured(),
    missing: [
      !IG_USER_ID && 'IG_USER_ID',
      !IG_ACCESS_TOKEN && 'IG_ACCESS_TOKEN',
      !/^https:\/\//.test(PUBLIC_URL) && 'PUBLIC_URL (https)',
    ].filter(Boolean),
  });
});

async function graph(pathname, params, method = 'POST') {
  const body = new URLSearchParams({ ...params, access_token: IG_ACCESS_TOKEN });
  const url = method === 'GET' ? `${GRAPH}${pathname}?${body}` : `${GRAPH}${pathname}`;
  const r = await fetch(url, method === 'GET' ? {} : { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || `Instagram respondió ${r.status}`);
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

admin.post('/events/:id/story', async (req, res) => {
  const db = loadDb();
  const ev = db.events.find((x) => x.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'No existe el evento' });

  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.image || '');
  if (!m) return res.status(400).json({ error: 'Imagen inválida' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 1000 || buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Tamaño de imagen inválido' });

  const file = `story-${ev.id.slice(0, 8)}-${Date.now()}.png`;
  fs.writeFileSync(path.join(STORIES_DIR, file), buf);
  ev.storyUrl = `/stories/${file}`;
  saveDb(db);

  if (!req.body.publish) return res.json({ saved: ev.storyUrl, published: false });
  if (!igConfigured()) {
    return res.status(400).json({ saved: ev.storyUrl, published: false, error: 'Instagram todavía no está conectado (faltan variables de entorno).' });
  }
  try {
    const r = await publishStory(`${PUBLIC_URL}${ev.storyUrl}`);
    res.json({ saved: ev.storyUrl, published: true, mediaId: r.id });
  } catch (e) {
    res.status(502).json({ saved: ev.storyUrl, published: false, error: e.message });
  }
});

app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }));

// ---------- Estáticos ----------
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`El Discreto Encanto → http://localhost:${PORT}  (panel: /admin)`);
  if (ADMIN_PASSWORD === 'cambiame') console.warn('⚠️  Usás la contraseña por defecto. Definí ADMIN_PASSWORD antes de publicar.');
});
