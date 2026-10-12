'use strict';
// PokeFarm — interface (abas, blocos de lives livres, jogo e alertas do mercado)

const PARTITION = 'persist:pokefarm';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  kids.flat().forEach((c) => { if (c != null) e.append(c); });
  return e;
}

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (_) { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

// ---------------- Estado ----------------

const S = {
  kick: load('pf.kick', []),
  twitch: load('pf.twitch', []),
  columns: load('pf.columns', 0),
  showChat: load('pf.showChat', true),
  quality: load('pf.quality', 160),   // altura máxima das lives (0 = automática)
  tab: load('pf.tab', 'lives'),
  frames: load('pf.frames', {}),      // id -> [x, y, largura, altura] em fração da área
  target: 'kick',
};
function persist() {
  save('pf.kick', S.kick); save('pf.twitch', S.twitch); save('pf.columns', S.columns);
  save('pf.showChat', S.showChat); save('pf.quality', S.quality); save('pf.tab', S.tab); save('pf.frames', S.frames);
}

const PLAT = {
  kick: {
    title: 'Kick', color: 'var(--kick)', host: 'kick.com',
    player: (c) => `https://player.kick.com/${c}?autoplay=true&muted=true`,
    chat: (c) => `https://kick.com/popout/${c}/chat`,
  },
  twitch: {
    title: 'Twitch', color: 'var(--twitch)', host: 'www.twitch.tv',
    // Página completa do canal (o player embutido não conta pontos); o preload deixa só o vídeo
    player: (c) => `https://www.twitch.tv/${c}`,
    chat: (c) => `https://www.twitch.tv/popout/${c}/chat?popout=`,
  },
};

const all = () => [...S.kick.map((i) => ({ p: 'kick', i })), ...S.twitch.map((i) => ({ p: 'twitch', i }))];
const findItem = (id) => all().find((e) => e.i.id === id);

/** Só letras, números, _ e - (o resto vira URL, então precisa ser seguro). */
function cleanChannel(raw) {
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.split(/[?#]/)[0];
  s = s.split('/').filter(Boolean).pop() || '';
  return /^[a-z0-9_-]{2,40}$/.test(s) ? s : null;
}

function addChannels(text) {
  for (const raw of String(text).split(/[,\s]+/)) {
    const c = cleanChannel(raw);
    if (!c) continue;
    const low = raw.toLowerCase();
    const p = low.includes('twitch.tv') ? 'twitch' : (low.includes('kick.com') ? 'kick' : S.target);
    if (!S[p].some((x) => x.channel === c)) S[p].push({ id: uid(), channel: c, muted: true });
  }
  persist();
  syncTiles();
}

// ---------------- WebViews ----------------

// Erros de rede do Chromium (sem internet, conexão caiu, DNS, timeout...)
const NET_ERRORS = new Set([-7, -21, -100, -101, -102, -103, -104, -105, -106, -109, -118, -130, -137]);

function makeWebview(src, opts = {}) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', PARTITION);
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'backgroundThrottling=no');
  wv.__pfSrc = src;
  wv.__ready = false;
  wv.__muted = opts.muted ?? false;
  // Skeleton por cima enquanto a página carrega (o chamador coloca ao lado da webview)
  wv.__skeleton = skeleton(opts.skeleton || 'video');
  wv.addEventListener('did-start-loading', () => wv.__skeleton.classList.remove('gone'));
  wv.addEventListener('did-stop-loading', () => setTimeout(() => {
    let loading = false;
    try { loading = wv.isLoading(); } catch (_) { /* ainda não anexada */ }
    if (!loading) wv.__skeleton.classList.add('gone');
  }, 800));
  wv.addEventListener('dom-ready', () => {
    wv.__ready = true;
    try { wv.setAudioMuted(wv.__muted); } catch (_) { /* ignora */ }
    if (opts.onReady) opts.onReady(wv);
  });
  // Página travou/morreu (comum em 24h rodando): recarrega
  wv.addEventListener('render-process-gone', () => setTimeout(() => reloadWebview(wv), 2000));
  wv.addEventListener('unresponsive', () => reloadWebview(wv));
  // Sem internet: tenta de novo em 30 s
  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || !NET_ERRORS.has(e.errorCode)) return;
    setTimeout(() => { try { wv.loadURL(e.validatedURL || wv.__pfSrc); } catch (_) { wv.src = wv.__pfSrc; } }, 30000);
  });
  wv.src = src;
  return wv;
}

