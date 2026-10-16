const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kaia', {
  load: () => ipcRenderer.invoke('load'),
  save: (s) => ipcRenderer.invoke('save', s),
  saveAppearance: (s) => ipcRenderer.invoke('save-appearance', s),
  saveBlocked: (s) => ipcRenderer.invoke('save-blocked', s),
  saveTiming: (s) => ipcRenderer.invoke('save-timing', s),
  chooseTranscript: () => ipcRenderer.invoke('choose-transcript'),
  choose: (p) => ipcRenderer.invoke('choose', p),
  window: (a) => ipcRenderer.send('window', a),
  on: (type, fn) => {
    if (
      [
        'message',
        'status',
        'emotes',
        'settings',
        'remove',
        'transcript-status',
      ].includes(type)
    )
      ipcRenderer.on(type, (_, v) => fn(v));
  },
});
