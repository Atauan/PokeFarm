'use strict';
// Ponte segura entre a interface (renderer) e o processo principal
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pf', {
  platform: process.platform,
  updateState: () => ipcRenderer.invoke('update-state'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  openUpdate: () => ipcRenderer.invoke('open-update'),
  onUpdateState: (cb) => ipcRenderer.on('update-state', (_e, state) => cb(state)),
  liveStatus: (platform, channels) => ipcRenderer.invoke('live-status', platform, channels),
  notify: (title, body) => ipcRenderer.send('notify', { title: String(title), body: String(body) }),
  attention: () => ipcRenderer.send('attention'),
  openEdge: (url) => ipcRenderer.send('open-edge', String(url)),
  openLogin: (platform) => ipcRenderer.send('open-login', String(platform)),
  writeSample: (url, text) => ipcRenderer.send('write-sample', { url: String(url), text: String(text).slice(0, 30000) }),
  openDataDir: () => ipcRenderer.send('open-data-dir'),
  onOpenTab: (cb) => ipcRenderer.on('open-tab', (_e, tab) => cb(String(tab))),
  clearAccount: (id) => ipcRenderer.invoke('clear-account', String(id)),
  onAddLive: (cb) => ipcRenderer.on('add-live', (_e, link) => cb(String(link))),
});
