const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kaia', {
  load: () => ipcRenderer.invoke('load'),
  save: (s) => ipcRenderer.invoke('save', s),
  saveAppearance: (s) => ipcRenderer.invoke('save-appearance', s),
  saveBlocked: (s) => ipcRenderer.invoke('save-blocked', s),
  choose: (p) => ipcRenderer.invoke('choose', p),
  window: (a) => ipcRenderer.send('window', a),
  on: (type, fn) => {
    if (['message', 'status', 'emotes', 'settings', 'remove'].includes(type))
      ipcRenderer.on(type, (_, v) => fn(v));
  },
});
