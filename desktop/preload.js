const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  fetchModels: (payload) => ipcRenderer.invoke('openai:fetchModels', payload),
  sendMessage: (payload) => ipcRenderer.invoke('chat:send', payload),
  loadRegistry: () => ipcRenderer.invoke('registry:load'),
});