/** Blocos cinza com brilho passando, no formato de cada tipo de página. */
function skeleton(style) {
  const b = (cls) => el('div', { class: `bone ${cls}` });
  const kids = {
    video: [b('screen'), b('play'), b('l1'), b('l2')],
    chat: [b('avatar'), b('bar'), b('btn')],
    game: [b('top'), ...Array.from({ length: 6 }, (_, i) => b(`side s${i}`)),
      el('div', { class: 'cards' }, ...Array.from({ length: 8 }, () => b('card')))],
  }[style] || [];
  return el('div', { class: `skeleton sk-${style}`, 'aria-hidden': 'true' }, ...kids);
}

function reloadWebview(wv) {
  if (!wv.isConnected) return;
  try { wv.__ready ? wv.reload() : (wv.src = wv.__pfSrc); } catch (_) { wv.src = wv.__pfSrc; }
}

// ---------------- Blocos das lives ----------------

const tiles = new Map();   // id -> { root, player, chat, muteBtn, rect, stalls }
let zTop = 10;

function createTile(p, item) {
  const P = PLAT[p];
  const id = item.id;
  const t = { stalls: 0, rect: null };

  t.muteBtn = el('button', { onclick: () => toggleMute(id) });
  const hdr = el('div', { class: 'hdr', 'data-drag': 'move', title: 'Arraste para mover o bloco' },
    el('span', { class: 'dot', style: `background:${P.color}` }),
    el('span', { class: 'name', text: item.channel }),
    el('span', { class: 'sp' }),
    t.muteBtn,
    el('button', { title: 'Recarregar', 'aria-label': 'Recarregar', text: '⟳', onclick: () => { reloadWebview(t.player); reloadWebview(t.chat); } }),
    el('button', { title: 'Abrir no Edge', 'aria-label': 'Abrir no Edge', text: '🌐', onclick: () => window.pf.openEdge(`https://${P.host}/${item.channel}`) }),
    el('button', { title: 'Fechar', 'aria-label': 'Fechar', text: '✕', onclick: () => removeItem(id) }),
  );

  t.player = makeWebview(P.player(item.channel), {
    muted: item.muted,
    onReady: (wv) => { applyMute(id); applyQuality(wv); },
  });
  t.chat = makeWebview(P.chat(item.channel), { muted: true, skeleton: 'chat' });
  t.chatBox = el('div', { class: 'chat' }, t.chat, t.chat.__skeleton);
  t.chat.addEventListener('ipc-message', (e) => { if (e.channel === 'chat-click') expandChat(id); });

  t.root = el('div', { class: 'tile' },
    hdr,
    el('div', { class: 'player' }, t.player, t.player.__skeleton),
    t.chatBox,
    el('div', { class: 'grip grip-r', 'data-drag': 'right', title: 'Arraste para mudar a largura' }),
    el('div', { class: 'grip grip-b', 'data-drag': 'bottom', title: 'Arraste para mudar a altura' }),
    el('div', { class: 'grip grip-c', 'data-drag': 'corner', title: 'Arraste para mudar largura e altura', text: '⤡' }),
  );
  t.root.addEventListener('pointerdown', (ev) => startDrag(ev, id));
  t.root.addEventListener('pointerdown', () => bringFront(id), true);
  tiles.set(id, t);
  applyMute(id);
  return t;
}

function applyMute(id) {
  const t = tiles.get(id);
  const e = findItem(id);
  if (!t || !e) return;
  const m = !!e.i.muted;
  t.muteBtn.textContent = m ? '🔇' : '🔊';
  t.muteBtn.title = m ? 'Ativar som' : 'Silenciar';
  t.muteBtn.setAttribute('aria-label', t.muteBtn.title);
  t.player.__muted = m;
  if (!t.player.__ready) return;
  try { t.player.setAudioMuted(m); } catch (_) { /* ignora */ }
  t.player.executeJavaScript(`window.__kmSetMuted && window.__kmSetMuted(${m})`).catch(() => {});
}

