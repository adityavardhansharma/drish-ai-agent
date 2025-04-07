// static/electron_bridge.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script (electron_bridge.js) loaded.');

// --- Expose Electron flag to window globally ---
try {
  window.isElectron = navigator.userAgent.toLowerCase().includes('electron');
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
    
    onAppClosing: (callback) => {
      ipcRenderer.on('app-closing', callback);
    }
  });
  console.log('electron object exposed successfully via contextBridge.');
} catch (error) {
  console.error('Error exposing electron object:', error);
}

// Ensure DOM is loaded before initializing navigation
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM content loaded, setting up navigation.');
  
  // Add electron class to body
  if (window.isElectron) {
    document.body.classList.add('electron');
    
    // Log initialization
    if (window.electron && window.electron.logToMain) {
      window.electron.logToMain('info', 'Page initialized with electron bridge');
    }
  }
});

// --- Optional: Expose basic IPC for potential future use ---
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
      // Whitelist channels
      const validChannels = ['navigate', 'log-message', 'some-other-channel'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      } else {
        console.warn(`Blocked send attempt on invalid channel: ${channel}`);
      }
    },
    receive: (channel, func) => {
      // Whitelist channels
      const validChannels = ['from-main', 'update-status'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      } else {
        console.warn(`Blocked receive attempt on invalid channel: ${channel}`);
      }
    },
    invoke: async (channel, data) => {
        // Whitelist channels for invoke
        const validInvokeChannels = ['get-app-version'];
        if (validInvokeChannels.includes(channel)) {
            return await ipcRenderer.invoke(channel, data);
        } else {
            console.warn(`Blocked invoke attempt on invalid channel: ${channel}`);
            return null; // Or throw an error
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
  getChatHistory: () => ipcRenderer.sendSync('get-chat-history'),
});
