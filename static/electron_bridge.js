// static/electron_bridge.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script (electron_bridge.js) loaded.');

// --- Expose Electron flag to window globally ---
try {
  window.isElectron =
    navigator.userAgent.toLowerCase().includes('electron');
  console.log('isElectron flag set via navigator.userAgent');
} catch (error) {
  console.error('Error setting isElectron flag on window:', error);
}

// --- Expose a bridge between renderer and main processes ---
try {
  contextBridge.exposeInMainWorld('electron', {
    // Expose utility flags
    isElectron: true,

    // Expose navigation functions
    navigateInApp: (action) => {
      console.log(`Sending navigation action: ${action}`);
      ipcRenderer.send('navigate', action);
    },

    // Expose logging functionality
    logToMain: (level, message, context = {}) => {
      console.log(`Sending log to main: ${level} - ${message}`);
      ipcRenderer.send('log-message', { level, message, context });
    },

    // Expose server restart functionality
    restartServer: () => {
      console.log('Requesting server restart');
      return ipcRenderer.invoke('restart-server');
    },

    // Expose auto-start functionality
    getAutoStartEnabled: () => {
      console.log('Checking auto-start status');
      return ipcRenderer.invoke('get-auto-start-enabled');
    },

    setAutoStartEnabled: (enabled) => {
      console.log(`Setting auto-start to: ${enabled}`);
      return ipcRenderer.invoke('set-auto-start-enabled', enabled);
    },

    onAppClosing: (callback) => {
      ipcRenderer.on('app-closing', callback);
    }
  });
  console.log('electron object exposed successfully via contextBridge.');
} catch (error) {
  console.error('Error exposing electron object:', error);
}

// --- Expose basic IPC for potential future use ---
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
      const validChannels = ['navigate', 'log-message', 'some-other-channel'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      } else {
        console.warn(`Blocked send attempt on invalid channel: ${channel}`);
      }
    },
    receive: (channel, func) => {
      const validChannels = ['from-main', 'update-status'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      } else {
        console.warn(`Blocked receive attempt on invalid channel: ${channel}`);
      }
    },
    invoke: async (channel, data) => {
      const validInvokeChannels = ['get-app-version'];
      if (validInvokeChannels.includes(channel)) {
        return await ipcRenderer.invoke(channel, data);
      } else {
        console.warn(`Blocked invoke attempt on invalid channel: ${channel}`);
        return null;
      }
    }
  });
  console.log('electronAPI object exposed successfully.');
} catch (error) {
  console.error('Error exposing electronAPI:', error);
}

// --- Expose desktop storage API for document content and chat history ---
contextBridge.exposeInMainWorld('electronStorage', {
  setDocumentContent: (content) => {
    ipcRenderer.send('set-document-content', content);
  },
  getDocumentContent: () => ipcRenderer.sendSync('get-document-content'),
  setChatHistory: (history) => {
    ipcRenderer.send('set-chat-history', history);
  },
  getChatHistory: () => ipcRenderer.sendSync('get-chat-history')
});

document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM content loaded, setting up navigation.');

  if (window.isElectron) {
    document.body.classList.add('electron');

    if (window.electron && window.electron.logToMain) {
      window.electron.logToMain('info', 'Page initialized with electron bridge');
    }
  }
});
