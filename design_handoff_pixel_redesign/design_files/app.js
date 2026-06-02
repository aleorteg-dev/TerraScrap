/* ============================================================================
   TerraScrap — mockup interactions
   Drives: upload → explorer transition, autocomplete, search, match focus,
   source filters, panels, toolbar toggles, toasts.
   ============================================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  zoom: 100,
  masked: false,
  itemId: null,
  itemName: '',
  matches: [],
  hiddenSources: new Set(),
  focusIndex: -1,
};

/* ── View switching ─────────────────────────────────────────────────────── */
function showExplorer() {
  $('#view-landing').classList.remove('active');
  $('#view-explorer').classList.add('active');
  flashMapToast('Mundo revelado · 20.16 M tiles');
  renderNpcs();
  renderEmptyResults();
}

/* ── Upload flow (fake progress) ────────────────────────────────────────── */
function startUpload() {
  const dz = $('#dropzone');
  const bar = $('#dz-bar');
  const fill = bar.querySelector('span');
  dz.classList.add('loading');
  $('#dz-title').textContent = 'Revelando Terralandia…';
  $('#dz-sub').textContent = 'Parseando 20.16 M tiles';
  $('#dz-cta').style.display = 'none';
  bar.hidden = false;
  let p = 0;
  const t = setInterval(() => {
    p = Math.min(100, p + Math.random() * 22 + 8);
    fill.style.width = p + '%';
    if (p >= 100) {
      clearInterval(t);
      setTimeout(showExplorer, 380);
    }
  }, 220);
}

