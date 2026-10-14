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
  autoLives: load('pf.autoLives', true) === true,
  twitchEconomy: load('pf.twitchEconomy', false) === true,
  kickEconomy: load('pf.kickEconomy', false) === true,
  gameChannels: normalizeGameChannels(load('pf.gameChannels', [])),
  ignoredGameChannels: load('pf.ignoredGameChannels', []),
  livePoll: [30, 60, 120, 300].includes(load('pf.livePoll', 60)) ? load('pf.livePoll', 60) : 60,
  tab: load('pf.tab', 'lives'),
  liveAccountFilter: load('pf.liveAccountFilter', 'all'),
  // Contas do Pokeidle: a primeira usa a sessão das lives (mantém o login que já existia)
  accounts: (() => {
    const list = load('pf.accounts', null);
    return Array.isArray(list) && list.length ? list : [{ id: 'main', name: 'Conta 1', main: true }];
  })(),
  gameAccount: load('pf.gameAccount', 'main'),
  frames: load('pf.frames', {}),      // id -> [x, y, largura, altura] em fração da área
  target: 'kick',
};
function persist() {
  save('pf.kick', S.kick); save('pf.twitch', S.twitch); save('pf.columns', S.columns);
  save('pf.showChat', S.showChat); save('pf.quality', S.quality); save('pf.tab', S.tab); save('pf.frames', S.frames);
  save('pf.accounts', S.accounts); save('pf.gameAccount', S.gameAccount);
  save('pf.liveAccountFilter', S.liveAccountFilter);
  save('pf.autoLives', S.autoLives); save('pf.livePoll', S.livePoll);
  save('pf.twitchEconomy', S.twitchEconomy);
  save('pf.kickEconomy', S.kickEconomy);
  save('pf.gameChannels', S.gameChannels);
  save('pf.ignoredGameChannels', S.ignoredGameChannels);
}

const PLAT = {
  kick: {
    title: 'Kick', color: 'var(--kick)', host: 'kick.com',
    player: (c) => `https://player.kick.com/${c}?autoplay=true&muted=true`,
    chat: (c) => `https://kick.com/popout/${c}/chat`,
  },
  twitch: {
    title: 'Twitch', color: 'var(--twitch)', host: 'www.twitch.tv',
    // Página completa: mantém o player e reaproveita o chat nativo do canal.
    player: (c) => `https://www.twitch.tv/${c}`,
    chat: (c) => `https://www.twitch.tv/popout/${c}/chat?popout=`,
  },
};

const all = () => [...S.kick.map((i) => ({ p: 'kick', i })), ...S.twitch.map((i) => ({ p: 'twitch', i }))];
const findItem = (id) => all().find((e) => e.i.id === id);

function normalizeGameChannels(rows) {
  const channels = new Map();
  if (!Array.isArray(rows)) return [];
  for (const row of rows.slice(0, 200)) {
    if (!row || !['kick', 'twitch'].includes(row.platform) || typeof row.channel !== 'string') continue;
    const channel = row.channel.trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/.test(channel)) continue;
    channels.set(`${row.platform}:${channel}`, { platform: row.platform, channel });
  }
  return [...channels.values()];
}

function receiveGameChannels(rows, fromAccountId) {
  const accId = fromAccountId || S.accounts[0]?.id || 'main';
  S.gameChannels = normalizeGameChannels([...S.gameChannels, ...normalizeGameChannels(rows)]);
  importGameChannels(accId);
  if (manualDiscoveryPending && all().length) void checkLivesNow();
}

function importGameChannels(targetAccountId) {
  let added = 0;
  const accId = targetAccountId || S.accounts[0]?.id || 'main';
  const ignored = new Set(S.ignoredGameChannels);
  for (const { platform, channel } of S.gameChannels) {
    if (ignored.has(`${platform}:${channel}`) || S[platform].some(item => item.channel === channel && (item.accountId || 'main') === accId)) continue;
    S[platform].push({ id: uid(), channel, muted: true, accountId: accId });
    added++;
  }
  syncTiles();
  if (added && S.autoLives && !liveRefreshing) scheduleLiveChecks();
}

