'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  let db = { settings: {}, categories: [], items: [], events: [] };
  let ig = { configured: false, missing: [] };

  // ---------- Utilidades ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false; t.classList.toggle('is-error', isError);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 4200 : 2200);
  }
  async function api(path, method = 'GET', body) {
    const r = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('Sesión vencida'); }
    if (!r.ok) { const e = new Error(j.error || 'Error'); e.data = j; throw e; }
    return j;
  }
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

  // ---------- Login ----------
  function showLogin(closed) {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#loginClosed').hidden = !closed;
  }
  async function showApp(me) {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#pwBanner').hidden = !me.defaultPassword;
    $('#persistBanner').hidden = !!me.persistent;
    await reload();
    ig = await api('/admin/instagram-status').catch(() => ig);
    renderSettings();
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    try {
      await api('/login', 'POST', { password: $('#password').value });
      $('#password').value = '';
      await showApp(await api('/me'));
    } catch (err) { $('#loginError').textContent = err.message; }
  });
  $('#logout').onclick = async () => { await api('/logout', 'POST').catch(() => {}); showLogin(); };

  (async () => {
    const me = await api('/me').catch(() => ({ admin: false }));
    if (me.admin) showApp(me); else showLogin(me.loginDisabled);
  })();

  async function reload() {
    db = await api('/admin/db');
    $('#siteName').textContent = db.settings.name;
    renderMenu();
    renderEvents();
  }

  // ---------- Tabs ----------
  $('#tabs').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('is-active', x === b));
    ['menu', 'events', 'settings'].forEach((t) => { $('#tab-' + t).hidden = t !== b.dataset.tab; });
  };

  // ---------- Carta ----------
  function renderMenu() {
    const cats = [...db.categories].sort((a, b) => a.order - b.order);
    $('#groups').innerHTML = [...new Set(cats.map((c) => c.group).filter(Boolean))].map((g) => `<option value="${esc(g)}">`).join('');
    $('#menuAdmin').innerHTML = cats.map((c) => {
      const items = db.items.filter((i) => i.categoryId === c.id);
      const alt = !!c.altLabel;
      return `<div class="card cat" data-cat="${c.id}">
        <div class="cat__head">
          <span class="cat__group">${esc(c.group || '')}</span>
          <input data-catfield="name" value="${esc(c.name)}" maxlength="60" aria-label="Nombre de la sección">
          <button class="link" data-act="delcat">Borrar sección</button>
        </div>
        <details class="cat__opts">
          <summary>Opciones de la sección (grupo, columnas caliente/frío, aclaración)</summary>
          <div class="grid">
            <label>Grupo (BEBIDAS, PARA COMER…) <input data-catfield="group" value="${esc(c.group)}" maxlength="40"></label>
            <label>Columna 1 (ej. Caliente) <input data-catfield="mainLabel" value="${esc(c.mainLabel)}" maxlength="20"></label>
            <label>Columna 2 (ej. Frío) — vacío = un solo precio <input data-catfield="altLabel" value="${esc(c.altLabel)}" maxlength="20"></label>
          </div>
          <label>Aclaración al pie de la sección (una línea por renglón)
            <textarea data-catfield="note" rows="3" maxlength="400">${esc(c.note)}</textarea></label>
          <p></p>
        </details>
        ${items.map((i) => rowHtml(i, alt, c.altLabel)).join('')}
        <form class="row row--new${alt ? ' has-alt' : ''}" data-newitem="${c.id}">
          <input name="name" placeholder="Nuevo producto" maxlength="80" required>
          <input name="description" class="desc" placeholder="Descripción (opcional)" maxlength="200">
          <input name="price" type="number" min="0" step="1" placeholder="${alt ? esc(c.mainLabel || 'Precio') : 'Precio'}" required>
          ${alt ? `<input name="priceAlt" type="number" min="0" step="1" placeholder="${esc(c.altLabel)}">` : ''}
          <span></span>
          <button class="btn btn--small" type="submit">Agregar</button>
        </form>
      </div>`;
    }).join('') || '<p class="hint">Todavía no hay secciones. Creá la primera arriba.</p>';
  }
  function rowHtml(i, alt, altLabel) {
    return `<div class="row${alt ? ' has-alt' : ''}${i.available ? '' : ' is-off'}" data-item="${i.id}">
      <input data-field="name" value="${esc(i.name)}" maxlength="80" aria-label="Nombre">
      <input data-field="description" class="desc" value="${esc(i.description)}" maxlength="200" placeholder="Descripción" aria-label="Descripción">
      <input data-field="price" type="number" min="0" step="1" value="${i.price}" aria-label="Precio">
      ${alt ? `<input data-field="priceAlt" type="number" min="0" step="1" value="${i.priceAlt ?? ''}" placeholder="${esc(altLabel)}" aria-label="Precio ${esc(altLabel)}">` : ''}
      <label class="sw"><input type="checkbox" data-field="available" ${i.available ? 'checked' : ''}> Disponible</label>
      <button class="del" data-act="delitem" title="Borrar producto" aria-label="Borrar producto">🗑</button>
    </div>`;
  }

  $('#catForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    await api('/admin/categories', 'POST', { name: $('#catName').value, group: $('#catGroup').value });
    $('#catName').value = '';
    await reload(); toast('Sección creada');
  }));

  $('#menuAdmin').addEventListener('change', guard(async (e) => {
    const t = e.target;
    const row = t.closest('[data-item]');
    if (row && t.dataset.field) {
      const f = t.dataset.field;
      const val = f === 'available' ? t.checked : t.value;
      const saved = await api('/admin/items/' + row.dataset.item, 'PUT', { [f]: val });
      const it = db.items.find((i) => i.id === row.dataset.item);
      if (it) Object.assign(it, saved);
      if (f === 'available') row.classList.toggle('is-off', !val);
      toast('Guardado ✓');
      return;
    }
    const cat = t.closest('[data-cat]');
    if (cat && t.dataset.catfield) {
      const f = t.dataset.catfield;
      await api('/admin/categories/' + cat.dataset.cat, 'PUT', { [f]: t.value });
      toast('Guardado ✓');
      if (f !== 'name' && f !== 'note') { const open = cat.dataset.cat; await reload(); const d = document.querySelector(`[data-cat="${open}"] details`); if (d) d.open = true; }
    }
  }));

  $('#menuAdmin').addEventListener('click', guard(async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    if (act === 'delitem') {
      const row = e.target.closest('[data-item]');
      const it = db.items.find((i) => i.id === row.dataset.item);
      if (!confirm(`¿Borrar "${it?.name}" de la carta?`)) return;
      await api('/admin/items/' + row.dataset.item, 'DELETE');
      await reload(); toast('Producto borrado');
    }
    if (act === 'delcat') {
      const cat = e.target.closest('[data-cat]');
      const c = db.categories.find((x) => x.id === cat.dataset.cat);
      if (!confirm(`¿Borrar la sección "${c?.name}" y todos sus productos?`)) return;
      await api('/admin/categories/' + cat.dataset.cat, 'DELETE');
      await reload(); toast('Sección borrada');
    }
  }));

  $('#menuAdmin').addEventListener('submit', guard(async (e) => {
    const form = e.target.closest('[data-newitem]'); if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    await api('/admin/items', 'POST', {
      categoryId: form.dataset.newitem, name: fd.get('name'), description: fd.get('description'),
      price: fd.get('price'), priceAlt: fd.get('priceAlt'),
    });
    await reload(); toast('Producto agregado');
  }));

  // ---------- Eventos ----------
  $('#evDate').value = todayStr();
  $('#eventForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const ev = await api('/admin/events', 'POST', {
      title: $('#evTitle').value, date: $('#evDate').value, time: $('#evTime').value, description: $('#evDesc').value, capacity: $('#evCap').value,
    });
    $('#evTitle').value = ''; $('#evTime').value = ''; $('#evDesc').value = ''; $('#evCap').value = '';
    await reload(); toast('Evento creado. Ahora podés armar la historia.');
    openStory(ev.id);
  }));

  function renderEvents() {
    const sorted = [...db.events].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    $('#eventsAdmin').innerHTML = sorted.length
      ? `<div class="card cat">${sorted.map((e) => `
        <div class="ev-row${e.date < todayStr() ? ' ev-past' : ''}" data-ev="${e.id}">
          <input class="title" data-field="title" value="${esc(e.title)}" maxlength="90" aria-label="Título">
          <input data-field="date" type="date" value="${esc(e.date)}" aria-label="Fecha">
          <input data-field="time" type="time" value="${esc(e.time)}" aria-label="Hora">
          <input class="desc" data-field="description" value="${esc(e.description)}" maxlength="400" placeholder="Descripción" aria-label="Descripción">
          <label class="seat">Entradas (total)<input data-field="capacity" type="number" min="0" step="1" value="${e.capacity ?? ''}" placeholder="Sin límite"></label>
          <label class="seat">Ya reservadas<input data-field="reserved" type="number" min="0" step="1" value="${e.reserved || 0}"></label>
          <span class="seat seat--left">${e.capacity == null ? 'Sin límite' : (e.capacity - (e.reserved || 0) > 0 ? `Quedan ${e.capacity - (e.reserved || 0)}` : 'AGOTADO')}</span>
          <div class="ev-actions">
            <button class="btn btn--small" data-act="story">📸 Historia</button>
            <button class="del" data-act="delev" title="Borrar evento" aria-label="Borrar evento">🗑</button>
          </div>
        </div>`).join('')}</div>`
      : '<p class="hint">Todavía no hay eventos. Creá el primero arriba.</p>';
  }
  $('#eventsAdmin').addEventListener('change', guard(async (e) => {
    const f = e.target.dataset.field; const row = e.target.closest('[data-ev]'); if (!f || !row) return;
    await api('/admin/events/' + row.dataset.ev, 'PUT', { [f]: e.target.value });
    await reload(); toast('Guardado ✓');
  }));
  $('#eventsAdmin').addEventListener('click', guard(async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; const row = e.target.closest('[data-ev]');
    if (!act || !row) return;
    if (act === 'story') return openStory(row.dataset.ev);
    if (act === 'delev') {
      const ev = db.events.find((x) => x.id === row.dataset.ev);
      if (!confirm(`¿Borrar el evento "${ev?.title}"?`)) return;
      await api('/admin/events/' + row.dataset.ev, 'DELETE');
      await reload(); toast('Evento borrado');
    }
  }));

  // ---------- Ajustes ----------
  function renderSettings() {
    const f = $('#settingsForm');
    Object.entries(db.settings).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
    $('#igStatus').innerHTML = ig.configured
      ? '<h3>Instagram</h3><p class="hint">✅ Conectado. El botón "Publicar en Instagram" sube la historia directo a la cuenta.</p>'
      : `<h3>Instagram</h3><p class="hint">Todavía no está conectado, por eso la historia se descarga como imagen para subirla a mano. Para publicar automáticamente faltan estas variables en el servidor: <code>${ig.missing.map(esc).join('</code> <code>')}</code></p>`;
  }
  $('#settingsForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    db.settings = await api('/admin/settings', 'PUT', Object.fromEntries(new FormData(e.target)));
    $('#siteName').textContent = db.settings.name;
    toast('Ajustes guardados ✓');
  }));

  // ---------- Historia de Instagram (1080×1920, identidad "Brasas") ----------
  let currentEvent = null;
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

  // Dibuja una marca (PNG con alfa) teñida del color pedido, ajustada a una caja.
  function drawMark(ctx, img, color, x, y, maxW, maxH, align = 'center') {
    if (!img) return { w: 0, h: 0 };
    const s = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * s, h = img.height * s;
    const tmp = document.createElement('canvas'); tmp.width = Math.ceil(w); tmp.height = Math.ceil(h);
    const t = tmp.getContext('2d');
    t.drawImage(img, 0, 0, w, h);
    t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, w, h);
    const dx = align === 'center' ? x - w / 2 : x;
    ctx.drawImage(tmp, dx, y);
    return { w, h };
  }
  function wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/); const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function drawStory(ev) {
    try {
      await Promise.all([
        document.fonts.load('700 100px "Bodoni Moda"'), document.fonts.load('600 30px "Archivo"'), document.fonts.load('500 30px "DM Mono"'),
      ]);
    } catch {}
    const [word, head] = await Promise.all([loadImg('/assets/wordmark-v.png'), loadImg('/assets/detective-head.png')]);
    const c = $('#storyCanvas'); const ctx = c.getContext('2d'); const W = 1080, H = 1920;
    const CARBON = '#0F0B09', BRASAS = '#A04818', TERRACOTA = '#D07040', CREMA = '#E8D8C0', VINO = '#890E0E';

    ctx.fillStyle = CARBON; ctx.fillRect(0, 0, W, H);
    // franja de brasas abajo
    ctx.fillStyle = VINO; ctx.beginPath(); ctx.moveTo(0, 1240); ctx.lineTo(W, 1090); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    // marco fino
    ctx.strokeStyle = 'rgba(232,216,192,.35)'; ctx.lineWidth = 3; ctx.strokeRect(48, 48, W - 96, H - 96);

    drawMark(ctx, word, TERRACOTA, W / 2, 120, 640, 280);
    ctx.textAlign = 'center';
    ctx.fillStyle = CREMA; ctx.font = '600 34px Archivo, sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '12px';
    ctx.fillText('ESTO NO ES UNA CARTA', W / 2 + 6, 470);
    ctx.fillStyle = TERRACOTA; ctx.font = '500 38px "DM Mono", monospace';
    ctx.fillText('SECRETOS FUERA DE CARTA', W / 2 + 6, 640);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // título
    ctx.fillStyle = CREMA; let size = 132; let lines;
    do { ctx.font = `700 ${size}px "Bodoni Moda", Georgia, serif`; lines = wrapText(ctx, ev.title.toUpperCase(), W - 190); size -= 6; } while (lines.length > 4 && size > 64);
    const lh = size * 1.08; let y = 780;
    lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += lh; });

    // fecha y hora sobre la franja
    const d = new Date(ev.date + 'T00:00:00');
    const dateTxt = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    y = Math.max(y + 40, 1240);
    ctx.fillStyle = CREMA; ctx.font = '700 70px "Bodoni Moda", Georgia, serif';
    ctx.fillText(dateTxt, W / 2, y + 90);
    if (ev.time) { ctx.font = '500 52px "DM Mono", monospace'; ctx.fillText(`${ev.time} HS`, W / 2, y + 170); }
    if (ev.capacity != null) {
      ctx.font = '500 40px "DM Mono", monospace'; ctx.fillStyle = '#E8D8C0';
      ctx.fillText(`CUPOS LIMITADOS · ${ev.capacity} LUGARES`, W / 2, y + (ev.time ? 240 : 170));
      y += 70;
    }
    if (ev.description) {
      ctx.font = '500 40px Archivo, sans-serif';
      wrapText(ctx, ev.description, W - 240).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, y + 260 + i * 56));
    }

    // pie
    drawMark(ctx, head, CREMA, W / 2, H - 330, 120, 120);
    ctx.fillStyle = CREMA; ctx.font = '500 34px "DM Mono", monospace';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
    ctx.fillText(`@${db.settings.instagram}`.toUpperCase(), W / 2, H - 170);
    if (db.settings.address) { ctx.font = '500 28px "DM Mono", monospace'; ctx.fillText(db.settings.address.toUpperCase(), W / 2, H - 118); }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  async function openStory(id) {
    currentEvent = db.events.find((e) => e.id === id); if (!currentEvent) return;
    $('#storyMsg').textContent = '';
    $('#storyPublish').disabled = !ig.configured;
    $('#storyPublish').title = ig.configured ? '' : 'Instagram no está conectado todavía (ver Ajustes)';
    $('#storyModal').hidden = false;
    await drawStory(currentEvent);
    if (!ig.configured) $('#storyMsg').textContent = 'Instagram no está conectado: descargá la imagen y subila como historia. (Ver Ajustes.)';
  }
  $('#storyClose').onclick = () => { $('#storyModal').hidden = true; };
  $('#storyModal').addEventListener('click', (e) => { if (e.target.id === 'storyModal') $('#storyModal').hidden = true; });

  $('#storyDownload').onclick = () => {
    const a = document.createElement('a');
    a.download = `historia-${currentEvent.date}.png`;
    a.href = $('#storyCanvas').toDataURL('image/png');
    a.click();
  };
  $('#storyPublish').onclick = guard(async () => {
    const btn = $('#storyPublish'); btn.disabled = true; btn.textContent = 'Publicando…'; $('#storyMsg').textContent = '';
    try {
      await api(`/admin/events/${currentEvent.id}/story`, 'POST', { image: $('#storyCanvas').toDataURL('image/png'), publish: true });
      $('#storyMsg').textContent = '✅ Historia publicada en Instagram.';
      toast('Historia publicada ✓');
    } catch (e) {
      $('#storyMsg').textContent = '❌ ' + e.message;
      throw e;
    } finally { btn.disabled = !ig.configured; btn.textContent = 'Publicar en Instagram'; }
  });
})();
