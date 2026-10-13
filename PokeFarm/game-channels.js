'use strict';

// Compartilhado pelo preload do Electron e pelo WKUserScript da versão Swift.
// Lê apenas os canais oficiais; não envia comandos, não abre modais e não exporta dados da conta.
function watchGameChannels() {
  if (window.top !== window || !/(^|\.)pokeidle\.io$/.test(location.hostname) || window.__pfWatchingGameChannels) return;
  window.__pfWatchingGameChannels = true;
  const catalog = new Map();
  let lastSent = '';
  const add = (platform, raw) => {
    if (typeof raw !== 'string' || catalog.size >= 200) return;
    const channel = raw.trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/.test(channel)) return;
    catalog.set(`${platform}:${channel}`, { platform, channel });
  };
  const publish = () => {
    if (!catalog.size) return;
    const channels = [...catalog.values()].sort((a, b) => `${a.platform}:${a.channel}`.localeCompare(`${b.platform}:${b.channel}`));
    const signature = JSON.stringify(channels);
    if (signature === lastSent) return;
    lastSent = signature;
    const native = window.webkit?.messageHandlers?.pfGameChannels;
    if (native) native.postMessage(channels);
    else window.postMessage({ __pfGameChannels: channels }, location.origin);
  };

  const readMessage = (event) => {
    if (typeof event.data !== 'string' || !/"(?:twitch|kick)"\s*:/.test(event.data)) return;
    try {
      const message = JSON.parse(event.data);
      if (!['welcome', 'estado'].includes(message?.t)) return;
      const state = message.estado;
      if (!state || typeof state !== 'object') return;
      // Estes são os mesmos campos usados por montarTwitch()/montarKick() no jogo.
      // Em deltas, uma plataforma ausente significa "não mudou".
      for (const row of Array.isArray(state.twitch?.oficiais) ? state.twitch.oficiais : []) add('twitch', row?.login);
      for (const row of Array.isArray(state.twitch?.lives) ? state.twitch.lives : []) add('twitch', row?.login);
      for (const row of Array.isArray(state.kick?.oficiais) ? state.kick.oficiais : []) add('kick', row?.slug);
      publish();
    } catch (_) { /* mensagem diferente/incompleta: espera a próxima */ }
  };

  if (window.WebSocket) {
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args, newTarget) {
        const socket = Reflect.construct(target, args, newTarget);
        try {
          const url = new URL(String(args[0]), location.href);
          if (url.hostname === location.hostname && ['ws:', 'wss:'].includes(url.protocol) && url.pathname === '/') {
            socket.addEventListener('message', readMessage);
          }
        } catch (_) { /* não interfere na conexão do jogo */ }
        return socket;
      },
    });
  }

  // Reserva para mudanças no transporte ou um modal que já esteja montado.
  // Não varre links do chat: somente as listas dos dois painéis de bônus.
  const readPanels = () => {
    for (const link of document.querySelectorAll('#tw-corpo .tw-canal[href], #kk-corpo .kk-canal[href]')) {
      try {
        const url = new URL(link.getAttribute('href'), location.href);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) continue;
        const platform = ['twitch.tv', 'www.twitch.tv'].includes(url.hostname) ? 'twitch'
          : ['kick.com', 'www.kick.com'].includes(url.hostname) ? 'kick' : null;
        const parts = url.pathname.split('/').filter(Boolean);
        if (platform && parts.length === 1) add(platform, parts[0]);
      } catch (_) { /* ignora links inválidos */ }
    }
    publish();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', readPanels, { once: true });
  else readPanels();
  window.__pfReadGameChannels = () => {
    readPanels();
    return [...catalog.values()].map(channel => ({ ...channel }));
  };
  setInterval(readPanels, 3000);
}

if (typeof process !== 'undefined' && process.versions?.electron && typeof require === 'function') {
  if (window.top === window && /(^|\.)pokeidle\.io$/.test(location.hostname)) {
    const { contextBridge, ipcRenderer, webFrame } = require('electron');
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin || !Array.isArray(event.data?.__pfGameChannels)) return;
      ipcRenderer.sendToHost('game-channels', event.data.__pfGameChannels.slice(0, 200));
    });
    try { contextBridge.executeInMainWorld({ func: watchGameChannels }); }
    catch (_) { webFrame.executeJavaScript(`(${watchGameChannels.toString()})()`).catch(() => {}); }
  }
} else {
  watchGameChannels();
}