/** Só letras, números, _ e - (o resto vira URL, então precisa ser seguro). */
function cleanChannel(raw) {
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.split(/[?#]/)[0];
  s = s.split('/').filter(Boolean).pop() || '';
  return /^[a-z0-9_-]{2,40}$/.test(s) ? s : null;
}

function addChannels(text) {
  const targetAccountId = (S.liveAccountFilter && S.liveAccountFilter !== 'all')
    ? S.liveAccountFilter
    : (S.accounts[0]?.id || 'main');
  for (const raw of String(text).split(/[,\s]+/)) {
    const c = cleanChannel(raw);
    if (!c) continue;
    const low = raw.toLowerCase();
    const p = low.includes('twitch.tv') ? 'twitch' : (low.includes('kick.com') ? 'kick' : S.target);
    S.ignoredGameChannels = S.ignoredGameChannels.filter(key => key !== `${p}:${c}`);
    // Trava estrita anti-duplicação por conta:
    if (S[p].some((x) => x.channel === c && (x.accountId || 'main') === targetAccountId)) continue;
    S[p].push({ id: uid(), channel: c, muted: true, accountId: targetAccountId });
    if (!S.autoLives) {
      const item = S[p].find(x => x.channel === c && (x.accountId || 'main') === targetAccountId);
      if (item) liveStates.set(item.id, nextLiveState(null, 'unknown', true));
    }
  }
  persist();
  syncTiles();
  scheduleLiveChecks();
}

// ---------------- WebViews ----------------

// Erros de rede do Chromium (sem internet, conexão caiu, DNS, timeout...)
const NET_ERRORS = new Set([-7, -21, -100, -101, -102, -103, -104, -105, -106, -109, -118, -130, -137]);

// Espaça o início das páginas das lives; tarefas removidas não ocupam um intervalo.
const loadQueue = [];
let loadTimer = null;
let lastPageLoad = -Infinity;
function enqueueLoad(job) {
  loadQueue.push(job);
  pumpLoadQueue();
}
function pumpLoadQueue() {
  if (loadTimer !== null || !loadQueue.length) return;
  loadTimer = setTimeout(() => {
    loadTimer = null;
    const job = loadQueue.shift();
    try { if (job()) lastPageLoad = performance.now(); } catch (_) { /* a página pode ter sido removida */ }
    pumpLoadQueue();
  }, Math.max(0, 1500 - (performance.now() - lastPageLoad)));
}

function makeWebview(src, opts = {}) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', opts.partition || PARTITION);
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
    setTimeout(() => {
      if (!wv.isConnected) return;
      try { wv.loadURL(e.validatedURL || wv.__pfSrc); } catch (_) { wv.src = wv.__pfSrc; }
    }, 30000);
  });
  if (opts.now) wv.src = src;
  else enqueueLoad(() => {
    if (!wv.isConnected || wv.getAttribute('src')) return false;
    wv.src = src;
    return true;
  });
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
  const accId = item.accountId || 'main';
  const acc = S.accounts.find(a => a.id === accId) || S.accounts[0];
  const accIdx = Math.max(0, S.accounts.findIndex(a => a.id === acc.id));
  const part = accountPartition(acc);
  const t = { stalls: 0, rect: null, sharedTwitch: p === 'twitch', chatFallbackTimer: null, accountId: accId };

  t.muteBtn = el('button', { onclick: () => toggleMute(id) });
  const profileTag = S.accounts.length > 1
    ? el('span', { class: `profile-badge acc-color-${accIdx % 4}`, text: `👤 ${acc.name || 'Conta'}` })
    : null;
  const followBtn = el('button', {
    class: 'btn-follow',
    title: `Seguir este canal com ${acc.name || 'Conta'}`,
    text: '♥',
    onclick: () => followStreamer(t, p),
  });

  const hdr = el('div', { class: 'hdr', 'data-drag': 'move', title: 'Arraste para mover o bloco' },
    el('span', { class: 'dot', style: `background:${P.color}` }),
    el('span', { class: 'name', text: item.channel }),
    profileTag,
    el('span', { class: 'sp' }),
    followBtn,
    t.muteBtn,
    el('button', { title: 'Recarregar', 'aria-label': 'Recarregar', text: '⟳', onclick: () => reloadTile(t) }),
    el('button', { title: 'Abrir no Edge', 'aria-label': 'Abrir no Edge', text: '🌐', onclick: () => window.pf.openEdge(`https://${P.host}/${item.channel}`) }),
    el('button', { title: 'Remover canal', 'aria-label': 'Remover canal', text: '✕', onclick: () => removeItem(id) }),
  );

  t.player = makeWebview(P.player(item.channel), {
    muted: item.muted,
    partition: part,
    onReady: (wv) => { applyMute(id); applyQuality(wv); applyChatMode(id); },
  });
  t.playerBox = el('div', { class: `player${t.sharedTwitch ? ' shared-twitch' : ''}` }, t.player, t.player.__skeleton);
  if (t.sharedTwitch) {
    t.chat = t.player;
    t.chatBox = t.playerBox;
    t.player.addEventListener('ipc-message', (e) => {
      if (!t.sharedTwitch) return;
      if (e.channel === 'chat-click') expandChat(id);
      if (e.channel === 'twitch-chat-ready') checkTwitchChat(id, e.args[0] === true);
    });
  } else attachSeparateChat(id, t, P.chat(item.channel), part);

  t.root = el('div', { class: 'tile' },
    hdr,
    t.playerBox,
    t.sharedTwitch ? null : t.chatBox,
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

function followStreamer(t, p) {
  if (!t.player || !t.player.__ready) {
    toast('Aguarde a live carregar para seguir');
    return;
  }
  if (p === 'twitch') {
    t.player.executeJavaScript(`
      (() => {
        const b = document.querySelector('button[data-a-target="follow-button"]');
        if (b && !b.disabled) { b.click(); return true; }
        if (document.querySelector('button[data-a-target="unfollow-button"]')) return 'already';
        return false;
      })()
    `).then((res) => {
      if (res === true) toast('✓ Canal seguido na Twitch!');
      else if (res === 'already') toast('Você já segue este canal na Twitch');
      else toast('Botão de seguir não encontrado. Conecte sua conta no menu Entrar.');
    }).catch(() => toast('Não foi possível seguir no momento'));
  } else {
    t.player.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(x => {
          const txt = (x.textContent || '').trim().toLowerCase();
          return (txt === 'follow' || txt === 'seguir') && !x.disabled;
        });
        if (b) { b.click(); return true; }
        return false;
      })()
    `).then((res) => {
      if (res === true) toast('✓ Canal seguido na Kick!');
      else toast('Botão de seguir não encontrado. Conecte sua conta no menu Entrar.');
    }).catch(() => toast('Não foi possível seguir no momento'));
  }
}

function reloadTile(t) {
  for (const wv of new Set([t.player, t.chat])) reloadWebview(wv);
}

function attachSeparateChat(id, t, url, part) {
  t.chat = makeWebview(url, { muted: true, partition: part || accountPartition(t.accountId), skeleton: 'chat', onReady: () => applyChatMode(id) });
  t.chatBox = el('div', { class: 'chat' }, t.chat, t.chat.__skeleton);
  t.chat.addEventListener('ipc-message', e => { if (e.channel === 'chat-click') expandChat(id); });
}

function checkTwitchChat(id, ready) {
  const t = tiles.get(id);
  if (!t?.sharedTwitch) return;
  if (ready) { clearTimeout(t.chatFallbackTimer); t.chatFallbackTimer = null; return; }
  if (t.chatFallbackTimer !== null) return;
  t.chatFallbackTimer = setTimeout(() => {
    t.chatFallbackTimer = null;
    if (tiles.get(id) !== t || !t.sharedTwitch) return;
    const wasExpanded = expandedChat === id;
    if (wasExpanded) collapseChat();
    t.sharedTwitch = false;
    t.playerBox.classList.remove('shared-twitch');
    t.player.executeJavaScript('window.__pfSetTwitchLayout && window.__pfSetTwitchLayout({enabled:false})').catch(() => {});
    attachSeparateChat(id, t, PLAT.twitch.chat(findItem(id).i.channel));
    t.playerBox.after(t.chatBox);
    if (wasExpanded) expandChat(id);
  }, 30000);
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
  const quality = S.kickEconomy && new URL(wv.__pfSrc).hostname === 'player.kick.com' ? 160 : Number(S.quality) || 0;
  wv.executeJavaScript(`window.__kmApplyQuality && window.__kmApplyQuality(${quality})`).catch(() => {});
}

function applyChatMode(id) {
  const t = tiles.get(id);
  if (!t?.chat.__ready) return;
  const compact = expandedChat !== id;
  const kickEconomy = findItem(id)?.p === 'kick' && S.kickEconomy && compact;
  if (t.sharedTwitch) {
    t.player.executeJavaScript(`window.__pfSetTwitchLayout && window.__pfSetTwitchLayout(${JSON.stringify({
      enabled: true, expanded: !compact, showChat: S.showChat,
    })})`).then(ready => checkTwitchChat(id, ready === true)).catch(() => checkTwitchChat(id, false));
    return;
  }
  t.chat.executeJavaScript(
    `window.__pfSetChatCompact && window.__pfSetChatCompact(${compact});` +
    `window.__pfSetKickEconomy && window.__pfSetKickEconomy(${kickEconomy});`,
  ).catch(() => {});
}

function toggleMute(id) {
  const e = findItem(id);
  if (!e) return;
  e.i.muted = !e.i.muted;
  persist();
  applyMute(id);
}

function removeItem(id) {
  const entry = findItem(id);
  if (entry) S.ignoredGameChannels = [...new Set([...S.ignoredGameChannels, `${entry.p}:${entry.i.channel}`])];
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
  applyChatMode(id);
  $('#chat-backdrop').hidden = false;
}

function collapseChat() {
  if (!expandedChat) return;
  const id = expandedChat;
  const t = tiles.get(id);
  expandedChat = null;
  $('#chat-backdrop').hidden = true;
  if (!t) return;
  t.chatBox.classList.remove('expanded');
  applyChatMode(id);
  t.root.style.zIndex = String(++zTop);
}

function syncTiles() {
  const grid = $('#grid');
  const saved = all();
  const ids = new Set(saved.map((e) => e.i.id));

  const filterAcc = S.liveAccountFilter || 'all';
  const open = saved.filter((e) => {
    if (filterAcc !== 'all' && (e.i.accountId || 'main') !== filterAcc) return false;
    return liveStates.get(e.i.id)?.open;
  });

  const visible = open.filter(e => !(S.twitchEconomy && e.p === 'twitch'));
  const visibleIds = new Set(visible.map((e) => e.i.id));
  for (const [id, t] of tiles) {
    if (!visibleIds.has(id)) {
      if (expandedChat === id) collapseChat();
      if (drag?.id === id) { drag = null; $('#shield').hidden = true; }
      clearTimeout(t.chatFallbackTimer);
      t.root.remove(); tiles.delete(id);
    }
  }
  // Fechar por estar offline preserva o tamanho/posição. Remover o canal apaga ambos.
  for (const id of Object.keys(S.frames)) if (!ids.has(id)) delete S.frames[id];
  for (const id of liveStates.keys()) if (!ids.has(id)) liveStates.delete(id);
  for (const e of visible) if (!tiles.has(e.i.id)) grid.append(createTile(e.p, e.i).root);
  syncTwitchEconomy(open.filter(e => e.p === 'twitch').map(e => e.i.channel));
  persist();
  layout();
  renderLiveControls();
  renderLiveAccountFilter();
}

function renderLiveAccountFilter() {
  const box = $('#live-account-filter');
  if (!box) return;
  if (S.accounts.length <= 1) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const saved = all();
  const filter = S.liveAccountFilter || 'all';
  const totalCount = saved.filter(e => liveStates.get(e.i.id)?.open).length;

  const allBtn = el('button', {
    class: filter === 'all' ? 'on' : '',
    text: `Todas (${totalCount})`,
    onclick: () => {
      S.liveAccountFilter = 'all';
      persist();
      syncTiles();
    },
  });

  const accButtons = S.accounts.map((a, idx) => {
    const count = saved.filter(e => (e.i.accountId || 'main') === a.id && liveStates.get(e.i.id)?.open).length;
    return el('button', {
      class: filter === a.id ? 'on' : '',
      text: `👤 ${a.name || 'Conta'} (${count})`,
      onclick: () => {
        S.liveAccountFilter = a.id;
        persist();
        syncTiles();
      },
    });
  });

  box.replaceChildren(allBtn, ...accButtons);
}

// ---------------- Monitoramento online/offline ----------------

// Uma única página substitui todos os vídeos e chats individuais da Twitch.
let economyView = null;
let economyURL = '';
function syncTwitchEconomy(channels) {
  const names = [...new Set(channels.filter(name => /^[a-z0-9_]{1,25}$/.test(name)))].sort();
  const selected = names.slice(0, 100);
  const url = S.twitchEconomy && selected.length
    ? `https://www.twitch.tv/popout/${selected[0]}/chat?pf-economy=1&pf-channels=${encodeURIComponent(selected.join(','))}` : '';
  $('#twitch-economy').checked = S.twitchEconomy;
  $('#kick-economy').checked = S.kickEconomy;
  $('#kick-economy-help').hidden = !S.kickEconomy;
  $('#twitch-economy-help').hidden = !S.twitchEconomy;
  $('#twitch-economy-reload').hidden = !url;
  $('#twitch-economy-status').dataset.total = String(names.length);
  if (url === economyURL) {
    if (!url) $('#twitch-economy-status').textContent = S.twitchEconomy ? 'Aguardando canais online' : '';
    return;
  }
  economyView?.remove(); economyView = null; economyURL = url;
  $('#twitch-economy-status').textContent = !S.twitchEconomy ? '' : !url ? 'Aguardando canais online' : 'Conectando ao chat…';
  if (!url) return;
  economyView = makeWebview(url, { muted: true });
  economyView.classList.add('twitch-economy-session');
  economyView.setAttribute('aria-hidden', 'true');
  document.body.append(economyView);
}
setInterval(async () => {
  const view = economyView;
  if (!view?.__ready || !view.isConnected) return;
  try {
    const state = await view.executeJavaScript('window.__pfTwitchEconomy || null');
    if (view !== economyView) return;
    const total = Number($('#twitch-economy-status').dataset.total);
    const limit = total > 100 ? ` · limite: 100 de ${total} canais` : '';
    $('#twitch-economy-status').textContent = !state?.connected ? 'Aguardando conexão com o chat…'
      : !state.authenticated ? 'Sem login — entre na Twitch e clique em Reconectar Twitch'
      : `${state.joined}/${state.requested} chats conectados · sem vídeo${limit}`;
  } catch (_) { /* a página pode estar recarregando */ }
}, 2000);

