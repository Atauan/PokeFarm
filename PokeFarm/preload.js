'use strict';
// Ponte segura entre a interface (renderer) e o processo principal
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pf', {
  platform: process.platform,
  notify: (title, body) => ipcRenderer.send('notify', { title: String(title), body: String(body) }),
  attention: () => ipcRenderer.send('attention'),
  openEdge: (url) => ipcRenderer.send('open-edge', String(url)),
  openLogin: (platform) => ipcRenderer.send('open-login', String(platform)),
  writeSample: (url, text) => ipcRenderer.send('write-sample', { url: String(url), text: String(text).slice(0, 30000) }),
  openDataDir: () => ipcRenderer.send('open-data-dir'),
  onOpenTab: (cb) => ipcRenderer.on('open-tab', (_e, tab) => cb(String(tab))),
  onAddLive: (cb) => ipcRenderer.on('add-live', (_e, link) => cb(String(link))),
});
