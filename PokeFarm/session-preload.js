'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pfSummary', {
  get: () => ipcRenderer.invoke('session-summary'),
  open: () => ipcRenderer.send('session-open'),
  close: () => ipcRenderer.send('session-close'),
});