const liveStates = new Map();
let liveTimer = null;
let liveChecking = false;
let liveRefreshing = false;
let manualDiscoveryPending = false;
let liveGeneration = 0;

function scheduleLiveChecks() {
  clearTimeout(liveTimer);
  liveTimer = null;
  liveGeneration++;
  // A consulta atual termina antes da próxima; a geração descarta respostas antigas.
  if (S.autoLives && all().length && !liveChecking) liveTimer = setTimeout(checkLives, 0);
}

async function checkLivesNow() {
  if (liveChecking || liveRefreshing) return;
  liveRefreshing = true;
  manualDiscoveryPending = false;
  clearTimeout(liveTimer); liveTimer = null;
  renderLiveControls();
  try {
    if (game?.__ready) {
      const rows = await game.executeJavaScript('window.__pfReadGameChannels ? window.__pfReadGameChannels() : []');
      S.gameChannels = normalizeGameChannels([...S.gameChannels, ...normalizeGameChannels(rows)]);
    }
  } catch (_) { /* usa os canais já conhecidos se o jogo estiver recarregando */ }
  S.ignoredGameChannels = [];
  importGameChannels();
  liveRefreshing = false;
  if (!all().length) {
    manualDiscoveryPending = true;
    renderLiveControls();
    return;
  }
  await checkLives(true);
}