$('#dropzone').addEventListener('click', startUpload);
$('#dropzone').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startUpload(); }
});
['dragover', 'dragenter'].forEach((ev) =>
  $('#dropzone').addEventListener(ev, (e) => { e.preventDefault(); $('#dropzone').classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) =>
  $('#dropzone').addEventListener(ev, (e) => { e.preventDefault(); $('#dropzone').classList.remove('drag'); }));
$('#dropzone').addEventListener('drop', startUpload);

/* ── Close world ────────────────────────────────────────────────────────── */
$('#close-world').addEventListener('click', () => {
  $('#view-explorer').classList.remove('active');
  $('#view-landing').classList.add('active');
  // reset dropzone
  const dz = $('#dropzone');
  dz.classList.remove('loading');
  $('#dz-title').innerHTML = 'Suelta tu <span class="mono" style="color:var(--gold)">.wld</span> aquí';
  $('#dz-sub').textContent = 'o pulsa para explorar tus archivos';
  $('#dz-cta').style.display = '';
  $('#dz-bar').hidden = true;
  $('#dz-bar').querySelector('span').style.width = '0%';
  clearSearch();
});

/* ── Icons helper ───────────────────────────────────────────────────────── */
function srcIconSvg(source) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[SOURCE_META[source].icon]}</svg>`;
}

/* ── Autocomplete ───────────────────────────────────────────────────────── */
const input = $('#search-input');
const ac = $('#autocomplete');
let acActive = -1;

function renderAutocomplete(items) {
  if (!items.length) { ac.classList.remove('open'); ac.innerHTML = ''; return; }
  ac.innerHTML = items.map((it, i) => `
    <button class="ac-item${i === acActive ? ' active' : ''}" data-id="${it.id}" data-name="${it.name}">
      <span class="ac-sprite"></span>
      <span class="ac-name">${it.name}</span>
      <span class="ac-id mono">#${it.id}</span>
    </button>`).join('');
  ac.classList.add('open');
  $$('.ac-item', ac).forEach((el) =>
    el.addEventListener('click', () => selectItem(+el.dataset.id, el.dataset.name)));
}

input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  $('#search-clear').hidden = q.length === 0;
  acActive = -1;
  if (!q) { ac.classList.remove('open'); return; }
  const matches = CATALOG.filter((it) => {
    if (/^\d+$/.test(q)) return String(it.id).startsWith(q);
    return it.name.toLowerCase().includes(q);
  }).slice(0, 7);
  renderAutocomplete(matches);
});

input.addEventListener('keydown', (e) => {
  const opts = $$('.ac-item', ac);
  if (!ac.classList.contains('open')) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); acActive = Math.min(acActive + 1, opts.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); acActive = Math.max(acActive - 1, 0); }
  else if (e.key === 'Enter' && acActive >= 0) {
    e.preventDefault();
    const el = opts[acActive];
    selectItem(+el.dataset.id, el.dataset.name);
    return;
  } else return;
  opts.forEach((o, i) => o.classList.toggle('active', i === acActive));
});

$('#search-clear').addEventListener('click', clearSearch);

function clearSearch() {
  input.value = '';
  $('#search-clear').hidden = true;
  ac.classList.remove('open');
  ac.innerHTML = '';
  state.itemId = null; state.itemName = ''; state.matches = [];
  state.hiddenSources.clear(); state.focusIndex = -1;
  renderEmptyResults();
  renderMarkers();
  clearTileDetail();
}

/* ── Run a search ───────────────────────────────────────────────────────── */
function selectItem(id, name) {
  state.itemId = id;
  state.itemName = name;
  state.hiddenSources.clear();
  state.focusIndex = -1;
  input.value = name;
  $('#search-clear').hidden = false;
  ac.classList.remove('open');

  const inclChests = $('#incl-containers').checked;
  let matches = (RESULTS[id] || []).slice();
  if (!inclChests) matches = matches.filter((m) => m.source !== 'chest');
  state.matches = matches;

  renderResults();
  renderMarkers();
  clearTileDetail();
  if (matches.length) {
    flashMapToast(`${matches.length} coincidencia${matches.length > 1 ? 's' : ''} de “${name}”`);
  }
}

$('#incl-containers').addEventListener('change', () => {
  if (state.itemId != null) selectItem(state.itemId, state.itemName);
});

/* ── Render results list ────────────────────────────────────────────────── */
function visibleMatches() {
  return state.matches
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !state.hiddenSources.has(m.source));
}

function renderEmptyResults() {
  $('#results-count').innerHTML = '<b>—</b>';
  $('#source-filters').innerHTML = '';
  $('#map-legend').hidden = true;
  $('#match-list').innerHTML = `
    <div class="empty-state">
      <div class="es-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
      <h4>Busca un ítem para empezar</h4>
      <p>Prueba con <b>Zenith</b>, <b>Chlorophyte Ore</b>, <b>Aglet</b> o <b>Torch</b>.</p>
    </div>`;
}

function renderResults() {
  const total = state.matches.length;
  if (total === 0) {
    $('#results-count').innerHTML = '<b>0</b> coincidencias';
    $('#source-filters').innerHTML = '';
    $('#map-legend').hidden = true;
    $('#match-list').innerHTML = `
      <div class="empty-state">
        <div class="es-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11h6"/><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div>
        <h4>Sin coincidencias</h4>
        <p>“${state.itemName}” no aparece en este mundo${$('#incl-containers').checked ? '' : ' (cofres excluidos)'}.</p>
      </div>`;
    return;
  }

  // count by source
  const counts = {};
  state.matches.forEach((m) => { counts[m.source] = (counts[m.source] || 0) + 1; });
  const vis = visibleMatches();

  $('#results-count').innerHTML =
    vis.length === total
      ? `<b>${total}</b> coincidencia${total > 1 ? 's' : ''}`
      : `<b>${vis.length}</b> de ${total}`;

  // Source filter chips
  const srcOrder = ['chest', 'block', 'wall', 'object'].filter((s) => counts[s]);
  $('#source-filters').innerHTML = srcOrder.map((s) => {
    const off = state.hiddenSources.has(s);
    return `<button class="src-chip${off ? ' off' : ''}" data-src="${s}">
      <span class="swatch" style="background:${SOURCE_META[s].color}"></span>
      ${SOURCE_META[s].label}<span class="n">${counts[s]}</span>
    </button>`;
  }).join('');
  $$('.src-chip').forEach((el) =>
    el.addEventListener('click', () => toggleSource(el.dataset.src)));

  // Match rows
  $('#match-list').innerHTML = vis.map(({ m, i }) => {
    const meta = SOURCE_META[m.source];
    const stack = m.stack > 1 ? `<span class="stack">×${m.stack}</span>` : '';
    const chestTag = m.chest != null ? ` · cofre #${m.chest}` : '';
    return `
      <button class="match${i === state.focusIndex ? ' active' : ''}" data-i="${i}">
        <span class="match-badge" style="color:${meta.color};background:color-mix(in oklch, ${meta.color} 16%, transparent)">${srcIconSvg(m.source)}</span>
        <span class="match-main">
          <span class="match-title">${meta.label} en (${m.x}, ${m.y})</span>
          <span class="match-sub">x ${m.x} · y ${m.y}${chestTag} ${stack}</span>
        </span>
        <span class="match-go">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
        </span>
      </button>`;
  }).join('');
  $$('.match').forEach((el) =>
    el.addEventListener('click', () => focusMatch(+el.dataset.i)));

  // Legend
  $('#map-legend').hidden = false;
  $('#legend-total').textContent = vis.length;
  $('#legend-rows').innerHTML = srcOrder.filter((s) => !state.hiddenSources.has(s)).map((s) =>
    `<div class="lg-row" style="color:${SOURCE_META[s].color}">
      <span class="swatch" style="background:${SOURCE_META[s].color}"></span>
      <span style="color:var(--ink)">${SOURCE_META[s].label}</span>
      <span class="n">${counts[s]}</span>
    </div>`).join('');
}