function applyQuality(wv) {
  if (!wv.__ready) return;
  wv.executeJavaScript(`window.__kmApplyQuality && window.__kmApplyQuality(${Number(S.quality) || 0})`).catch(() => {});
}

function toggleMute(id) {
  const e = findItem(id);
  if (!e) return;
  e.i.muted = !e.i.muted;
  persist();
  applyMute(id);
}

function removeItem(id) {
  S.kick = S.kick.filter((x) => x.id !== id);
  S.twitch = S.twitch.filter((x) => x.id !== id);
  persist();
  syncTiles();
}

function bringFront(id) {
  const t = tiles.get(id);
  if (t && expandedChat !== id) t.root.style.zIndex = String(++zTop);
}

// ---- Chat aberto inteiro (para resgatar pontos: o modal precisa de espaço) ----
// Só muda o CSS: o chat não recarrega ao abrir/fechar.

let expandedChat = null;

function expandChat(id) {
  if (expandedChat === id) return;
  collapseChat();
  const t = tiles.get(id);
  if (!t) return;
  expandedChat = id;
  t.root.style.zIndex = '9500';
  t.chatBox.classList.add('expanded');
  $('#chat-backdrop').hidden = false;
}

function collapseChat() {
  if (!expandedChat) return;
  const t = tiles.get(expandedChat);
  expandedChat = null;
  $('#chat-backdrop').hidden = true;
  if (!t) return;
  t.chatBox.classList.remove('expanded');
  t.root.style.zIndex = String(++zTop);
}

function syncTiles() {
  const grid = $('#grid');
  const ids = new Set(all().map((e) => e.i.id));
  for (const [id, t] of tiles) {
    if (!ids.has(id)) {
      if (expandedChat === id) collapseChat();
      t.root.remove(); tiles.delete(id); delete S.frames[id];
    }
  }
  for (const e of all()) if (!tiles.has(e.i.id)) grid.append(createTile(e.p, e.i).root);
  persist();
  layout();
}

/** Nº de colunas que deixa os vídeos maiores (16:9). */
function autoColumns(n, W, H, chrome) {
  if (n <= 1) return 1;
  let best = 1;
  let bestArea = -1;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const w = W / c;
    const h = H / r - chrome;
    if (h <= 0) continue;
    const vw = Math.min(w, (h * 16) / 9);
    if (vw * vw > bestArea) { bestArea = vw * vw; best = c; }
  }
  return best;
}

/** Posição de cada bloco: a livre (se o usuário já mexeu) ou a da grade. */
function layout() {
  const grid = $('#grid');
  grid.classList.toggle('nochat', !S.showChat);
  const items = all();
  $('#empty').hidden = items.length > 0;
  const W = grid.clientWidth;
  const H = grid.clientHeight;
  if (!items.length || !W || !H) return;
  const cols = S.columns > 0 ? Math.min(S.columns, items.length) : autoColumns(items.length, W, H, 22 + (S.showChat ? 46 : 0));
  const rows = Math.ceil(items.length / cols);
  const gap = 6;
  items.forEach((e, idx) => {
    const t = tiles.get(e.i.id);
    if (!t) return;
    const f = S.frames[e.i.id];
    let r;
    if (Array.isArray(f) && f.length === 4) {
      r = { x: f[0] * W, y: f[1] * H, w: f[2] * W, h: f[3] * H };
    } else {
      const w = W / cols;
      const h = H / rows;
      r = { x: (idx % cols) * w + gap / 2, y: Math.floor(idx / cols) * h + gap / 2, w: w - gap, h: h - gap };
    }
    t.rect = r;
    Object.assign(t.root.style, {
      left: `${r.x}px`, top: `${r.y}px`, width: `${Math.max(r.w, 10)}px`, height: `${Math.max(r.h, 10)}px`,
    });
  });
}

// ---- Arrastar/redimensionar um bloco sozinho ----

const MIN_W = 180;
const MIN_H = 120;
let drag = null;