async function checkLives(manual = false) {
  clearTimeout(liveTimer);
  liveTimer = null;
  if ((!S.autoLives && !manual) || liveChecking || liveRefreshing || !all().length) return;
  liveChecking = true;
  const generation = liveGeneration;
  renderLiveControls();
  try {
    const items = all();
    const jobs = [];
    for (const p of ['kick', 'twitch']) {
      const platformItems = items.filter(item => item.p === p);
      const size = p === 'twitch' ? 30 : 1;
      for (let offset = 0; offset < platformItems.length; offset += size) {
        jobs.push({ p, items: platformItems.slice(offset, offset + size) });
      }
    }
    // Até quatro requisições em paralelo; cada consulta Twitch agrupa até 30 canais.
    for (let offset = 0; offset < jobs.length; offset += 4) {
      if (generation !== liveGeneration || (!S.autoLives && !manual)) break;
      await Promise.all(jobs.slice(offset, offset + 4).map(async ({ p, items: batch }) => {
        let statuses = {};
        try { statuses = await window.pf.liveStatus(p, batch.map(({ i }) => i.channel)); } catch (_) { /* mantém estado */ }
        if (generation !== liveGeneration || (!S.autoLives && !manual)) return;
        for (const { i } of batch) {
          if (!findItem(i.id)) continue;
          liveStates.set(i.id, nextLiveState(liveStates.get(i.id), statuses?.[i.channel], liveStates.get(i.id)?.open === true));
        }
      }));
      syncTiles();
    }
  } finally {
    liveChecking = false;
    renderLiveControls();
    if (S.autoLives && all().length) {
      liveTimer = setTimeout(checkLives, generation === liveGeneration ? S.livePoll * 1000 : 0);
    }
  }
}

