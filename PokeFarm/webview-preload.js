'use strict';
// Preload de todas as <webview> (lives, chats e jogo).
// Roda isolado da página; os scripts abaixo são injetados no "mundo" da página antes dela carregar.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

function inject(fn, ...args) {
  try {
    if (contextBridge.executeInMainWorld) {
      contextBridge.executeInMainWorld({ func: fn, args });
      return;
    }
  } catch (_) { /* cai no plano B */ }
  webFrame.executeJavaScript(`(${fn.toString()}).apply(null, ${JSON.stringify(args)})`).catch(() => {});
}

// ---------- Scripts injetados na página ----------

/** Página sempre "visível" e com foco: tela bloqueada/janela minimizada não pausa nada. */
function keepAlive() {
  try {
    const def = (k, v) => Object.defineProperty(document, k, { get: () => v, configurable: true });
    def('hidden', false);
    def('visibilityState', 'visible');
    def('webkitHidden', false);
    def('webkitVisibilityState', 'visible');
    document.hasFocus = () => true;
    ['visibilitychange', 'webkitvisibilitychange'].forEach((ev) =>
      document.addEventListener(ev, (e) => e.stopImmediatePropagation(), true));
    ['blur', 'pagehide', 'freeze'].forEach((ev) =>
      window.addEventListener(ev, (e) => e.stopImmediatePropagation(), true));
  } catch (_) { /* ignora */ }
}

