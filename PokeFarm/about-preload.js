'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pfAbout', {
  get: () => ipcRenderer.invoke('about-data'),
  copyPix: id => ipcRenderer.invoke('about-copy-pix', id),
});
