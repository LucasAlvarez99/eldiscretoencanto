'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => new Date(s + 'T00:00:00');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  let data = { settings: {}, categories: [], items: [], events: [] };
  let cart = {}; // itemId -> qty
  try { cart = JSON.parse(localStorage.getItem('de_cart') || '{}'); } catch { cart = {}; }
  const saveCart = () => { try { localStorage.setItem('de_cart', JSON.stringify(cart)); } catch {} };

  // ---------- Carga ----------
  fetch('/api/public')
    .then((r) => r.json())
    .then((d) => { data = d; init(); })
    .catch(() => { $('#menuList').innerHTML = '<p class="empty empty--light">No pudimos cargar el menú. Probá recargar.</p>'; });

  function init() {
    const s = data.settings;
    const waBase = `https://wa.me/${s.whatsapp}`;
    document.title = `${s.name} · Café de especialidad`;
    $('#brandName').textContent = s.name;
    $('#footName').textContent = s.name;
    $('#footPhone').textContent = s.phoneDisplay || '';
    $('#tagline').textContent = s.tagline || '';
    const wa = `${waBase}?text=${encodeURIComponent('¡Hola! Quiero hacer una consulta.')}`;
    ['#navWa', '#heroWa', '#waBtn'].forEach((id) => { $(id).href = wa; });
    $('#igBtn').href = `https://instagram.com/${s.instagram}`;
    $('#mapsBtn').href = s.mapsUrl || '#';
    $('#address').textContent = s.address ? `📍 ${s.address}` : '📍 Mirá cómo llegar en el mapa';
    $('#hours').textContent = s.hours ? `🕘 ${s.hours}` : '🕘 Consultá los horarios por WhatsApp';

    renderTicker();
    renderMenu();
    renderCalendar();
    updateCart();
  }

  function renderTicker() {
    const words = ['Café de especialidad', 'Pedí por WhatsApp', 'Eventos en el café', `@${data.settings.instagram}`, 'Entrá sin hacer ruido'];
    const one = words.map((w) => `<span>${esc(w)}</span><span>✦</span>`).join('');
    $('#ticker').innerHTML = one + one + one + one; // se repite para el loop continuo
  }

  // ---------- Menú ----------
  function renderMenu() {
    const cats = data.categories.filter((c) => data.items.some((i) => i.categoryId === c.id));
    $('#pills').innerHTML = cats.map((c, i) => `<button class="pill${i === 0 ? ' is-active' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
    $('#menuList').innerHTML = cats.map((c) => {
      const rows = data.items.filter((i) => i.categoryId === c.id).map((i) => `
        <div class="item${i.available ? '' : ' item--off'}">
          <div>
            <div class="item__name">${esc(i.name)} ${i.tag ? `<span class="tag">${esc(i.tag)}</span>` : ''} ${i.available ? '' : '<span class="soldout">Agotado</span>'}</div>
            ${i.description ? `<p class="item__desc">${esc(i.description)}</p>` : ''}
          </div>
          <div class="item__price">${money(i.price)}</div>
          <button class="add" data-add="${i.id}" aria-label="Agregar ${esc(i.name)}">+</button>
        </div>`).join('');
      return `<div class="menu__cat" id="cat-${c.id}"><h3>${esc(c.name)}</h3>${rows}</div>`;
    }).join('');

    $('#pills').onclick = (e) => {
      const b = e.target.closest('.pill'); if (!b) return;
      document.querySelectorAll('.pill').forEach((p) => p.classList.toggle('is-active', p === b));
      const el = document.getElementById('cat-' + b.dataset.cat);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 130, behavior: 'smooth' });
    };
    $('#menuList').onclick = (e) => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      cart[b.dataset.add] = (cart[b.dataset.add] || 0) + 1;
      saveCart(); updateCart();
    };
  }

  // ---------- Pedido ----------
  function cartLines() {
    return Object.entries(cart)
      .map(([id, qty]) => ({ item: data.items.find((i) => i.id === id && i.available), qty }))
      .filter((l) => l.item && l.qty > 0);
  }
  function updateCart() {
    const lines = cartLines();
    const count = lines.reduce((a, l) => a + l.qty, 0);
    const total = lines.reduce((a, l) => a + l.qty * l.item.price, 0);
    $('#cart').hidden = count === 0;
    $('#cartCount').textContent = count;
    $('#cartTotal').textContent = money(total);
  }
  $('#cartClear').onclick = () => { cart = {}; saveCart(); updateCart(); };
  $('#cartSend').onclick = () => {
    const lines = cartLines();
    if (!lines.length) return;
    const total = lines.reduce((a, l) => a + l.qty * l.item.price, 0);
    const text = [
      `¡Hola ${data.settings.name}! Quiero pedir:`,
      ...lines.map((l) => `• ${l.qty}x ${l.item.name} (${money(l.item.price * l.qty)})`),
      `Total: ${money(total)}`,
    ].join('\n');
    window.open(`https://wa.me/${data.settings.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  // ---------- Calendario ----------
  const today = new Date();
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = null;

  function renderCalendar() {
    const byDate = {};
    data.events.forEach((e) => { (byDate[e.date] ||= []).push(e); });
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // semana desde lunes
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

  function renderEvents() {
    let list; let title;
    if (selected) {
      list = data.events.filter((e) => e.date === selected);
      title = parse(selected).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    } else {
      list = data.events.filter((e) => e.date >= ymd(today));
      title = 'Próximos eventos';
    }
    $('#eventsTitle').textContent = title;
    $('#eventsList').innerHTML = list.length
      ? list.map((e) => {
          const d = parse(e.date);
          return `<article class="ev">
            <div class="ev__date"><span class="ev__day">${d.getDate()}</span><span class="ev__mon">${d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</span></div>
            <div>
              <h4>${esc(e.title)}</h4>
              <div class="ev__meta">${esc(cap(d.toLocaleDateString('es-AR', { weekday: 'long' })))}${e.time ? ` · ${esc(e.time)} hs` : ''}</div>
              ${e.description ? `<p>${esc(e.description)}</p>` : ''}
            </div>
          </article>`;
        }).join('')
      : '<p class="empty">Todavía no hay eventos cargados. Seguinos en Instagram para enterarte primero.</p>';
  }
})();