/** Player: mudo por padrão, volta a tocar se parar, Twitch em 160p e só o vídeo na tela. */
function player() {
  window.__kmMuted = true;
  window.__kmSetMuted = (m) => {
    window.__kmMuted = m;
    document.querySelectorAll('video').forEach((v) => { v.muted = m; if (!m) v.volume = 1; });
  };
  setInterval(() => {
    document.querySelectorAll('video').forEach((v) => {
      if (window.__kmMuted && !v.muted) v.muted = true;
      if (v.paused && !v.ended) v.play().catch(() => {});
    });
  }, 3000);

  // Qualidade (altura máxima, 0 = automática). O app chama isto ao carregar e ao trocar.
  let kickTimer = null;
  window.__kmApplyQuality = (q) => {
    q = Number(q) || 0;
    if (location.hostname === 'www.twitch.tv') {
      // A Twitch só lê a preferência ao abrir o player: se mudou, recarrega a página
      const want = q ? JSON.stringify({ default: `${q}p30` }) : null;
      const had = localStorage.getItem('video-quality');
      if (want) localStorage.setItem('video-quality', want); else localStorage.removeItem('video-quality');
      if (had !== want) location.reload();
      return;
    }
    if (location.hostname === 'player.kick.com' && window.__pfApplyKickQuality) {
      clearInterval(kickTimer);
      window.__pfApplyKickQuality(q);
      return;
    }
    if (location.hostname !== 'player.kick.com' || !q) return;
    // Kick: abre o menu de qualidade e escolhe a maior opção que não passe do limite (ou a menor)
    clearInterval(kickTimer);
    let tries = 0;
    kickTimer = setInterval(() => {
      if (++tries > 20) { clearInterval(kickTimer); return; }
      const opts = Array.from(document.querySelectorAll('[role="menuitemradio"],[role="menuitem"],[role="option"],li,button'))
        .filter((e) => { const t = (e.textContent || '').trim(); return /^\d{3,4}p/.test(t) && t.length < 20; });
      if (!opts.length) {
        const s = document.querySelector('button[aria-label*="setting" i],button[aria-label*="configura" i],' +
          'button[aria-label*="quality" i],button[aria-label*="qualidade" i]');
        if (s) s.click();
        return;
      }
      let best = null; let bh = 0; let low = null; let lh = 1e9;
      opts.forEach((e) => {
        const h = parseInt((e.textContent || '').trim(), 10);
        if (h <= q && h > bh) { best = e; bh = h; }
        if (h < lh) { low = e; lh = h; }
      });
      (best || low).click();
      clearInterval(kickTimer);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }, 4000);
  };

  // Player da Kick: ele pausa sozinho (ociosidade, "aba inativa", aviso de HD).
  // Só deixa pausar se foi você que clicou; se pausar mesmo assim, aperta play de novo.
  if (location.hostname === 'player.kick.com') {
    let user = 0;
    const touch = () => { user = Date.now(); };
    document.addEventListener('pointerdown', touch, true);
    document.addEventListener('keydown', touch, true);
    const origPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () {
      if (Date.now() - user < 1500) return origPause.apply(this, arguments);
      return undefined;
    };
    setInterval(() => {
      const v = document.querySelector('video');
      if (!v || !v.paused || v.ended || Date.now() - user < 10000) return;
      const btn = document.querySelector('button[aria-label*="play" i], button[aria-label*="reproduzir" i], [data-testid*="play" i]');
      if (btn) btn.click();
      if (window.__kmMuted !== false) v.muted = true;
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    }, 3000);
  }

  if (location.hostname !== 'www.twitch.tv') return;
  try {
    localStorage.setItem('video-muted', JSON.stringify({ default: true }));
    localStorage.setItem('mature', 'true');
  } catch (_) { /* ignora */ }
  const css =
    'html,body{background:#000!important;overflow:hidden!important}' +
    '.km-player{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;' +
    'max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;' +
    'z-index:2147483646!important;background:#000!important}' +
    '.km-player video{width:100%!important;height:100%!important;object-fit:contain!important}' +
    '.km-unclip{transform:none!important;contain:none!important;filter:none!important;will-change:auto!important}' +
    '.consent-banner,[data-a-target="consent-banner"]{display:none!important}';
  const addCSS = () => {
    if (document.getElementById('km-css')) return;
    const st = document.createElement('style');
    st.id = 'km-css';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  };
  document.addEventListener('DOMContentLoaded', addCSS);
  setInterval(() => {
    addCSS();
    // Aviso "Destinado a públicos específicos"
    let gate = document.querySelector(
      'button[data-a-target="content-classification-gate-overlay-start-watching-button"],' +
      'button[data-a-target="player-overlay-mature-accept"]');
    if (!gate) {
      gate = Array.from(document.querySelectorAll('button'))
        .find((b) => /começar a assistir|start watching/i.test(b.textContent || ''));
    }
    if (gate) gate.click();
    // Prende o container do <video> real na tela inteira
    const v = document.querySelector('video');
    if (!v) { window.__pfRefreshTwitchLayout?.(); return; }
    const box = v.closest('[data-a-target="video-player"]') || v.closest('.video-player') ||
      v.closest('.video-player__container') || v.parentElement;
    if (box && !box.classList.contains('km-player')) {
      document.querySelectorAll('.km-player').forEach((e) => e.classList.remove('km-player'));
      box.classList.add('km-player');
    }
    for (let a = box && box.parentElement; a && a !== document.body; a = a.parentElement) a.classList.add('km-unclip');
    window.__pfRefreshTwitchLayout?.();
  }, 1500);
}