function startDrag(ev, id) {
  const handle = ev.target.closest('[data-drag]');
  if (!handle || ev.button !== 0 || ev.target.closest('button')) return;
  const t = tiles.get(id);
  if (!t || !t.rect) return;
  ev.preventDefault();
  drag = { id, kind: handle.dataset.drag, x0: ev.clientX, y0: ev.clientY, r0: { ...t.rect } };
  const shield = $('#shield');
  shield.style.cursor = { move: 'grabbing', right: 'ew-resize', bottom: 'ns-resize', corner: 'nwse-resize' }[drag.kind];
  shield.hidden = false;
}

window.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const grid = $('#grid');
  const W = grid.clientWidth;
  const H = grid.clientHeight;
  const dx = ev.clientX - drag.x0;
  const dy = ev.clientY - drag.y0;
  const r = { ...drag.r0 };
  if (drag.kind === 'move') { r.x += dx; r.y += dy; }
  if (drag.kind === 'right' || drag.kind === 'corner') r.w += dx;
  if (drag.kind === 'bottom' || drag.kind === 'corner') r.h += dy;
  const snap = (v) => Math.round(v / 8) * 8;   // encaixa de 8 em 8 px
  r.w = Math.min(Math.max(snap(r.w), MIN_W), W);
  r.h = Math.min(Math.max(snap(r.h), MIN_H), H);
  r.x = Math.min(Math.max(snap(r.x), 0), W - r.w);
  r.y = Math.min(Math.max(snap(r.y), 0), H - r.h);
  S.frames[drag.id] = [r.x / W, r.y / H, r.w / W, r.h / H];
  layout();
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  drag = null;
  $('#shield').hidden = true;
  persist();
});

new ResizeObserver(() => layout()).observe($('#grid'));

// Vigia: se o vídeo de uma live ficar ~3 min parado ou travado, recarrega
setInterval(() => {
  for (const t of tiles.values()) {
    if (!t.player.__ready) continue;
    t.player.executeJavaScript(
      // Tocando de verdade = não pausado E o tempo do vídeo andou desde a última checagem
      '(function(){var v=document.querySelector("video");if(!v||v.paused||v.readyState<2)return false;' +
      'var t=v.currentTime,ok=window.__kmLastT!==t;window.__kmLastT=t;return ok;})()',
    ).then((ok) => {
      if (ok) { t.stalls = 0; return; }
      t.stalls += 1;
      if (t.stalls >= 3) { t.stalls = 0; reloadWebview(t.player); }
    }).catch(() => {});
  }
}, 60000);

// ---------------- Jogo ----------------

const GAME_URL = 'https://pokeidle.io/app';
let game = null;

function setupGame() {
  game = makeWebview(GAME_URL, {
    muted: false,
    skeleton: 'game',
    onReady: (wv) => wv.executeJavaScript(`window.__pfPoll = ${Number(M.poll) || 60}`).catch(() => {}),
  });
  game.addEventListener('ipc-message', (e) => { if (e.channel === 'market') onMarket(e.args[0]); });
  $('#panel-game').append(game, game.__skeleton);
}

// ---------------- Alertas do mercado ----------------

function parseAmount(raw) {
  let s = String(raw || '').trim().toUpperCase().replace(/\s/g, '');
  if (!s) return null;
  let m = 1;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[s.slice(-1)];
  if (mult) { m = mult; s = s.slice(0, -1); }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // 6.039.587
  s = s.replace(',', '.');                                         // 4,4
  const v = Number(s);
  return s !== '' && Number.isFinite(v) && v > 0 ? v * m : null;
}

function fmt(v) {
  const f = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','));
  if (v >= 1e9) return `${f(v / 1e9)}B`;
  if (v >= 1e6) return `${f(v / 1e6)}M`;
  if (v >= 1e3) return `${f(v / 1e3)}K`;
  return f(v);
}