function renderLiveControls() {
  const items = all();
  $('#auto-lives').checked = S.autoLives;
  $('#live-poll').value = String(S.livePoll);
  $('#check-lives').disabled = liveChecking || liveRefreshing;
  const unknown = items.filter(({ i }) => liveStates.get(i.id)?.status === 'unknown').length;
  const count = items.filter(e => liveStates.get(e.i.id)?.open).length;
  $('#live-summary').textContent = liveChecking || liveRefreshing ? 'Verificando canais…'
    : manualDiscoveryPending ? 'Abra o Pokeidle para carregar os canais'
      : `${S.autoLives ? '' : 'Automático desligado · '}${count} abertas${unknown ? ` · ${unknown} sem confirmação` : ''}`;
  $('#empty-title').textContent = items.length ? 'Nenhuma live aberta no momento'
    : 'Entre no Pokeidle para carregar os canais';
  $('#empty-detail').textContent = !items.length
    ? 'Os canais oficiais são reconhecidos pelo jogo. Use Verificar agora para abrir os online.'
    : unknown ? 'Não foi possível verificar alguns canais. Use Verificar agora para tentar novamente.'
      : S.autoLives ? 'As lives abrirão automaticamente quando os canais estiverem online.'
        : 'Clique em Verificar agora para trazer os canais online à tela.';
  if (economyView && !tiles.size) {
    $('#empty-title').textContent = 'Twitch em modo econômico';
    $('#empty-detail').textContent = 'Os canais usam o chat compartilhado. Acompanhe a conexão acima e os bônus na aba Pokeidle.';
  }
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
  let items = all().filter((e) => tiles.has(e.i.id));
  $('#empty').hidden = items.length > 0;
  const W = grid.clientWidth;
  const H = grid.clientHeight;
  if (!items.length || !W || !H) return;

  // Opção 1: No modo "Todas", pareia o mesmo streamer lado a lado (ex: biscoitao Ithaus, biscoitao MeuNegao)
  if (S.liveAccountFilter === 'all' || !S.liveAccountFilter) {
    items = [...items].sort((a, b) => {
      const cA = a.i.channel.toLowerCase();
      const cB = b.i.channel.toLowerCase();
      if (cA !== cB) return cA.localeCompare(cB);
      const accA = a.i.accountId || 'main';
      const accB = b.i.accountId || 'main';
      return accA.localeCompare(accB);
    });
  }

  // Se houver 2 contas e coluna em Auto, fixa 2 colunas para manter o pareamento perfeito lado a lado
  const defaultCols = S.accounts.length === 2 && (S.liveAccountFilter === 'all' || !S.liveAccountFilter) ? 2 : 0;
  const effectiveCols = S.columns > 0 ? S.columns : defaultCols;
  const cols = effectiveCols > 0 ? Math.min(effectiveCols, items.length) : autoColumns(items.length, W, H, 22 + (S.showChat ? 46 : 0));
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
// Aba que lê o mercado (a primeira conta: o mercado é o mesmo para todas)
let game = null;
const games = new Map();   // id da conta -> { pane, wv }

const accountPartition = (a) => (a.main ? PARTITION : `persist:pokefarm-acc-${a.id}`);
const currentAccount = () => S.accounts.find((a) => a.id === S.gameAccount) || S.accounts[0];

// Consultado somente pelo painel do tray, sem abrir as abas ou alterar o jogo.
window.__pfCollectSessions = async () => ({
  selected: S.gameAccount,
  accounts: await Promise.all(S.accounts.map(async account => {
    const page = games.get(account.id)?.wv;
    let data = { status: 'waiting' };
    try {
      if (page?.__ready && /(^|\.)pokeidle\.io$/.test(new URL(page.getURL()).hostname)) {
        let timer;
        try {
          data = await Promise.race([
            page.executeJavaScript('window.__pfReadSessionSummary ? window.__pfReadSessionSummary() : ({status: "waiting"})'),
            new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'waiting' }), 2000); }),
          ]);
        } finally { clearTimeout(timer); }
      }
    } catch (_) { /* carregamento, logout ou conta removida */ }
    return { id: account.id, name: account.name || 'Sem nome', data };
  })),
});

