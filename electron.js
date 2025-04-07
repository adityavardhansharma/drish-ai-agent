const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const waitOn = require('wait-on');
const kill = require('tree-kill');

let mainWindow;
let pythonProcess = null;
const PORT = 5000;
const URL = `http://localhost:${PORT}`;

// Get the appropriate path for resources
function getResourcePath() {
  if (isDev) {
    return __dirname;
  }
  
  if (process.platform === 'win32') {
    return path.join(process.resourcesPath, 'app');
  }
  
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }

  return __dirname;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'static', 'electron_bridge.js'),
    },
    title: 'AI Agent Pro',
    icon: path.join(__dirname, 'resources', 'icon.png'),
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadURL(URL);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === '=') {
      mainWindow.webContents.setZoomFactor(mainWindow.webContents.getZoomFactor() + 0.1);
      event.preventDefault();
    } else if (input.control && input.key === '-') {
      mainWindow.webContents.setZoomFactor(mainWindow.webContents.getZoomFactor() - 0.1);
      event.preventDefault();
    } else if (input.control && input.key === '0') {
      mainWindow.webContents.setZoomFactor(1.0);
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('https')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pythonProcess) {
      kill(pythonProcess.pid);
    }
  });
}

async function startPythonServer() {
  return new Promise((resolve, reject) => {
    const resourcePath = getResourcePath();
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(resourcePath, 'main.py');

    if (!fs.existsSync(scriptPath)) {
      const error = new Error(`Python script not found at: ${scriptPath}`);
      console.error(error);
      reject(error);
      return;
    }

    console.log(`Starting Python server with script: ${scriptPath}`);
    const env = Object.assign({}, process.env, {
      ELECTRON_APP: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    });

    pythonProcess = spawn(pythonExecutable, [scriptPath], { env });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python stdout: ${data}`);
      if (data.toString().includes('Running on http')) {
        console.log('Server started successfully');
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('error', (error) => {
      console.error(`Failed to start Python process: ${error}`);
      dialog.showErrorBox('Python Error', `Failed to start the Python server: ${error.message}`);
      reject(error);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0 && mainWindow) {
        dialog.showErrorBox('Server Error', `The Python server stopped unexpectedly with code ${code}`);
      }
    });

    waitOn({
      resources: [URL],
      timeout: 30000
    })
      .then(() => {
        console.log('Flask server is running');
        resolve();
      })
      .catch((err) => {
        console.error('Error waiting for Flask server to start:', err);
        dialog.showErrorBox('Server Error', `Failed to connect to the Flask server: ${err.message}`);
        reject(err);
      });
  });
}

// IPC handlers
ipcMain.handle('restart-server', async () => {
  if (pythonProcess) {
    kill(pythonProcess.pid);
    pythonProcess = null;
  }
  try {
    await startPythonServer();
    return { success: true, message: 'Server restarted successfully' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('log', (event, data) => {
  const { level, message, data: logData } = data;
  console[level in console ? level : 'log'](`[Renderer] ${message}`, logData || '');
});

ipcMain.handle('show-dialog', async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options);
});

ipcMain.on('open-external', async (event, { url }) => {
  if (url.startsWith('http') || url.startsWith('https')) {
    await shell.openExternal(url);
  }
});

ipcMain.on('navigate', (event, action) => {
  if (!mainWindow) return;

  console.log('Navigation action received:', action);

  switch (action) {
    case 'back':
      if (mainWindow.webContents.canGoBack()) {
        console.log('Navigating back');
        mainWindow.webContents.goBack();
      } else {
        console.log('Cannot go back - no history');
      }
      break;
    case 'forward':
      if (mainWindow.webContents.canGoForward()) {
        console.log('Navigating forward');
        mainWindow.webContents.goForward();
      } else {
        console.log('Cannot go forward - no forward history');
      }
      break;
    case 'home':
      console.log('Navigating to home');
      mainWindow.loadURL(URL);
      break;
    case 'refresh':
      console.log('Refreshing page');
      mainWindow.webContents.reload();
      break;
    default:
      console.log('Unknown navigation action:', action);
  }
});

// New IPC handlers for desktop memory storage of document content and chat history
ipcMain.on('set-document-content', (event, content) => {
  global.documentContent = content;
});
ipcMain.on('get-document-content', (event) => {
  event.returnValue = global.documentContent;
});
ipcMain.on('set-chat-history', (event, history) => {
  global.chatHistory = history;
});
ipcMain.on('get-chat-history', (event) => {
  event.returnValue = global.chatHistory;
});

// Add this near your other IPC handlers
ipcMain.handle('clear-session-data', () => {
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      sessionStorage.clear();
    `);
  }
});

// Start the app
app.on('ready', async () => {
  try {
    await startPythonServer();
    createWindow();
  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pythonProcess) {
      kill(pythonProcess.pid);
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (mainWindow) {
    mainWindow.webContents.send('app-closing');
    mainWindow.webContents.executeJavaScript(`
      sessionStorage.clear();
      if (window.cleanupTimer) {
        window.cleanupTimer();
      }
    `);
  }
  if (pythonProcess) {
    kill(pythonProcess.pid);
  }
});