const curLabel = (c) => (c === 'gems' ? 'gemas' : 'coins');
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const M = {
  rules: load('pf.rules', []),
  hits: load('pf.hits', []),
  enabled: load('pf.alertsOn', true),
  poll: load('pf.poll', 60),
  seen: [],
  totalSeen: 0,
  lastCapture: null,
  endpoints: [],
  alerted: new Set(),
  history: {},   // "nome|moeda" -> últimos preços
  samples: {},
};
const saveRules = () => save('pf.rules', M.rules);
const saveHits = () => save('pf.hits', M.hits);

function ruleSummary(r) {
  const p = [r.name ? r.name : 'Qualquer um'];
  if (r.shinyOnly) p.push('só shiny');
  if (r.maxCoins) p.push(`≤ ${fmt(r.maxCoins)} coins`);
  if (r.maxGems) p.push(`≤ ${fmt(r.maxGems)} gemas`);
  if (r.belowAvg) p.push(`${r.belowAvg}% abaixo da média`);
  return p.join(' · ');
}

function average(item) {
  const h = M.history[`${norm(item.name)}|${item.currency}`] || [];
  return h.length >= 5 ? h.reduce((a, b) => a + b, 0) / h.length : null;
}

function matches(r, item, avg) {
  if (!r.enabled) return false;
  if (r.name && !norm(item.name).includes(norm(r.name))) return false;
  if (r.shinyOnly && !item.shiny) return false;
  if (!r.maxCoins && !r.maxGems && !r.belowAvg) return true;
  if (item.currency === 'coins' && r.maxCoins && item.price <= r.maxCoins) return true;
  if (item.currency === 'gems' && r.maxGems && item.price <= r.maxGems) return true;
  if (r.belowAvg && avg != null && item.price <= avg * (1 - r.belowAvg / 100)) return true;
  return false;
}

function onMarket(msg) {
  if (!msg || typeof msg !== 'object') return;
  const url = typeof msg.url === 'string' ? msg.url.slice(0, 500) : 'dom';
  if (url !== 'dom' && typeof msg.sample === 'string') {
    const n = M.samples[url] || 0;
    if (n < 3) { M.samples[url] = n + 1; window.pf.writeSample(url, msg.sample); }
  }
  if (url !== 'dom' && !M.endpoints.includes(url)) M.endpoints = [...M.endpoints, url].slice(-10);
  M.lastCapture = new Date();

  const items = (Array.isArray(msg.items) ? msg.items : []).slice(0, 2000).map((d) => ({
    name: typeof d.name === 'string' ? d.name.slice(0, 80) : '',
    price: Number(d.price),
    currency: d.currency === 'gems' ? 'gems' : 'coins',
    shiny: d.shiny === true,
    id: d.id != null ? String(d.id).slice(0, 80) : null,
    source: url === 'dom' ? 'tela' : 'rede',
  })).filter((i) => i.name && Number.isFinite(i.price) && i.price > 0);

  if (items.length) processItems(items);
  renderAlerts();
}

function processItems(items) {
  M.totalSeen += items.length;
  const now = Date.now();
  M.seen = [...items.map((item) => ({ date: now, item })), ...M.seen].slice(0, 60);

  for (const item of items) {
    const avg = average(item);   // média antes de incluir este preço
    const hKey = `${norm(item.name)}|${item.currency}`;
    M.history[hKey] = [...(M.history[hKey] || []), item.price].slice(-50);

    if (!M.enabled) continue;
    const rule = M.rules.find((r) => matches(r, item, avg));
    if (!rule) continue;
    // Mesmo anúncio/preço só alerta uma vez
    const key = `${item.id || '-'}|${hKey}|${item.price}`;
    if (M.alerted.has(key)) continue;
    if (M.alerted.size > 20000) M.alerted.clear();
    M.alerted.add(key);

    const summary = ruleSummary(rule);
    M.hits.unshift({ date: now, name: item.name, price: item.price, currency: item.currency, shiny: item.shiny, rule: summary, average: avg });
    if (M.hits.length > 300) M.hits.length = 300;
    saveHits();

    let body = `${fmt(item.price)} ${curLabel(item.currency)}`;
    if (avg != null) body += ` (média ${fmt(avg)})`;
    body += ` · regra: ${summary}`;
    window.pf.notify(`${item.shiny ? '✨ ' : ''}${item.name} no mercado`, body);
    window.pf.attention();
  }
}