/** Cria/remove as abas do jogo para bater com a lista de contas. Todas ficam rodando. */
function setupGame() {
  for (const [id, g] of games) {
    if (!S.accounts.some((a) => a.id === id)) { g.pane.remove(); games.delete(id); }
  }
  S.accounts.forEach((a, i) => {
    const market = i === 0;
    const g = games.get(a.id);
    if (g && g.market === market) return;
    if (g) { g.pane.remove(); games.delete(a.id); }   // virou (ou deixou de ser) a aba do mercado
    const wv = makeWebview(GAME_URL, {
      muted: false,
      now: true,
      skeleton: 'game',
      partition: accountPartition(a),
      onReady: (w) => w.executeJavaScript(`window.__pfPoll = ${Number(M.poll) || 60}`).catch(() => {}),
    });
    wv.addEventListener('ipc-message', (e) => {
      if (e.channel === 'market' && market) onMarket(e.args[0]);
      if (e.channel === 'game-channels') {
        try {
          if (/(^|\.)pokeidle\.io$/.test(new URL(wv.getURL()).hostname)) receiveGameChannels(e.args[0], a.id);
        } catch (_) { /* a página já foi fechada/navegou */ }
      }
    });
    const pane = el('div', { class: 'game-pane', 'data-account': a.id }, wv, wv.__skeleton);
    $('#panel-game').append(pane);
    games.set(a.id, { pane, wv, market });
  });
  game = games.get(S.accounts[0].id)?.wv || null;
  if (!S.accounts.some((a) => a.id === S.gameAccount)) S.gameAccount = S.accounts[0].id;
  renderLiveAccountFilter();
}