/** Chat da Twitch: clica sozinho no bônus de pontos. */
function twitchChat() {
  setInterval(() => {
    if (!/\/popout\//.test(location.pathname) && !document.documentElement.classList.contains('pf-twitch-shared')) return;
    const icon = document.querySelector('.claimable-bonus__icon');
    const b = icon ? icon.closest('button')
      : document.querySelector('button[aria-label="Claim Bonus"], button[aria-label="Resgatar bônus"]');
    if (b) b.click();
  }, 5000);
}

/** Usa o chat já conectado na página do canal; só altera a apresentação. */
function twitchLayout() {
  let state = { enabled: false, expanded: false, showChat: true };
  let lastReady;
  const changed = new Map();
  const style = (node, values) => {
    if (!node) return;
    if (!changed.has(node)) changed.set(node, new Map());
    const original = changed.get(node);
    for (const [key, value] of Object.entries(values)) {
      if (!original.has(key)) original.set(key, [node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]);
      if (node.style.getPropertyValue(key) !== value || node.style.getPropertyPriority(key) !== 'important') node.style.setProperty(key, value, 'important');
    }
  };
  const unclip = node => {
    for (let p = node?.parentElement; p && p !== document.body; p = p.parentElement) style(p, {
      transform: 'none', contain: 'none', filter: 'none', 'will-change': 'auto',
      overflow: 'visible', 'z-index': 'auto', isolation: 'auto',
    });
  };
  const apply = () => {
    const root = document.documentElement;
    if (!root) return false;
    for (const node of changed.keys()) if (!node.isConnected) changed.delete(node);
    root.classList.toggle('pf-twitch-shared', state.enabled);
    root.classList.toggle('pf-twitch-points', state.enabled && state.showChat);
    window.__pfSetChatCompact?.(!state.expanded || !state.enabled);
    if (!state.enabled) return false;
    // A preferência salva da Twitch pode deixar o chat montado, mas com display:none.
    // Abre pelo controle nativo para preservar a conexão e o estado da própria página.
    if (document.querySelector('.right-column--collapsed')) {
      document.querySelector('[data-a-target="right-column__toggle-collapse-btn"]')?.click();
    }
    const chat = document.querySelector('.chat-shell');
    const ready = !!chat?.querySelector('.chat-room')?.getClientRects().length;
    if (ready !== lastReady) { lastReady = ready; window.postMessage({ __pfTwitchChatReady: ready }, '*'); }
    if (!ready) return false;
    unclip(chat);
    style(chat, {position:'fixed',left:'0px',right:'auto',bottom:'0px',top:state.expanded?'180px':'auto',
      width:'100vw',height:state.expanded?'calc(100vh - 180px)':'420px','max-height':'none',
      'z-index':state.expanded?'2147483647':'2147483645'});
    const box = document.querySelector('.km-player');
    unclip(box);
    style(box, {top:'0px',left:'0px',right:'auto',bottom:'auto',width:'100vw',
      height:state.expanded?'180px':state.showChat?'calc(100vh - 46px)':'100vh',
      'min-height':'0px','max-height':'none','z-index':'2147483646'});
    style(box?.querySelector('.video-player__container'), {height:'100%','max-height':'none','min-height':'0px'});
    // Avisos/anúncios podem aumentar o conteúdo mínimo do chat. Mantém o rodapé
    // dentro da faixa, mesmo enquanto a Twitch reorganiza esses elementos.
    const footer = chat.querySelector('.chat-input__buttons-container, .community-points-summary');
    const overflow = footer ? Math.ceil(Math.max(0, footer.getBoundingClientRect().bottom - innerHeight)) : 0;
    if (overflow) style(chat, state.expanded
      ? { height: `calc(100vh - ${180 + overflow}px)` }
      : { bottom: `${overflow}px` });
    return true;
  };
  window.__pfRefreshTwitchLayout = apply;
  window.__pfSetTwitchLayout = options => {
    state = { ...state, ...options };
    if (!state.enabled) {
      for (const [node, properties] of changed) for (const [key, [value, priority]] of properties) {
        if (value) node.style.setProperty(key, value, priority); else node.style.removeProperty(key);
      }
      changed.clear();
    }
    return apply();
  };
}

/** A faixa mostra só os pontos: não desenha as mensagens que ficam fora dela. */
function compactChat() {
  let compact = true;
  const apply = () => {
    document.documentElement?.classList.toggle('pf-chat-compact', compact);
    if (document.getElementById('pf-chat-compact-css')) return;
    const style = document.createElement('style');
    style.id = 'pf-chat-compact-css';
    // Não remove nós nem filtra mensagens. Ao expandir, o histórico e os eventos
    // recebidos continuam disponíveis; controles de pontos ficam fora dessas listas.
    style.textContent = '.pf-chat-compact .chat-scrollable-area__message-container,' +
      '.pf-chat-compact #chatroom-messages{content-visibility:hidden!important;visibility:hidden!important}';
    (document.head || document.documentElement)?.appendChild(style);
  };
  window.__pfSetChatCompact = value => { compact = value === true; apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
}

/**
 * Jogo: lê o mercado (Community Market) de 3 jeitos e manda para o app.
 * 1. respostas fetch/XHR com cara de mercado (e repete essas leituras GET periodicamente)
 * 2. mensagens de WebSocket com cara de mercado
 * 3. os cards na tela, quando o mercado estiver aberto
 * Só repete requisições GET (leitura). Nunca compra nem envia nada.
 */
function market() {
  if (window.__pfMarket) return;
  window.__pfMarket = true;
  window.__pfMarketEnabled = false;
  window.__pfEnableMarket = (enabled) => {
    window.__pfMarketEnabled = enabled === true;
  };
  window.__pfPoll = window.__pfPoll || 60;
  const post = (o) => {
    if (window.__pfMarketEnabled) window.postMessage({ __pfMarket: o }, '*');
  };
  const WANT = /market|mercado|rmt|listing|offer|oferta|auction|leil|trade|anunc/i;
  const replay = {};
  const NAME = /^(name|nome|displayName|speciesName|pokemonName|itemName|title|species|pokemon|item)$/i;
  const PRICE = /price|preco|preço|valor|cost|amount|min/i;

  function pickName(o) {
    for (const k in o) {
      if (!NAME.test(k)) continue;
      const v = o[k];
      if (typeof v === 'string' && v.length > 1) return v;
      if (v && typeof v === 'object' && typeof v.name === 'string') return v.name;
    }
    return null;
  }
  function extract(root) {
    const out = [];
    let n = 0;
    (function walk(x, depth) {
      if (!x || depth > 8 || n > 5000) return;
      n++;
      if (Array.isArray(x)) { x.forEach((y) => walk(y, depth + 1)); return; }
      if (typeof x !== 'object') return;
      const name = pickName(x);
      if (name) {
        const shiny = x.shiny === true || x.isShiny === true || /shiny/i.test(name);
        const cur = String(x.currency || x.moeda || x.coin || '');
        for (const k in x) {
          let v = x[k];
          if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) v = parseFloat(v);
          if (typeof v !== 'number' || !PRICE.test(k) || v <= 0) continue;
          const c = /gem|diam/i.test(k) ? 'gems' : (/coin|gold|moeda/i.test(k) ? 'coins' : (/gem|diam/i.test(cur) ? 'gems' : 'coins'));
          out.push({ name, price: v, currency: c, shiny, id: x.id || x._id || x.listingId || null });
        }
      }
      for (const k2 in x) if (x[k2] && typeof x[k2] === 'object') walk(x[k2], depth + 1);
    })(root, 0);
    return out.slice(0, 2000);
  }
  function handle(url, method, text, isPoll) {
    if (typeof text !== 'string' || text.length < 2) return;
    let json;
    try { json = JSON.parse(text.replace(/^\d+/, '')); } catch (_) { return; }   // socket.io: 42[...]
    const items = extract(json);
    if (!items.length) return;
    if (method === 'GET' && !isPoll) replay[url] = Date.now();
    post({ url, sample: text.slice(0, 30000), items });
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const p = origFetch.apply(this, arguments);
    if (WANT.test(url)) {
      p.then((r) => r.clone().text().then((t) => handle(url, method, t, false))).catch(() => {});
    }
    return p;
  };

  const xo = XMLHttpRequest.prototype.open;
  const xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__pf = { m: String(m).toUpperCase(), u: String(u) }; return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    const x = this;
    if (x.__pf && WANT.test(x.__pf.u)) {
      x.addEventListener('load', () => { try { handle(x.__pf.u, x.__pf.m, x.responseText, false); } catch (_) { /* ignora */ } });
    }
    return xs.apply(this, arguments);
  };

  const WS = window.WebSocket;
  if (WS) {
    const PFWS = function (u, p) {
      const ws = p !== undefined ? new WS(u, p) : new WS(u);
      ws.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string' && WANT.test(ev.data.slice(0, 3000))) handle('ws:' + u, 'WS', ev.data, false);
      });
      return ws;
    };
    PFWS.prototype = WS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => { PFWS[k] = WS[k]; });
    window.WebSocket = PFWS;
  }

  // Repete as leituras GET do mercado periodicamente (as 5 mais recentes)
  (function tick() {
    setTimeout(() => {
      if (window.__pfMarketEnabled) {
        Object.keys(replay).sort((a, b) => replay[b] - replay[a]).slice(0, 5).forEach((u) => {
          origFetch(u, { credentials: 'include' }).then((r) => r.text()).then((t) => handle(u, 'GET', t, true)).catch(() => {});
        });
      }
      tick();
    }, Math.max(15, window.__pfPoll || 60) * 1000);
  })();

  // Cards do Community Market na tela
  function num(s) {
    s = String(s).trim().toUpperCase().replace(/\s/g, '');
    let m = 1;
    const last = s.slice(-1);
    if (last === 'K') m = 1e3; else if (last === 'M') m = 1e6; else if (last === 'B') m = 1e9;
    if (m > 1) s = s.slice(0, -1);
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const v = parseFloat(s.replace(',', '.'));
    return isNaN(v) ? null : v * m;
  }
  setInterval(() => {
    if (!window.__pfMarketEnabled) return;
    const out = [];
    document.querySelectorAll('button, a').forEach((b) => {
      if (!/ver ofertas/i.test(b.textContent || '')) return;
      let card = b.parentElement;
      let i = 0;
      while (card && i < 6 && !/a partir de/i.test(card.innerText || '')) { card = card.parentElement; i++; }
      if (!card) return;
      const lines = (card.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const name = lines.find((l) => l.length > 2 && !/^[A-Z]+$/.test(l) && !/^P\d$/.test(l) &&
        !/^\d+$/.test(l) && !/ofertas|a partir|ver ofertas/i.test(l));
      if (!name) return;
      const shiny = /shiny/i.test(card.innerText) ||
        !!card.querySelector('[class*="shiny" i], [title*="shiny" i], [alt*="shiny" i]');
      const prices = [];
      lines.forEach((l, idx) => {
        if (!/a partir de/i.test(l)) return;
        const v = num(l.replace(/a partir de:?/i, '').trim() || lines[idx + 1] || '');
        if (v !== null) prices.push(v);
      });
      if (prices[0]) out.push({ name, price: prices[0], currency: 'coins', shiny });
      if (prices[1]) out.push({ name, price: prices[1], currency: 'gems', shiny });
    });
    if (out.length) post({ url: 'dom', items: out });
  }, 10000);
}