const fmtDate = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function renderAlerts() {
  $('#alerts-on').checked = !!M.enabled;
  $('#poll').value = String(M.poll);
  $('#market-status').textContent = M.lastCapture
    ? `Última leitura do mercado: ${M.lastCapture.toLocaleTimeString('pt-BR')} · ${M.totalSeen} anúncios lidos · ${M.endpoints.length} fonte(s) de rede`
    : 'Ainda não li o mercado. Abra o Market (Community Market) no jogo uma vez para o app aprender de onde vêm os anúncios.';

  const rules = $('#rules');
  rules.replaceChildren(...(M.rules.length ? M.rules.map((r) => el('li', {},
    el('input', { type: 'checkbox', checked: r.enabled, 'aria-label': 'Regra ligada', onchange: (e) => { r.enabled = e.target.checked; saveRules(); } }),
    el('span', { class: 'grow', text: ruleSummary(r) }),
    el('button', { text: '🗑', title: 'Apagar regra', 'aria-label': 'Apagar regra', onclick: () => { M.rules = M.rules.filter((x) => x.id !== r.id); saveRules(); renderAlerts(); } }),
  )) : [el('li', { class: 'empty', text: 'Nenhuma regra ainda' })]));

  $('#seen').replaceChildren(...(M.seen.length ? M.seen.map((s) => el('li', {},
    el('span', { class: 'grow', text: s.item.shiny ? `✨ ${s.item.name}` : s.item.name }),
    el('span', { class: 'num', text: `${fmt(s.item.price)} ${curLabel(s.item.currency)}` }),
    el('span', { class: 'muted small', text: s.item.source }),
  )) : [el('li', { class: 'empty', text: 'Nada lido ainda' })]));

  $('#hits').replaceChildren(...(M.hits.length ? M.hits.map((h) => el('li', { class: 'hit' },
    el('div', { class: 'row' },
      el('strong', { class: 'grow', text: h.shiny ? `✨ ${h.name}` : h.name }),
      el('span', { class: 'num', text: `${fmt(h.price)} ${curLabel(h.currency)}` })),
    el('div', { class: 'muted small', text: `${fmtDate(h.date)} · ${h.rule}${h.average != null ? ` · média ${fmt(h.average)}` : ''}` }),
  )) : [el('li', { class: 'empty', text: 'Nada ainda. Quando um anúncio bater numa regra, aparece aqui e como notificação.' })]));
}

function addRule() {
  const below = Number($('#r-below').value) || 0;
  M.rules.push({
    id: uid(),
    name: $('#r-name').value.trim().slice(0, 60),
    maxCoins: parseAmount($('#r-coins').value),
    maxGems: parseAmount($('#r-gems').value),
    belowAvg: below > 0 ? below : null,
    shinyOnly: $('#r-shiny').checked,
    enabled: true,
  });
  saveRules();
  $('#r-name').value = ''; $('#r-coins').value = ''; $('#r-gems').value = '';
  $('#r-below').value = '0'; $('#r-shiny').checked = false;
  renderAlerts();
}

// ---------------- Barra e abas ----------------

function setTab(tab) {
  if (!['lives', 'game', 'alerts'].includes(tab)) tab = 'lives';
  S.tab = tab;
  persist();
  $$('#tabs button').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('#panel-lives').classList.toggle('active', tab === 'lives');
  $('#panel-game').classList.toggle('active', tab === 'game');
  $('#panel-alerts').classList.toggle('active', tab === 'alerts');
  $('#bar-lives').hidden = tab !== 'lives';
  $('#bar-game').hidden = tab !== 'game';
  $('#bar-alerts').hidden = tab !== 'alerts';
  if (tab === 'alerts') renderAlerts();
  if (tab === 'lives') layout();
}

function setTarget(p) {
  S.target = p;
  $$('#target button').forEach((b) => b.classList.toggle('on', b.dataset.target === p));
}

