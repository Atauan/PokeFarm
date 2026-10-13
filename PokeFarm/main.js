'use strict';
// PokeFarm — processo principal (Mac e Windows)
const { app, BrowserWindow, ipcMain, Notification, powerSaveBlocker, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Todas as lives, chats, jogo e janelas de login usam a mesma sessão: logou uma vez, vale para tudo
const PARTITION = 'persist:pokefarm';

// User-agent de Chrome normal (sem "Electron"), para Twitch/Kick servirem o site padrão
const CHROME_MAJOR = String(process.versions.chrome || '140').split('.')[0];
const OS_UA = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64';
const CHROME_UA = `Mozilla/5.0 (${OS_UA}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;

// Rodar 24h: nada é pausado/desacelerado com janela atrás, minimizada ou tela bloqueada
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.userAgentFallback = CHROME_UA;
app.setName('PokeFarm');
if (process.platform === 'win32') app.setAppUserModelId('com.pokefarm.app');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

const LOGIN_URLS = {
  twitch: 'https://www.twitch.tv/login',
  kick: 'https://kick.com/',
};

// Só abre no Edge endereços destes sites, e só com caracteres seguros
const SAFE_URL = /^https:\/\/([a-z0-9-]+\.)*(kick\.com|twitch\.tv|pokeidle\.io)(\/[A-Za-z0-9_\-/]*)?$/;

// Caminhos da Twitch/Kick que não são canais
const RESERVED = new Set([
  'directory', 'videos', 'settings', 'login', 'signup', 'p', 'downloads', 'jobs', 'subscriptions',
  'inventory', 'wallet', 'drops', 'search', 'friends', 'messages', 'payments', 'prime', 'turbo',
  'store', 'popout', 'embed', 'moderator', 'categories', 'browse', 'following', 'dashboard',
  'terms-of-service', 'privacy-policy', 'community-guidelines', 'about', 'help', 'privacy', 'terms',
]);

/** Se a URL for de um canal da Kick/Twitch, devolve o link limpo (ex.: https://twitch.tv/rodil). */
function channelURL(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return null; }
  const host = u.hostname.toLowerCase();
  const twitch = host === 'twitch.tv' || host.endsWith('.twitch.tv');
  const kick = host === 'kick.com' || host.endsWith('.kick.com');
  if (!(twitch || kick) || /^(player|dashboard|id)\./.test(host)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  const name = parts[0].toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(name) || RESERVED.has(name)) return null;
  return `https://${twitch ? 'twitch.tv' : 'kick.com'}/${name}`;
}

const isGame = (contents) => {
  try { return /(^|\.)pokeidle\.io$/.test(new URL(contents.getURL()).hostname); } catch (_) { return false; }
};

function addLive(link) {
  if (win && !win.isDestroyed()) win.webContents.send('add-live', link);
}

// MARK: Quem está ao vivo (Twitch: GraphQL público; Kick: API do site, de dentro de uma página da Kick)

const LIVE_NAME = /^[a-z0-9_-]{2,40}$/;
let kickHelper = null;
let kickReady = null;

function resetKickHelper() {
  if (kickHelper && !kickHelper.isDestroyed()) kickHelper.destroy();
  kickHelper = null;
  kickReady = null;
}

function getKickHelper() {
  if (kickReady && kickHelper && !kickHelper.isDestroyed()) return kickReady;
  kickHelper = new BrowserWindow({
    show: false, width: 400, height: 300,
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  const w = kickHelper;
  kickReady = w.loadURL('https://kick.com/api/v2/channels/kick').then(() => w).catch(() => { resetKickHelper(); return null; });
  return kickReady;
}

async function checkTwitch(names) {
  const out = {};
  for (let i = 0; i < names.length; i += 30) {
    const chunk = names.slice(i, i + 30).filter((n) => /^[a-z0-9_]{2,25}$/.test(n));
    if (!chunk.length) continue;
    const q = chunk.map((n, j) => `u${j}: user(login: "${n}") { stream { id } }`).join(' ');
    try {
      const r = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `query { ${q} }` }),
      });
      const j = await r.json();
      if (!j || !j.data) continue;
      chunk.forEach((n, k) => {
        if (!(`u${k}` in j.data)) return;
        const u = j.data[`u${k}`];
        out[n] = !!(u && u.stream);
      });
    } catch (_) { /* sem internet: fica como estava */ }
  }
  return out;
}

async function checkKick(names) {
  if (!names.length) return {};
  const w = await getKickHelper();
  if (!w || w.isDestroyed()) return {};
  const js = `(async (names) => {
    const out = {};
    for (const n of names) {
      try {
        const r = await fetch('/api/v2/channels/' + encodeURIComponent(n), { credentials: 'include', headers: { Accept: 'application/json' } });
        if (r.status === 404) out[n] = false;
        else if (r.ok) { const j = await r.json(); out[n] = !!(j && j.livestream && j.livestream.is_live !== false); }
      } catch (e) {}
      await new Promise((res) => setTimeout(res, 300));
    }
    return out;
  })(${JSON.stringify(names)})`;
  try {
    const out = await w.webContents.executeJavaScript(js);
    if (!out || !Object.keys(out).length) resetKickHelper();
    return out || {};
  } catch (_) {
    resetKickHelper();
    return {};
  }
}

