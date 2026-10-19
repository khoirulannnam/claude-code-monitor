const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('card', {
  close: () => ipcRenderer.send('close-card'),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  fit: (height) => ipcRenderer.send('fit-height', height),
});
