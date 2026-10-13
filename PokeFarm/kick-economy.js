'use strict';

// Mantém a reprodução e os eventos de pontos. Só reduz o chat enquanto está recolhido.
// Compartilhado pelo Electron e pelo WKWebView nativo.
function installKickEconomy() {
  if (window.top !== window) return;
  if (location.hostname === 'player.kick.com') {
    if (window.__pfApplyKickQuality) return;
    let timer = null;
    let requested = 0;
    const findPlayer = () => {
      const video = document.querySelector('video');
      if (!video) return null;
      // O embed atual mantém a API IVS em um useRef do componente que contém o vídeo.
      // Percorre apenas essa cadeia e seus hooks, sem varrer estado da conta ou toda a página.
      const key = Object.keys(video).find(name => name.startsWith('__reactFiber$'));
      let fiber = key && video[key];
      for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
        let hook = fiber.memoizedState;
        for (let index = 0; hook && index < 80; index++, hook = hook.next) {
          const api = hook.memoizedState?.current;
          if (api && ['getQualities', 'getQuality', 'setQuality', 'setAutoQualityMode', 'isAutoQualityMode']
            .every(name => typeof api[name] === 'function')) return api;
        }
      }
      return null;
    };
    const applyQuality = () => {
      try {
        const api = findPlayer();
        if (!api) return;
        if (!requested) { api.setAutoQualityMode(true); return; }
        const options = (api.getQualities() || []).filter(q => Number.isFinite(q.height) && q.height > 0)
          .sort((a, b) => a.height - b.height);
        const best = options.filter(q => q.height <= requested).pop() || options[0];
        if (!best) return;
        if (api.isAutoQualityMode() || api.getQuality()?.height !== best.height) {
          api.setAutoQualityMode(false); api.setQuality(best);
        }
      } catch (_) { /* versão desconhecida: não interfere na reprodução */ }
    };
    window.__pfApplyKickQuality = value => {
      requested = Math.max(0, Number(value) || 0);
      clearInterval(timer); timer = null;
      applyQuality();
      if (requested) timer = setInterval(applyQuality, 3000);
    };
    return;
  }
  if (window.top !== window || !['kick.com', 'www.kick.com'].includes(location.hostname) ||
      !/^\/popout\/[a-z0-9_-]+\/chat\/?$/i.test(location.pathname) || window.__pfSetKickEconomy) return;
  let enabled = false;
  const apply = () => {
    document.documentElement?.classList.toggle('pf-kick-economy', enabled);
    if (document.getElementById('pf-kick-economy-css')) return;
    const style = document.createElement('style'); style.id = 'pf-kick-economy-css';
    style.textContent = '.pf-kick-economy #chatroom-messages{visibility:hidden!important;content-visibility:hidden!important}' +
      '.pf-kick-economy #channel-chatroom *,.pf-kick-economy #channel-chatroom *::before,.pf-kick-economy #channel-chatroom *::after{animation:none!important;transition:none!important}';
    (document.head || document.documentElement)?.append(style);
  };
  window.__pfSetKickEconomy = value => { enabled = value === true; apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();

  if (!window.WebSocket) return;
  window.WebSocket = new Proxy(window.WebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget);
      let host;
      try { host = new URL(socket.url, location.href).hostname; } catch (_) { return socket; }
      if (host !== 'websockets.kick.com' && !host.endsWith('.pusher.com')) return socket;
      socket.addEventListener('message', event => {
        if (!enabled || typeof event.data !== 'string') return;
        try {
          const packet = JSON.parse(event.data);
          if (packet?.event !== 'App\\Events\\ChatMessageEvent') return;
          const data = typeof packet.data === 'string' ? JSON.parse(packet.data) : packet.data;
          // Não descarta celebrações, saldos, resgates, moderação, ping ou formatos desconhecidos.
          if (data?.type === 'message') event.stopImmediatePropagation();
        } catch (_) { /* transporte desconhecido: a página continua recebendo tudo */ }
      });
      return socket;
    },
  });
}

if (typeof process !== 'undefined' && process.versions?.electron && typeof require === 'function') {
  const { contextBridge, webFrame } = require('electron');
  try { contextBridge.executeInMainWorld({ func: installKickEconomy }); }
  catch (_) { webFrame.executeJavaScript(`(${installKickEconomy.toString()})()`).catch(() => {}); }
} else {
  installKickEconomy();
}
