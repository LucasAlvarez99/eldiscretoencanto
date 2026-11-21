'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // 2700 → 2.700
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => new Date(s + 'T00:00:00');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  let data = { settings: {}, categories: [], items: [], events: [] };

  fetch('/api/public')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { data = d; init(); })
    .catch(() => { $('#carta-list').innerHTML = '<p class="empty" style="color:#6b5648">No pudimos cargar la carta. Probá recargar.</p>'; });

  function init() {
    const s = data.settings;
    document.title = `${s.name} · Café en Villa Lugano`;
    if (s.tagline) $('#tagline').textContent = s.tagline;

    const maps = s.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address || '')}`;
    ['#navMaps', '#heroMaps', '#mapsBtn'].forEach((id) => { $(id).href = maps; });
    $('#waBtn').href = `https://wa.me/${s.whatsapp}?text=${encodeURIComponent('¡Hola! Quería hacer una consulta.')}`;
    $('#igBtn').href = `https://instagram.com/${s.instagram}`;
    $('#footIg').href = `https://instagram.com/${s.instagram}`;
    $('#footIg').textContent = `@${s.instagram}`;
    $('#footPhone').textContent = s.phoneDisplay || '';
    ['#heroAddr', '#address', '#footAddr'].forEach((id) => { $(id).textContent = s.address || ''; });
    const hrs = [s.hours, s.hoursWeekend].filter(Boolean);
    if (hrs.length) { $('#hours').innerHTML = hrs.map((h) => `<span>${esc(h)}</span>`).join(''); $('#hours').hidden = false; }

    renderTicker();
    renderCarta();
    renderCalendar();
  }

  function renderTicker() {
    const words = ['Café molido en el momento', 'Pedí en el mostrador', 'Disfrutá en las mesas', 'Secretos fuera de carta los fines de semana', `@${data.settings.instagram}`];
    const one = words.map((w) => `<span>${esc(w)}</span><span>✦</span>`).join('');
    $('#ticker').innerHTML = one + one + one + one;
  }

  // ---------- Carta ----------
  function renderCarta() {
    const cats = [...data.categories].sort((a, b) => a.order - b.order);
    const groups = [];
    cats.forEach((c) => {
      const items = data.items.filter((i) => i.categoryId === c.id);
      if (!items.length) return;
      const name = c.group || 'Carta';
      let g = groups.find((x) => x.name === name);
      if (!g) { g = { name, cats: [] }; groups.push(g); }
      g.cats.push({ c, items });
    });

    $('#carta-list').innerHTML = groups.map((g) => `
      <section class="group" aria-label="${esc(g.name)}">
        <h3 class="group__title">${esc(g.name)}</h3>
        <div class="group__body">${g.cats.map(({ c, items }) => subHtml(c, items)).join('')}</div>
      </section>`).join('') || '<p class="empty" style="color:#6b5648">Todavía no hay productos cargados.</p>';
  }

  function subHtml(c, items) {
    const two = !!c.altLabel;
    const head = `<div class="sub__head"><span>${esc(c.name)}</span>${two ? `<span class="col">${esc(c.mainLabel || '')}</span><span class="col">${esc(c.altLabel)}</span>` : '<span></span>'}</div>`;
    const rows = items.map((i) => {
      const off = i.available === false;
      const prices = off
        ? '<span class="price price--off">Agotado</span>'
        : `<span class="price">${fmt(i.price)}</span>${two ? `<span class="price">${i.priceAlt == null ? '' : fmt(i.priceAlt)}</span>` : ''}`;
      return `<div class="row${off ? ' row--off' : ''}">
        <div class="row__name">${esc(i.name)}${i.description ? `<small>${esc(i.description)}</small>` : ''}</div>${prices}</div>`;
    }).join('');
    const note = c.note ? `<p class="note">${String(c.note).split('\n').map((l) => `<span>${esc(l)}</span>`).join('')}</p>` : '';
    return `<div class="sub sub--${two ? 2 : 1}">${head}${rows}${note}</div>`;
  }

  // ---------- Calendario ----------
  const today = new Date();
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = null;

  function renderCalendar() {
    const byDate = {};
    data.events.forEach((e) => { (byDate[e.date] ||= []).push(e); });
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // semana desde el lunes
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const title = cap(view.toLocaleDateString('es-AR', { month: 'long' })) + ' ' + view.getFullYear();

    let cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="cal__dow">${d}</div>`).join('');
    cells += '<span></span>'.repeat(offset);
    for (let d = 1; d <= days; d++) {
      const key = `${view.getFullYear()}-${pad(view.getMonth() + 1)}-${pad(d)}`;
      const has = byDate[key];
      const cls = ['cal__day', has && 'has-event', key === ymd(today) && 'is-today', key === selected && 'is-selected'].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-day="${key}" ${has ? '' : 'disabled'} aria-label="${d}${has ? ', hay evento' : ''}">${d}</button>`;
    }
    $('#cal').innerHTML = `
      <div class="cal__head">
        <button class="cal__nav" data-nav="-1" aria-label="Mes anterior">‹</button>
        <div class="cal__title">${esc(title)}</div>
        <button class="cal__nav" data-nav="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal__grid">${cells}</div>`;

    $('#cal').onclick = (e) => {
      const n = e.target.closest('[data-nav]');
      if (n) { view = new Date(view.getFullYear(), view.getMonth() + Number(n.dataset.nav), 1); selected = null; return renderCalendar(); }
      const d = e.target.closest('[data-day]');
      if (d && !d.disabled) { selected = selected === d.dataset.day ? null : d.dataset.day; renderCalendar(); }
    };
    renderEvents();
  }

  function seatsHtml(e) {
    if (e.capacity == null) return '';
    const left = Math.max(0, e.capacity - (e.reserved || 0));
    if (left === 0) return '<p class="ev__seats ev__seats--out">Entradas agotadas</p>';
    const d = parse(e.date).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const msg = `¡Hola! Quiero reservar para "${e.title}" (${d}${e.time ? ' ' + e.time + ' hs' : ''}).`;
    const wa = `https://wa.me/${data.settings.whatsapp}?text=${encodeURIComponent(msg)}`;
    return `<p class="ev__seats">${left === 1 ? 'Queda 1 lugar' : `Quedan ${left} lugares`} · cupos limitados</p>
      <a class="btn btn--small ev__book" href="${wa}" target="_blank" rel="noopener">Reservar mi lugar</a>`;
  }

  function renderEvents() {
    let list; let title;
    if (selected) {
      list = data.events.filter((e) => e.date === selected);
      title = cap(parse(selected).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
    } else {
      list = data.events.filter((e) => e.date >= ymd(today));
      title = 'Próximos eventos';
    }
    $('#eventsTitle').textContent = title;
    $('#eventsList').innerHTML = list.length
      ? list.map((e) => {
          const d = parse(e.date);
          return `<article class="ev">
            <div class="ev__date"><span class="ev__day">${d.getDate()}</span><span class="ev__mon">${esc(d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''))}</span></div>
            <div>
              <h4>${esc(e.title)}</h4>
              <div class="ev__meta">${esc(cap(d.toLocaleDateString('es-AR', { weekday: 'long' })))}${e.time ? ` · ${esc(e.time)} hs` : ''}</div>
              ${e.description ? `<p>${esc(e.description)}</p>` : ''}
              ${seatsHtml(e)}
            </div>
          </article>`;
        }).join('')
      : '<p class="empty">Todavía no hay eventos cargados. Seguinos en Instagram para enterarte primero.</p>';
  }
})();