function toggleSource(s) {
  if (state.hiddenSources.has(s)) state.hiddenSources.delete(s);
  else state.hiddenSources.add(s);
  state.focusIndex = -1;
  renderResults();
  renderMarkers();
}

/* ── Markers on map ─────────────────────────────────────────────────────── */
function renderMarkers() {
  const layer = $('#marker-layer');
  const vis = visibleMatches();
  layer.innerHTML = vis.map(({ m, i }) => {
    const meta = SOURCE_META[m.source];
    return `
      <div class="marker${i === state.focusIndex ? ' focused' : ''}" data-i="${i}" style="left:${m.px}%;top:${m.py}%;--mc:${meta.color}">
        <span class="pulse"></span>
        <span class="ring"></span>
        <span class="pin-dot"></span>
        <span class="tip">${meta.label}<span class="c">${m.x}, ${m.y}</span></span>
      </div>`;
  }).join('');
  $$('.marker', layer).forEach((el) =>
    el.addEventListener('click', () => focusMatch(+el.dataset.i)));
}

/* ── Focus a match ──────────────────────────────────────────────────────── */
function focusMatch(i) {
  state.focusIndex = i;
  const m = state.matches[i];
  if (!m) return;
  $('#cx').textContent = m.x;
  $('#cy').textContent = m.y;
  renderResults();
  renderMarkers();
  renderTileDetail(m);
  // scroll active row into view within the list (no scrollIntoView per guidance)
  const list = $('#match-list');
  const row = $(`.match[data-i="${i}"]`);
  if (row && list) {
    const rTop = row.offsetTop, rBot = rTop + row.offsetHeight;
    if (rTop < list.scrollTop) list.scrollTop = rTop - 8;
    else if (rBot > list.scrollTop + list.clientHeight) list.scrollTop = rBot - list.clientHeight + 8;
  }
}

function navMatch(delta) {
  const vis = visibleMatches();
  if (!vis.length) return;
  const order = vis.map((v) => v.i);
  let pos = order.indexOf(state.focusIndex);
  pos = pos === -1 ? (delta > 0 ? 0 : order.length - 1) : (pos + delta + order.length) % order.length;
  focusMatch(order[pos]);
}
$('#nav-next').addEventListener('click', () => navMatch(1));
$('#nav-prev').addEventListener('click', () => navMatch(-1));