// ---------- Qual página é esta? ----------

const host = location.hostname;
const pathName = location.pathname;
const isChat = /\/popout\//.test(pathName) && /chat/.test(pathName);

inject(keepAlive);

if (/pokeidle\.io$/.test(host)) {
  inject(market);
  try {
    require('./pokeidle-hunt.js').installPokeidleHunt();
  } catch (err) {
    console.error('[PokeFarm] Falha ao carregar pokeidle-hunt:', err);
  }
  // Página -> app (o mundo isolado escuta as mensagens da página)
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data.__pfMarket !== 'object') return;
    ipcRenderer.sendToHost('market', e.data.__pfMarket);
  });
} else if (isChat) {
  inject(compactChat);
  if (/twitch\.tv$/.test(host)) inject(twitchChat);
  // Clique na faixa (ex.: botão de pontos): avisa o app para abrir o chat inteiro e o modal aparecer
  document.addEventListener('pointerdown', () => ipcRenderer.sendToHost('chat-click'), true);
} else if (host === 'player.kick.com' || host === 'www.twitch.tv') {
  inject(player);
  if (host === 'www.twitch.tv') {
    inject(compactChat);
    inject(twitchLayout);
    inject(twitchChat);
    window.addEventListener('message', e => {
      if (e.source === window && typeof e.data?.__pfTwitchChatReady === 'boolean') ipcRenderer.sendToHost('twitch-chat-ready', e.data.__pfTwitchChatReady);
    });
    document.addEventListener('pointerdown', e => {
      if (document.documentElement.classList.contains('pf-twitch-shared') && e.target.closest('.chat-shell')) ipcRenderer.sendToHost('chat-click');
    }, true);
  }
}
