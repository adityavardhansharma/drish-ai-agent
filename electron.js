const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  Menu
} = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const waitOn = require('wait-on');
const kill = require('tree-kill');

// Add auto-launch functionality via the auto-launch package
const AutoLaunch = require('auto-launch');

if (process.env.ENABLE_GPU !== '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

let mainWindow;
let backendProcess = null;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const PORT = process.env.PORT || '5000';
const HOST = process.env.HOST || '127.0.0.1';
const BACKEND_URL = `http://${HOST}:${PORT}`;
const FRONTEND_URL =
  process.env.NODE_ENV === 'development'
    ? process.env.FRONTEND_URL || 'http://127.0.0.1:5173'
    : BACKEND_URL;

// Create an auto launcher instance
const appAutoLauncher = new AutoLaunch({
  name: 'AI Agent Pro',
  path: app.getPath('exe'),
  isHidden: false
});

// Get the appropriate path for resources
function getResourcePath() {
  if (!app.isPackaged) {
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
      preload: path.join(__dirname, 'static', 'electron_bridge.js')
    },
    title: 'AI Agent Pro',
    icon: path.join(__dirname, 'resources', 'icon.png')
  });

  Menu.setApplicationMenu(null);
  mainWindow.webContents.session.clearCache().then(() => mainWindow.loadURL(FRONTEND_URL));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === '=') {
      mainWindow.webContents.setZoomFactor(
        mainWindow.webContents.getZoomFactor() + 0.1
      );
      event.preventDefault();
    } else if (input.control && input.key === '-') {
      mainWindow.webContents.setZoomFactor(
        mainWindow.webContents.getZoomFactor() - 0.1
      );
      event.preventDefault();
    } else if (input.control && input.key === '0') {
      mainWindow.webContents.setZoomFactor(1.0);
      event.preventDefault();
    }
  });

  if (process.env.OPEN_DEVTOOLS === '1') {
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
    if (backendProcess) {
      kill(backendProcess.pid);
    }
  });
}

async function startBackendServer() {
  return new Promise((resolve, reject) => {
    const resourcePath = getResourcePath();
    const tsxPath = path.join(
      resourcePath,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
    );
    const scriptPath = path.join(resourcePath, 'backend', 'server.ts');

    if (!fs.existsSync(scriptPath)) {
      const error = new Error(`TypeScript backend not found at: ${scriptPath}`);
      console.error(error);
      reject(error);
      return;
    }

    console.log(`Starting TypeScript backend with script: ${scriptPath}`);
    const env = Object.assign({}, process.env, {
      ELECTRON_APP: '1'
    });

    const command = fs.existsSync(tsxPath) ? tsxPath : 'npx';
    const args = fs.existsSync(tsxPath) ? [scriptPath] : ['tsx', scriptPath];
    backendProcess = spawn(command, args, { env, cwd: resourcePath });

    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend stdout: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend stderr: ${data}`);
    });

    backendProcess.on('error', (error) => {
      console.error(`Failed to start backend process: ${error}`);
      dialog.showErrorBox(
        'Backend Error',
        `Failed to start the TypeScript backend: ${error.message}`
      );
      reject(error);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
      if (code !== 0 && mainWindow) {
        dialog.showErrorBox(
          'Server Error',
          `The TypeScript backend stopped unexpectedly with code ${code}`
        );
      }
    });

    waitOn({ resources: [BACKEND_URL], timeout: 30000 })
      .then(() => {
        console.log('TypeScript backend is running');
        resolve();
      })
      .catch((err) => {
        console.error('Error waiting for backend server to start:', err);
        dialog.showErrorBox(
          'Server Error',
          `Failed to connect to the TypeScript backend: ${err.message}`
        );
        reject(err);
      });
  });
}

// IPC handlers
ipcMain.handle('restart-server', async () => {
  if (backendProcess) {
    kill(backendProcess.pid);
    backendProcess = null;
  }
  try {
    await startBackendServer();
    return { success: true, message: 'Server restarted successfully' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function logRendererMessage(data) {
  if (typeof data === 'string') {
    console.log(`[Renderer] ${data}`);
    return;
  }

  const { level = 'log', message = '', context, data: logData } = data || {};
  const logLevel = level in console ? level : 'log';
  console[logLevel](`[Renderer] ${message}`, context || logData || '');
}

// Logging from renderer. Keep the old channel for compatibility.
ipcMain.on('log', (event, data) => logRendererMessage(data));
ipcMain.on('log-message', (event, data) => logRendererMessage(data));
ipcMain.on('logToMain', (event, data) => logRendererMessage(data));

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
      mainWindow.loadURL(FRONTEND_URL);
      break;
    case 'refresh':
      console.log('Refreshing page');
      mainWindow.webContents.reload();
      break;
    default:
      console.log('Unknown navigation action:', action);
  }
});

// Clear session data
ipcMain.handle('clear-session-data', () => {
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      sessionStorage.clear();
    `);
  }
});

// Auto-start IPC handlers
ipcMain.handle('get-auto-start-enabled', async () => {
  try {
    const isEnabled = await appAutoLauncher.isEnabled();
    console.log('Auto-start is currently:', isEnabled);
    return isEnabled;
  } catch (error) {
    console.error('Error checking auto-start status:', error);
    return false;
  }
});

ipcMain.handle('set-auto-start-enabled', async (event, enabled) => {
  try {
    if (enabled) {
      await appAutoLauncher.enable();
      console.log('Auto-start enabled');
    } else {
      await appAutoLauncher.disable();
      console.log('Auto-start disabled');
    }
    return true;
  } catch (error) {
    console.error('Error setting auto-start:', error);
    return false;
  }
});

// Start the app
app.on('ready', async () => {
  try {
    await startBackendServer();
    createWindow();
  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) {
      kill(backendProcess.pid);
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
  if (backendProcess) {
    kill(backendProcess.pid);
  }
});
