const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electron',
  {
    // Allow renderer to use ipcRenderer.send
    send: (channel, data) => {
      ipcRenderer.send(channel, data);
    },
    // Allow renderer to receive messages from main
    receive: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    // Allow renderer to invoke main and receive response synchronously
    invoke: (channel, data) => {
      return ipcRenderer.invoke(channel, data);
    }
  }
); 