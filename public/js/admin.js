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
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
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
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  async function showApp(defaultPassword) {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#pwBanner').hidden = !defaultPassword;
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
      const me = await api('/me');
      await showApp(me.defaultPassword);
    } catch (err) { $('#loginError').textContent = err.message; }
  });
  $('#logout').onclick = async () => { await api('/logout', 'POST').catch(() => {}); showLogin(); };

  (async () => {
    const me = await api('/me').catch(() => ({ admin: false }));
    if (me.admin) showApp(me.defaultPassword); else showLogin();
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

  // ---------- Menú ----------
  function renderMenu() {
    const cats = [...db.categories].sort((a, b) => a.order - b.order);
    $('#menuAdmin').innerHTML = cats.map((c) => {
      const items = db.items.filter((i) => i.categoryId === c.id);
      return `<div class="card cat" data-cat="${c.id}">
        <div class="cat__head">
          <input data-field="catname" value="${esc(c.name)}" maxlength="60" aria-label="Nombre de la categoría">
          <button class="link" data-act="delcat">Borrar categoría</button>
        </div>
        ${items.map(rowHtml).join('')}
        <form class="row row--new" data-newitem="${c.id}">
          <input name="name" placeholder="Nuevo producto" maxlength="80" required>
          <input name="description" class="desc" placeholder="Descripción (opcional)" maxlength="200">
          <input name="price" type="number" min="0" step="1" placeholder="Precio" required>
          <span></span>
          <button class="btn btn--small" type="submit">Agregar</button>
        </form>
      </div>`;
    }).join('') || '<p class="hint">Todavía no hay categorías. Creá la primera arriba.</p>';
  }
  function rowHtml(i) {
    return `<div class="row${i.available ? '' : ' is-off'}" data-item="${i.id}">
      <input data-field="name" value="${esc(i.name)}" maxlength="80" aria-label="Nombre">
      <input data-field="description" class="desc" value="${esc(i.description)}" maxlength="200" placeholder="Descripción" aria-label="Descripción">
      <input data-field="price" type="number" min="0" step="1" value="${i.price}" aria-label="Precio">
      <label class="sw"><input type="checkbox" data-field="available" ${i.available ? 'checked' : ''}> Disponible</label>
      <button class="del" data-act="delitem" title="Borrar producto" aria-label="Borrar producto">🗑</button>
    </div>`;
  }

  $('#catForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    await api('/admin/categories', 'POST', { name: $('#catName').value });
    $('#catName').value = '';
    await reload(); toast('Categoría creada');
  }));

  $('#menuAdmin').addEventListener('change', guard(async (e) => {
    const f = e.target.dataset.field; if (!f) return;
    const row = e.target.closest('[data-item]');
    if (row) {
      const val = f === 'available' ? e.target.checked : e.target.value;
      await api('/admin/items/' + row.dataset.item, 'PUT', { [f]: val });
      const it = db.items.find((i) => i.id === row.dataset.item);
      if (it) it[f === 'price' ? 'price' : f] = f === 'price' ? Number(val) : val;
      if (f === 'available') row.classList.toggle('is-off', !val);
      toast('Guardado ✓');
      return;
    }
    const cat = e.target.closest('[data-cat]');
    if (cat && f === 'catname') {
      await api('/admin/categories/' + cat.dataset.cat, 'PUT', { name: e.target.value });
      toast('Guardado ✓');
    }
  }));

  $('#menuAdmin').addEventListener('click', guard(async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    if (act === 'delitem') {
      const row = e.target.closest('[data-item]');
      const it = db.items.find((i) => i.id === row.dataset.item);
      if (!confirm(`¿Borrar "${it?.name}" del menú?`)) return;
      await api('/admin/items/' + row.dataset.item, 'DELETE');
      await reload(); toast('Producto borrado');
    }
    if (act === 'delcat') {
      const cat = e.target.closest('[data-cat]');
      const c = db.categories.find((x) => x.id === cat.dataset.cat);
      if (!confirm(`¿Borrar la categoría "${c?.name}" y todos sus productos?`)) return;
      await api('/admin/categories/' + cat.dataset.cat, 'DELETE');
      await reload(); toast('Categoría borrada');
    }
  }));

  $('#menuAdmin').addEventListener('submit', guard(async (e) => {
    const form = e.target.closest('[data-newitem]'); if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    await api('/admin/items', 'POST', {
      categoryId: form.dataset.newitem, name: fd.get('name'), description: fd.get('description'), price: fd.get('price'),
    });
    await reload(); toast('Producto agregado');
  }));

  // ---------- Eventos ----------
  $('#evDate').value = todayStr();
  $('#eventForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const ev = await api('/admin/events', 'POST', {
      title: $('#evTitle').value, date: $('#evDate').value, time: $('#evTime').value, description: $('#evDesc').value,
    });
    $('#evTitle').value = ''; $('#evTime').value = ''; $('#evDesc').value = '';
    await reload(); toast('Evento creado. Ahora podés publicar la historia.');
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

  // ---------- Historia de Instagram ----------
  let currentEvent = null;
  const logoImg = new Image(); logoImg.src = '/assets/logo.png';

  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/); const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function drawStory(ev) {
    try { await document.fonts.load('900 100px Fraunces'); await document.fonts.load('500 40px "DM Sans"'); } catch {}
    if (!logoImg.complete) await new Promise((r) => { logoImg.onload = r; logoImg.onerror = r; });
    const c = $('#storyCanvas'); const ctx = c.getContext('2d'); const W = 1080, H = 1920;
    const RUST = '#a2412d', CREAM = '#f1e6d2', INK = '#12161b';

    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
    // franja diagonal
    ctx.fillStyle = RUST; ctx.beginPath(); ctx.moveTo(0, 1180); ctx.lineTo(W, 980); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    // logo
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 330, 170, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logoImg, W / 2 - 170, 160, 340, 340); ctx.restore();
    ctx.strokeStyle = CREAM; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, 330, 173, 0, Math.PI * 2); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = RUST; ctx.font = '700 44px "DM Sans", sans-serif';
    ctx.fillText('E V E N T O', W / 2, 640);

    // título
    ctx.fillStyle = CREAM; let size = 120; let lines;
    do { ctx.font = `900 ${size}px Fraunces, Georgia, serif`; lines = wrap(ctx, ev.title.toUpperCase(), W - 160); size -= 6; } while (lines.length > 4 && size > 60);
    const lh = size * 1.08 + 6; let y = 760;
    lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += lh; });

    // fecha y hora
    const d = new Date(ev.date + 'T00:00:00');
    const dateTxt = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    y = Math.max(y + 30, 1120);
    ctx.fillStyle = INK; ctx.font = '900 64px Fraunces, Georgia, serif';
    ctx.fillText(dateTxt, W / 2, y + 120);
    if (ev.time) { ctx.font = '700 56px "DM Sans", sans-serif'; ctx.fillText(`${ev.time} HS`, W / 2, y + 200); }

    // descripción
    if (ev.description) {
      ctx.fillStyle = CREAM; ctx.font = '500 42px "DM Sans", sans-serif';
      wrap(ctx, ev.description, W - 220).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, y + 320 + i * 58));
    }

    ctx.fillStyle = CREAM; ctx.font = '700 46px "DM Sans", sans-serif';
    ctx.fillText(`@${db.settings.instagram}`, W / 2, 1830);
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
      const r = await api(`/admin/events/${currentEvent.id}/story`, 'POST', { image: $('#storyCanvas').toDataURL('image/png'), publish: true });
      $('#storyMsg').textContent = '✅ Historia publicada en Instagram.';
      toast('Historia publicada ✓');
      return r;
    } catch (e) {
      $('#storyMsg').textContent = '❌ ' + e.message;
      throw e;
    } finally { btn.disabled = !ig.configured; btn.textContent = 'Publicar en Instagram'; }
  });
})();
