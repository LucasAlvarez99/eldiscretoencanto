'use strict';
// Almacenamiento de datos e imágenes de historias.
//  - Con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: tabla `site_data` (una fila con todo el JSON)
//    y bucket público `stories`. Es lo que hay que usar en Vercel (no tiene disco persistente).
//  - Sin eso: archivo data/db.json (sirve para correrlo en tu compu).
const fs = require('fs');
const path = require('path');
const seed = require('./seed');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const useSupabase = !!(SB_URL && SB_KEY);
const onVercel = !!process.env.VERCEL;
const persistent = useSupabase || !onVercel;

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const STORIES_DIR = path.join(__dirname, '..', 'public', 'stories');
const BUCKET = 'stories';

const NO_DISK = 'Este servidor no puede guardar datos: falta conectar Supabase (ver README).';

async function sb(pathname, opts = {}) {
  const headers = { apikey: SB_KEY, ...(opts.headers || {}) };
  // Las claves nuevas (sb_secret_...) no son JWT: van solo en `apikey`.
  if (!SB_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SB_KEY}`;
  const r = await fetch(SB_URL + pathname, { ...opts, headers });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Supabase ${r.status}: ${t.slice(0, 200)}`);
  }
  return r;
}

async function load() {
  if (useSupabase) {
    const r = await sb('/rest/v1/site_data?id=eq.main&select=data');
    const rows = await r.json();
    if (rows[0] && rows[0].data) return rows[0].data;
    const db = seed();
    await save(db); // primera vez: guarda la carta inicial
    return db;
  }
  if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  return seed();
}

async function save(db) {
  if (useSupabase) {
    await sb('/rest/v1/site_data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'main', data: db, updated_at: new Date().toISOString() }),
    });
    return;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    throw new Error(NO_DISK);
  }
}

// Consulta liviana a la base. Falla si no responde (o si en Vercel falta configurar Supabase).
async function ping() {
  if (useSupabase) {
    await sb('/rest/v1/site_data?select=id&limit=1', { signal: AbortSignal.timeout(8000) });
    return;
  }
  if (onVercel) throw new Error(NO_DISK);
}

// Devuelve la URL de la imagen (absoluta si está en Supabase, relativa si es archivo local).
async function saveStory(buf, name) {
  if (useSupabase) {
    await sb(`/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: buf,
    });
    return `${SB_URL}/storage/v1/object/public/${BUCKET}/${name}`;
  }
  try {
    fs.mkdirSync(STORIES_DIR, { recursive: true });
    fs.writeFileSync(path.join(STORIES_DIR, name), buf);
  } catch (e) {
    throw new Error(NO_DISK);
  }
  return `/stories/${name}`;
}

module.exports = { load, save, saveStory, ping, seed, useSupabase, persistent, onVercel };
