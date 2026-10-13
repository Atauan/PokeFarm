'use strict';

// Implementação própria, inspirada no chat compartilhado de MOTHblank/pokeidle-addons.
// O mesmo script roda no Electron e no WKWebView. A autenticação continua com a Twitch.
function installTwitchEconomy() {
  if (window.top !== window || location.hostname !== 'www.twitch.tv' || window.__pfTwitchEconomy) return;
  const match = location.pathname.match(/^\/popout\/([a-z0-9_]{1,25})\/chat\/?$/i);
  const params = new URLSearchParams(location.search);
  if (!match || params.get('pf-economy') !== '1' || !window.WebSocket) return;
  const primary = match[1].toLowerCase();
  const channels = [...new Set([primary, ...(params.get('pf-channels') || '').split(',')]
    .map(name => name.trim().toLowerCase()).filter(name => /^[a-z0-9_]{1,25}$/.test(name)))].slice(0, 100);
  const state = window.__pfTwitchEconomy = { requested: channels.length, joined: 0, connected: false, authenticated: false };
  const report = () => {
    const bridge = window.webkit?.messageHandlers?.pfTwitchEconomy;
    if (bridge) bridge.postMessage({ ...state });
  };
  let active = null;
  const NativeSocket = window.WebSocket;
  window.WebSocket = class EconomySocket extends NativeSocket {
    constructor(...args) {
      super(...args);
      try { this.pfIRC = new URL(this.url, location.href).hostname === 'irc-ws.chat.twitch.tv'; }
      catch (_) { this.pfIRC = false; }
      if (!this.pfIRC) return;
      this.pfJoined = new Set();
      this.pfStarted = false;
      active = this;
      state.connected = false; state.authenticated = false; state.joined = 0; report();
      // Registrado antes dos listeners da página: descarta mensagens sem criar árvores de chat.
      super.addEventListener('message', event => {
        if (typeof event.data !== 'string') return;
        let changed = false;
        const kept = [];
        for (const line of event.data.split(/\r\n|\n|\r/)) {
          const command = line.match(/^(?:@\S+\s+)?(?::\S+\s+)?([A-Z0-9]+)(?:\s+([^ :]+))?/i);
          const kind = command?.[1]?.toUpperCase();
          const target = command?.[2]?.toLowerCase();
          if (active === this && kind === '001') {
            state.connected = true;
            state.authenticated = !!target && !/^justinfan\d*$/.test(target);
            report();
          }
          if (active === this && kind === 'ROOMSTATE' && channels.includes(target?.slice(1))) {
            this.pfJoined.add(target.slice(1)); state.joined = this.pfJoined.size; report();
          }
          const otherRoom = target?.startsWith('#') && target !== `#${primary}`;
          if (kind === 'PRIVMSG' || kind === 'USERNOTICE' ||
              (otherRoom && ['JOIN', 'PART', 'ROOMSTATE', 'USERSTATE', 'CLEARCHAT', 'CLEARMSG', 'NOTICE', 'MODE'].includes(kind)) ||
              (channels.length > 1 && ['353', '366'].includes(kind))) {
            changed = true;
          } else kept.push(line);
        }
        if (!changed) return;
        const filtered = kept.join('\r\n');
        if (!filtered.trim()) { event.stopImmediatePropagation(); return; }
        // Falhar aqui só deixa a página processar mensagens; nunca perde PING/controle.
        try { Object.defineProperty(event, 'data', { value: filtered, configurable: true }); } catch (_) { /* preserva evento */ }
      });
      super.addEventListener('close', () => {
        if (active !== this) return;
        state.connected = false; state.authenticated = false; state.joined = 0; report();
      });
    }

    send(data) {
      if (!this.pfIRC || typeof data !== 'string') return super.send(data);
      const lines = data.split(/\r\n|\n|\r/);
      let changed = false;
      const outgoing = lines.map(line => {
        if (!/^JOIN\s+/i.test(line)) return line;
        changed = true;
        if (this.pfStarted) return '';
        this.pfStarted = true;
        // Limites IRC: até 20 entradas por 10 s; no máximo 100 salas por conta.
        for (let offset = 20; offset < channels.length; offset += 20) {
          const batch = channels.slice(offset, offset + 20);
          setTimeout(() => {
            if (active !== this || this.readyState !== NativeSocket.OPEN) return;
            NativeSocket.prototype.send.call(this, `JOIN ${batch.map(name => `#${name}`).join(',')}`);
          }, (offset / 20) * 10500);
        }
        return `JOIN ${channels.slice(0, 20).map(name => `#${name}`).join(',')}`;
      });
      if (!changed) return super.send(data);
      const result = outgoing.filter(Boolean).join('\r\n');
      if (result) return super.send(result);
    }
  };

  const style = () => {
    if (document.getElementById('pf-twitch-economy-style')) return;
    const css = document.createElement('style'); css.id = 'pf-twitch-economy-style';
    css.textContent = 'body{overflow:hidden!important}body>*{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}';
    (document.head || document.documentElement)?.appendChild(css);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', style, { once: true });
  else style();
  report();
}

if (typeof process !== 'undefined' && process.versions?.electron && typeof require === 'function') {
  const { contextBridge, webFrame } = require('electron');
  try { contextBridge.executeInMainWorld({ func: installTwitchEconomy }); }
  catch (_) { webFrame.executeJavaScript(`(${installTwitchEconomy.toString()})()`).catch(() => {}); }
} else {
  installTwitchEconomy();
}
