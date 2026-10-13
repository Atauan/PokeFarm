'use strict';
// PokeFarm — processo principal (Mac e Windows)
const { app, BrowserWindow, ipcMain, Notification, powerSaveBlocker, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createLiveStatusService } = require('./live-status');
const { createReleaseChecker } = require('./release-updates');

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
let updateChecker = null;
let updateTimer = null;

function startUpdateChecks() {
  const settingsFile = path.join(app.getPath('userData'), 'update-notifications.json');
  let notifiedVersions = [];
  try { notifiedVersions = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (_) { /* primeira abertura */ }
  updateChecker = createReleaseChecker({
    currentVersion: app.getVersion(), notifiedVersions,
    persistNotified: versions => fs.writeFileSync(settingsFile, JSON.stringify(versions)),
    onChange: state => {
      if (win && !win.isDestroyed()) win.webContents.send('update-state', state);
    },
    onAvailable: update => {
      if (!Notification.isSupported()) return;
      const notification = new Notification({ title: 'Atualização do PokeFarm',
        body: `A versão ${update.version} está disponível. Clique para ver a release.` });
      notification.on('click', () => { void shell.openExternal(update.url).catch(() => {}); });
      notification.show();
    },
  });
  void updateChecker.check();
  updateTimer = setInterval(() => { void updateChecker.check(); }, 60 * 60 * 1000);
}

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

// Sessão de cada conta extra do Pokeidle: persist:pokefarm-acc-<id>
const ACCOUNT_PARTITION = /^persist:pokefarm-acc-[a-z0-9-]{8,40}$/;
const configuredSessions = new Set();

/** User-agent e scripts iguais em todas as sessões (a principal e a de cada conta). */
function setupSession(part) {
  if (configuredSessions.has(part)) return;
  configuredSessions.add(part);
  const ses = session.fromPartition(part);
  ses.setUserAgent(CHROME_UA);
  ses.registerPreloadScript({ id: 'pf-game-channels', type: 'frame', filePath: path.join(__dirname, 'game-channels.js') });
  ses.registerPreloadScript({ id: 'pf-twitch-economy', type: 'frame', filePath: path.join(__dirname, 'twitch-economy.js') });
  ses.registerPreloadScript({ id: 'pf-kick-economy', type: 'frame', filePath: path.join(__dirname, 'kick-economy.js') });
}

const fromApp = (e) => !!(e.senderFrame && String(e.senderFrame.url).startsWith('file://'));
const liveStatus = createLiveStatusService((url, options) => session.fromPartition(PARTITION).fetch(url, options));

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
  win.on('closed', () => { win = null; });
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
    // Contas extras do Pokeidle usam sessão própria (login separado); o resto, a compartilhada
    const part = ACCOUNT_PARTITION.test(params.partition || '') ? params.partition : PARTITION;
    setupSession(part);
    webPreferences.partition = part;
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
        return { action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences: { session: contents.session, contextIsolation: true, sandbox: true, nodeIntegration: false } } };
      }
      if (!/^https:\/\//.test(url)) return { action: 'deny' };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 760,
          title: 'Entrar',
          autoHideMenuBar: true,
          // Mesma sessão da página que abriu: o login de cada conta fica na conta certa
          webPreferences: { session: contents.session, contextIsolation: true, sandbox: true, nodeIntegration: false },
        },
      };
    });
  }
});

// MARK: IPC da interface

const fromMainWindow = e => !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame;
ipcMain.handle('update-state', e => fromMainWindow(e) ? updateChecker?.getState() : null);
ipcMain.handle('check-updates', e => fromMainWindow(e) ? updateChecker?.check() : null);
ipcMain.handle('open-update', async e => {
  if (!fromMainWindow(e)) return false;
  const url = updateChecker?.getState().release?.url;
  if (!url) return false;
  try { await shell.openExternal(url); return true; } catch (_) { return false; }
});

ipcMain.handle('live-status', (e, platform, channels) => {
  if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) {
    return {};
  }
  return liveStatus.check(platform, channels);
});

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

// Login numa janela própria (não numa webview): o Google recusa login dentro de webview embutida.
// Aceita os pop-ups de OAuth (Google/Twitch/Kick) como janelas-filhas na mesma sessão.
ipcMain.on('open-login', (e, platform, partition) => {
  const url = LOGIN_URLS[platform];
  if (!fromApp(e) || !url) return;
  const part = ACCOUNT_PARTITION.test(partition || '') ? partition : PARTITION;
  setupSession(part);
  openLoginWindow(url, platform === 'twitch' ? 'Entrar na Twitch' : 'Entrar na Kick', part);
});

ipcMain.on('open-game-login', (e, partition) => {
  if (!fromApp(e)) return;
  const part = ACCOUNT_PARTITION.test(partition || '') ? partition : PARTITION;
  setupSession(part);
  openLoginWindow('https://pokeidle.io/app', 'Entrar no Pokeidle', part);
});

function openLoginWindow(url, title, part) {
  const w = new BrowserWindow({
    width: 540, height: 760, title, autoHideMenuBar: true,
    webPreferences: { partition: part, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // UA de navegador real (sem "Electron"); o Google bloqueia webview/apps embutidos
  w.webContents.setUserAgent(CHROME_UA);
  // Pop-up do OAuth (Google etc.): abre como janela-filha na MESMA sessão, não bloqueia
  const childOpts = {
    action: 'allow',
    overrideBrowserWindowOptions: {
      width: 540, height: 720, autoHideMenuBar: true,
      webPreferences: { session: w.webContents.session, contextIsolation: true, sandbox: true, nodeIntegration: false },
    },
  };
  w.webContents.setWindowOpenHandler(({ url: u }) => (/^https:\/\//.test(u) ? childOpts : { action: 'deny' }));
  w.webContents.on('did-create-window', (child) => {
    child.webContents.setUserAgent(CHROME_UA);
    child.webContents.setWindowOpenHandler(({ url: u }) => (/^https:\/\//.test(u) ? childOpts : { action: 'deny' }));
  });
  w.loadURL(url);
}

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

// Conta removida: apaga o login dela (só contas extras; a principal é a mesma das lives)
ipcMain.handle('clear-account', async (e, id) => {
  const part = `persist:pokefarm-acc-${String(id)}`;
  if (!fromApp(e) || !ACCOUNT_PARTITION.test(part)) return false;
  try { await session.fromPartition(part).clearStorageData(); return true; } catch (_) { return false; }
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
  setupSession(PARTITION);
  // Mac/PC não dormem com o app aberto (inclusive com a tela bloqueada)
  powerSaveBlocker.start('prevent-app-suspension');
  powerSaveBlocker.start('prevent-display-sleep');
  createWindow();
  startUpdateChecks();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (updateTimer) clearInterval(updateTimer); });