function renderAccountTabs() {
  $('#account-tabs').replaceChildren(...S.accounts.map((a) => el('button', {
    class: 'acc', role: 'tab', 'data-tab': 'game', 'data-account': a.id, text: a.name || 'Sem nome', title: a.name || 'Sem nome',
    onclick: () => { S.gameAccount = a.id; setTab('game'); },
  })));
  renderLiveAccountFilter();
}

function addAccount() {
  let n = S.accounts.length + 1;
  while (S.accounts.some((a) => a.name === `Conta ${n}`)) n += 1;
  const a = { id: uid(), name: `Conta ${n}` };
  S.accounts.push(a);
  S.gameAccount = a.id;
  setupGame();
  renderAccountTabs();
  setTab('game');
}

async function removeAccount() {
  const a = currentAccount();
  if (!a || S.accounts.length <= 1) return;
  const msg = a.main
    ? `Remover "${a.name}"? A aba fecha. O login continua salvo, porque é o mesmo das lives.`
    : `Remover "${a.name}"? A aba fecha e o login desta conta no Pokeidle é apagado do app.`;
  if (!window.confirm(msg)) return;
  S.accounts = S.accounts.filter((x) => x.id !== a.id);
  S.gameAccount = S.accounts[0].id;
  setupGame();
  renderAccountTabs();
  setTab('game');
  // Espera a aba fechar antes de apagar o login
  if (!a.main) setTimeout(() => { window.pf.clearAccount(a.id).catch(() => {}); }, 2000);
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
  const acc = currentAccount();
  $$('#tabs button[data-tab]').forEach((b) => {
    const on = b.dataset.tab === tab && (tab !== 'game' || b.dataset.account === acc.id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  games.forEach((g, id) => g.pane.classList.toggle('on', id === acc.id));
  if (tab === 'game') {
    // Só reescreve se mudou (senão o cursor pula para o fim enquanto você digita)
    if ($('#account-name').value !== (acc.name || '')) $('#account-name').value = acc.name || '';
    $('#account-remove').disabled = S.accounts.length <= 1;
  }
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
  $('#auto-lives').addEventListener('change', (e) => {
    S.autoLives = e.target.checked;
    // A chave controla o monitoramento, sem abrir canais offline nem fechar a tela atual.
    if (S.autoLives) liveStates.forEach((state, id) => liveStates.set(id, nextLiveState(null, 'unknown', state.open)));
    persist(); syncTiles(); scheduleLiveChecks();
  });
  $('#live-poll').addEventListener('change', (e) => {
    S.livePoll = Number(e.target.value) || 60;
    persist(); scheduleLiveChecks();
  });
  $('#check-lives').addEventListener('click', () => { void checkLivesNow(); });
  $$('#tabs button[data-tab="lives"], #tabs button[data-tab="alerts"]')
    .forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#add-account').addEventListener('click', addAccount);
  $('#account-remove').addEventListener('click', () => { void removeAccount(); });
  $('#account-name').addEventListener('input', (e) => {
    const a = currentAccount();
    a.name = e.target.value.replace(/\s+/g, ' ').slice(0, 30);
    persist();
    renderAccountTabs();
    setTab('game');
  });
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
  chatBtn.addEventListener('click', () => { S.showChat = !S.showChat; persist(); paintChat(); layout(); tiles.forEach((_t, id) => applyChatMode(id)); });

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
  $('#reload-all').addEventListener('click', () => {
    tiles.forEach(reloadTile);
    if (economyView) reloadWebview(economyView);
  });
  $('#twitch-economy').addEventListener('change', e => { S.twitchEconomy = e.target.checked; syncTiles(); });
  $('#kick-economy').addEventListener('change', e => {
    S.kickEconomy = e.target.checked;
    persist();
    $('#kick-economy-help').hidden = !S.kickEconomy;
    for (const [id, t] of tiles) {
      if (findItem(id)?.p !== 'kick') continue;
      applyChatMode(id);
      if (!S.kickEconomy && !S.quality) reloadWebview(t.player);
      else applyQuality(t.player);
    }
  });
  $('#twitch-economy-reload').addEventListener('click', () => { if (economyView) reloadWebview(economyView); });

  $$('[data-login]').forEach((b) => b.addEventListener('click', () => window.pf.openLogin(b.dataset.login)));
  $$('[data-clear]').forEach((b) => b.addEventListener('click', () => {
    const w = b.dataset.clear;
    const removed = all().filter(e => w === 'all' || e.p === w).map(e => `${e.p}:${e.i.channel}`);
    S.ignoredGameChannels = [...new Set([...S.ignoredGameChannels, ...removed])];
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

  $('#game-reload').addEventListener('click', () => {
    const g = games.get(currentAccount().id);
    if (g) reloadWebview(g.wv);
  });
  $('#game-edge').addEventListener('click', () => window.pf.openEdge(GAME_URL));
  $('#game-login').addEventListener('click', () => {
    const a = currentAccount();
    window.pf.openGameLogin(a.main ? null : accountPartition(a));
    toast('Faça o login na janela que abriu. Depois clique em "Recarregar jogo".');
  });

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
renderLiveAccountFilter();
setTarget('kick');
setupGame();
renderAccountTabs();
importGameChannels();
scheduleLiveChecks();
setTab(S.tab);
renderAlerts();
