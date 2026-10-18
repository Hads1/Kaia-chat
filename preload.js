const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kaia', {
  load: () => ipcRenderer.invoke('load'),
  diagnoseMedia: () => ipcRenderer.invoke('media-diagnose'),
  saveReader: (value) => ipcRenderer.invoke('save-reader', value),
  readerAction: (action) => ipcRenderer.invoke('reader-action', action),
  saveSR: (value) => ipcRenderer.invoke('save-sr', value),
  srAction: (action, args) => ipcRenderer.invoke('sr-action', action, args),
  spotifyAction: (action, value) =>
    ipcRenderer.invoke('spotify-action', action, value),
  youtubeAction: (action) => ipcRenderer.invoke('youtube-action', action),
  srLoopback: (value) => ipcRenderer.invoke('sr-loopback', value),
  mediaLink: (name) => ipcRenderer.invoke('media-link', name),
  srOpen: (kind) => ipcRenderer.invoke('sr-open', kind),
  display: (action) => ipcRenderer.invoke('display', action),
  saveWidget: (s) => ipcRenderer.invoke('save-widget', s),
  copyWidget: () => ipcRenderer.invoke('copy-widget'),
  popupWidget: () => ipcRenderer.invoke('popup-widget'),
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
        'media-status',
        'spotify-state',
        'sr-state',
        'display-state',
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