const fromApp = (e) => !!(e.senderFrame && String(e.senderFrame.url).startsWith('file://'));

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 1000,
    minHeight: 560,
    title: 'PokeFarm',
    backgroundColor: '#141416',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // A janela principal nunca navega para fora nem abre pop-ups
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('render-process-gone', () => setTimeout(() => win && !win.isDestroyed() && win.reload(), 2000));
  // A janela escondida da Kick não pode segurar o app aberto
  win.on('closed', () => { win = null; resetKickHelper(); app.quit(); });
}

app.on('web-contents-created', (_e, contents) => {
  // Toda <webview> recebe o nosso preload e configurações seguras, na sessão compartilhada
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preloadURL;
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.backgroundThrottling = false;
    webPreferences.partition = PARTITION;
    if (!/^https:\/\//.test(params.src || '')) event.preventDefault();
  });

  // Pop-ups das páginas (login, OAuth) abrem numa janela própria, na mesma sessão
  if (contents.getType() === 'webview') {
    // No jogo, link/botão de live da Kick/Twitch vira bloco na aba Lives em vez de abrir
    contents.on('will-navigate', (e, url) => {
      if (!isGame(contents)) return;
      const link = channelURL(url);
      if (link) { e.preventDefault(); addLive(link); }
    });
    contents.on('did-create-window', (child) => {
      if (!isGame(contents)) return;
      // Pop-up aberto em branco e depois mandado para a live
      child.webContents.on('will-navigate', (e, url) => {
        const link = channelURL(url);
        if (link) { e.preventDefault(); addLive(link); child.close(); }
      });
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (isGame(contents)) {
        const link = channelURL(url);
        if (link) { addLive(link); return { action: 'deny' }; }
      }
      if (url === 'about:blank' && isGame(contents)) {
        return { action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false } } };
      }
      if (!/^https:\/\//.test(url)) return { action: 'deny' };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          title: 'Entrar',
          autoHideMenuBar: true,
          webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
        },
      };
    });
  }
});

// MARK: IPC da interface

ipcMain.on('notify', (e, msg) => {
  if (!fromApp(e) || !msg || !Notification.isSupported()) return;
  const n = new Notification({ title: String(msg.title).slice(0, 120), body: String(msg.body).slice(0, 300) });
  n.on('click', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('open-tab', 'game');
  });
  n.show();
});

ipcMain.on('attention', (e) => {
  if (!fromApp(e) || !win) return;
  if (process.platform === 'darwin' && app.dock) app.dock.bounce('informational');
  else if (!win.isFocused()) win.flashFrame(true);
});

ipcMain.on('open-edge', (e, url) => {
  if (!fromApp(e) || typeof url !== 'string' || !SAFE_URL.test(url)) return;
  if (process.platform === 'darwin') {
    const p = spawn('open', ['-a', 'Microsoft Edge', url], { stdio: 'ignore' });
    p.on('error', () => shell.openExternal(url));
    p.on('exit', (code) => { if (code !== 0) shell.openExternal(url); });
  } else if (process.platform === 'win32') {
    // O Windows registra o protocolo microsoft-edge: para abrir direto no Edge
    shell.openExternal(`microsoft-edge:${url}`).catch(() => shell.openExternal(url));
  } else {
    shell.openExternal(url);
  }
});

ipcMain.on('open-login', (e, platform) => {
  const url = LOGIN_URLS[platform];
  if (!fromApp(e) || !url) return;
  const w = new BrowserWindow({
    width: 520,
    height: 760,
    title: platform === 'twitch' ? 'Entrar na Twitch' : 'Entrar na Kick',
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  w.loadURL(url);
});

// Amostras brutas do mercado (ajudam a ajustar a leitura depois)
ipcMain.on('write-sample', (e, msg) => {
  if (!fromApp(e) || !msg) return;
  const file = path.join(app.getPath('userData'), 'market-samples.jsonl');
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 3_000_000) return;
    const line = JSON.stringify({ date: new Date().toISOString(), url: String(msg.url).slice(0, 500), body: String(msg.text).slice(0, 30000) });
    fs.appendFileSync(file, line + '\n');
  } catch (_) { /* ignora */ }
});

ipcMain.handle('check-live', async (e, req) => {
  if (!fromApp(e) || !req) return { twitch: {}, kick: {} };
  const clean = (a) => [...new Set((Array.isArray(a) ? a : []).map((s) => String(s).toLowerCase()))]
    .filter((s) => LIVE_NAME.test(s)).slice(0, 200);
  const [twitch, kick] = await Promise.all([checkTwitch(clean(req.twitch)), checkKick(clean(req.kick))]);
  return { twitch, kick };
});

ipcMain.on('open-data-dir', (e) => {
  if (fromApp(e)) shell.openPath(app.getPath('userData'));
});

// MARK: Ciclo de vida

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  session.fromPartition(PARTITION).setUserAgent(CHROME_UA);
  // Mac/PC não dormem com o app aberto (inclusive com a tela bloqueada)
  powerSaveBlocker.start('prevent-app-suspension');
  powerSaveBlocker.start('prevent-display-sleep');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