function setupBar() {
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $$('#target button').forEach((b) => b.addEventListener('click', () => setTarget(b.dataset.target)));

  const input = $('#channel-input');
  const add = () => { addChannels(input.value); input.value = ''; };
  $('#add-btn').addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  const cols = $('#columns');
  cols.append(el('option', { value: '0', text: 'Auto' }));
  for (let i = 1; i <= 8; i++) cols.append(el('option', { value: String(i), text: String(i) }));
  cols.value = String(S.columns);
  cols.addEventListener('change', () => { S.columns = Number(cols.value) || 0; persist(); layout(); });

  $('#reset-layout').addEventListener('click', () => { S.frames = {}; persist(); layout(); });

  const chatBtn = $('#chat-toggle');
  const paintChat = () => chatBtn.classList.toggle('on', S.showChat);
  paintChat();
  chatBtn.addEventListener('click', () => { S.showChat = !S.showChat; persist(); paintChat(); layout(); });

  const quality = $('#quality');
  quality.value = String(S.quality);
  quality.addEventListener('change', () => {
    S.quality = Number(quality.value) || 0;
    persist();
    tiles.forEach((t) => {
      // Kick no automático: recarrega para o player voltar a escolher sozinho
      if (!S.quality && /player\.kick\.com/.test(t.player.__pfSrc)) reloadWebview(t.player);
      else applyQuality(t.player);
    });
  });

  $('#mute-all').addEventListener('click', () => {
    all().forEach((e) => { e.i.muted = true; });
    persist();
    tiles.forEach((_t, id) => applyMute(id));
  });
  $('#reload-all').addEventListener('click', () => tiles.forEach((t) => { reloadWebview(t.player); reloadWebview(t.chat); }));

  $$('[data-login]').forEach((b) => b.addEventListener('click', () => window.pf.openLogin(b.dataset.login)));
  $$('[data-clear]').forEach((b) => b.addEventListener('click', () => {
    const w = b.dataset.clear;
    if (w === 'kick' || w === 'all') S.kick = [];
    if (w === 'twitch' || w === 'all') S.twitch = [];
    syncTiles();
  }));

  // Menus suspensos
  $$('.menu').forEach((m) => $('.menu-btn', m).addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !m.classList.contains('open');
    $$('.menu').forEach((x) => x.classList.remove('open'));
    m.classList.toggle('open', open);
  }));
  document.addEventListener('click', () => $$('.menu').forEach((x) => x.classList.remove('open')));

  $('#game-reload').addEventListener('click', () => game && reloadWebview(game));
  $('#game-edge').addEventListener('click', () => window.pf.openEdge(GAME_URL));

  $('#alerts-on').addEventListener('change', (e) => { M.enabled = e.target.checked; save('pf.alertsOn', M.enabled); });
  $('#poll').addEventListener('change', (e) => {
    M.poll = Number(e.target.value) || 60;
    save('pf.poll', M.poll);
    if (game && game.__ready) game.executeJavaScript(`window.__pfPoll = ${M.poll}`).catch(() => {});
  });
  $('#test-notif').addEventListener('click', () => window.pf.notify('PokeFarm', 'Teste de alerta: notificações funcionando.'));
  $('#open-samples').addEventListener('click', () => window.pf.openDataDir());
  $('#r-add').addEventListener('click', addRule);
  $('#r-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addRule(); });
  $('#hits-clear').addEventListener('click', () => { M.hits = []; saveHits(); renderAlerts(); });

  window.pf.onOpenTab((tab) => setTab(tab));
  // Link de live clicado no jogo: vira bloco na aba Lives (o jogo continua aberto)
  window.pf.onAddLive(addFromGame);

  $('#chat-backdrop').addEventListener('click', collapseChat);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') collapseChat(); });
}

// ---------------- Link de live clicado no jogo ----------------

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

/** Vira bloco na aba Lives; o jogo continua aberto. */
function addFromGame(link) {
  const name = link.split('/').pop();
  const plat = link.includes('twitch.tv') ? 'Twitch' : 'Kick';
  const before = all().length;
  addChannels(link);
  toast(all().length > before ? `✓ ${name} (${plat}) adicionado às Lives` : `${name} já está nas Lives`);
}

// ---------------- Início ----------------

setupBar();
setTarget('kick');
setupGame();
syncTiles();
setTab(S.tab);
renderAlerts();