/* ── Tile detail panel ──────────────────────────────────────────────────── */
function renderTileDetail(m) {
  const meta = SOURCE_META[m.source];
  let chestBlock = '';
  if (m.source === 'chest' && m.items) {
    const slots = [];
    for (let i = 0; i < 20; i++) {
      const it = m.items[i];
      if (it) {
        slots.push(`<div class="slot filled${it.found ? ' found' : ''}" title="${it.name}${it.qty > 1 ? ' ×' + it.qty : ''}">${it.qty > 1 ? `<span class="qty">${it.qty}</span>` : ''}</div>`);
      } else {
        slots.push('<div class="slot"></div>');
      }
    }
    chestBlock = `
      <div class="td-chest">
        <div class="td-chest-title">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS.chest}</svg>
          ${m.chestName || 'Contenedor'} · ${m.items.length} ítems
        </div>
        <div class="chest-grid">${slots.join('')}</div>
      </div>`;
  }

  $('#tile-detail-slot').innerHTML = `
    <div class="tile-detail">
      <div class="td-head">
        <span class="td-title">
          <span class="match-badge" style="width:24px;height:24px;color:${meta.color};background:color-mix(in oklch, ${meta.color} 16%, transparent)">${srcIconSvg(m.source)}</span>
          ${meta.label}
        </span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="coord mono">${m.x}, ${m.y}</span>
          <button class="td-close" id="td-close" aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
      </div>
      <div class="td-body">
        <div class="td-row"><span class="k">Ítem buscado</span><span class="v">${state.itemName}</span></div>
        <div class="td-row"><span class="k">Fuente</span><span class="v" style="color:${meta.color}">${meta.label}</span></div>
        ${m.chest != null ? `<div class="td-row"><span class="k">ID de cofre</span><span class="v">#${m.chest}</span></div>` : ''}
        <div class="td-row"><span class="k">Cantidad</span><span class="v">${m.stack || 1}</span></div>
        ${chestBlock}
      </div>
    </div>`;
  $('#td-close')?.addEventListener('click', clearTileDetail);
}
function clearTileDetail() { $('#tile-detail-slot').innerHTML = ''; }

/* ── NPC list ───────────────────────────────────────────────────────────── */
function renderNpcs() {
  $('#npc-list').innerHTML = NPCS.map((n) => `
    <button class="npc">
      <span class="npc-av">${n.emoji}</span>
      <span class="npc-name">${n.name}</span>
      <span class="npc-loc mono">${n.x}, ${n.y}</span>
    </button>`).join('');
}

/* ── Panels collapse ────────────────────────────────────────────────────── */
$$('.panel-head').forEach((h) =>
  h.addEventListener('click', () => h.closest('.panel').classList.toggle('collapsed')));

/* ── Toolbar: layers ────────────────────────────────────────────────────── */
$$('.layer-btn').forEach((b) =>
  b.addEventListener('click', () => {
    b.classList.toggle('active');
    if (b.dataset.layer === 'grid') $('#map-grid').hidden = !b.classList.contains('active');
  }));

/* ── Toolbar: mask / focus mode ─────────────────────────────────────────── */
$('#mask-toggle').addEventListener('click', () => {
  state.masked = !state.masked;
  $('#mask-toggle').classList.toggle('active', state.masked);
  $('#map-region').classList.toggle('masked', state.masked);
});

/* ── Toolbar: zoom ──────────────────────────────────────────────────────── */
function setZoom(z) {
  state.zoom = Math.max(25, Math.min(400, z));
  $('#zoom-val').textContent = state.zoom + '%';
  $('#world').style.transform = `scale(${1 + (state.zoom - 100) / 400})`;
}
$('#zoom-in').addEventListener('click', () => setZoom(state.zoom + 25));
$('#zoom-out').addEventListener('click', () => setZoom(state.zoom - 25));
$('#zoom-fit').addEventListener('click', () => setZoom(100));
$$('.hud-btn')[0].addEventListener('click', () => setZoom(state.zoom + 25));
$$('.hud-btn')[1].addEventListener('click', () => setZoom(state.zoom - 25));
$$('.hud-btn')[2].addEventListener('click', () => setZoom(100));

/* ── Export (demo toast) ────────────────────────────────────────────────── */
$('#export-btn').addEventListener('click', () => flashMapToast('Exportando vista actual a PNG…'));

/* ── Map toast ──────────────────────────────────────────────────────────── */
let mapToastT;
function flashMapToast(text) {
  const el = $('#map-toast');
  $('#map-toast-text').textContent = text;
  el.hidden = false;
  clearTimeout(mapToastT);
  mapToastT = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ── Global keyboard shortcuts ──────────────────────────────────────────── */
window.addEventListener('keydown', (e) => {
  if ($('#view-explorer').classList.contains('active') === false) return;
  const typing = e.target === input;
  if (e.key === 'Escape') { clearSearch(); input.blur(); return; }
  if (typing) return;
  if (e.key === '/') { e.preventDefault(); input.focus(); }
  else if (e.key === 'n') { e.preventDefault(); navMatch(1); }
  else if (e.key === 'p') { e.preventDefault(); navMatch(-1); }
});

/* Close autocomplete on outside click */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) ac.classList.remove('open');
});
