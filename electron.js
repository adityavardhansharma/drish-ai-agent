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
  
  // For Mac and Linux
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

  // Remove default zoom factor to fix automatic zoom-out issue
  // mainWindow.webContents.setZoomFactor(0.9);
  
  // Remove default menu bar
  Menu.setApplicationMenu(null);

  // Load the Flask app URL
  mainWindow.loadURL(URL);

  // Add zoom shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key === '=') {
      // Ctrl/Cmd + = (zoom in)
      mainWindow.webContents.setZoomFactor(mainWindow.webContents.getZoomFactor() + 0.1);
      event.preventDefault();
    } else if (input.control && input.key === '-') {
      // Ctrl/Cmd + - (zoom out)
      mainWindow.webContents.setZoomFactor(mainWindow.webContents.getZoomFactor() - 0.1);
      event.preventDefault();
    } else if (input.control && input.key === '0') {
      // Ctrl/Cmd + 0 (reset zoom)
      mainWindow.webContents.setZoomFactor(1.0); // Set to 1.0 instead of 0.9
      event.preventDefault();
    }
  });

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Open links in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('https')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pythonProcess) {
      kill(pythonProcess.pid);
    }
  });
}

async function startPythonServer() {
  return new Promise((resolve, reject) => {
    // Get the resource path
    const resourcePath = getResourcePath();
    
    // Determine the Python executable path
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    
    // Path to the main Flask app
    const scriptPath = path.join(resourcePath, 'main.py');
    
    // Check if the script exists
    if (!fs.existsSync(scriptPath)) {
      const error = new Error(`Python script not found at: ${scriptPath}`);
      console.error(error);
      reject(error);
      return;
    }
    
    console.log(`Starting Python server with script: ${scriptPath}`);
    
    // Environment variables for Python process
    const env = Object.assign({}, process.env, {
      ELECTRON_APP: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    });
    
    // Spawn the Python process
    pythonProcess = spawn(pythonExecutable, [scriptPath], { env });
    
    // Handle Python process output
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
      dialog.showErrorBox(
        'Python Error',
        `Failed to start the Python server: ${error.message}`
      );
      reject(error);
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0 && mainWindow) {
        dialog.showErrorBox(
          'Server Error',
          `The Python server stopped unexpectedly with code ${code}`
        );
      }
    });
    
    // Wait for the server to start
    waitOn({
      resources: [URL],
      timeout: 30000 // 30 seconds
    })
      .then(() => {
        console.log('Flask server is running');
        resolve();
      })
      .catch((err) => {
        console.error('Error waiting for Flask server to start:', err);
        dialog.showErrorBox(
          'Server Error',
          `Failed to connect to the Flask server: ${err.message}`
        );
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

// Handle log messages from renderer
ipcMain.on('log', (event, data) => {
  const { level, message, data: logData } = data;
  console[level in console ? level : 'log'](`[Renderer] ${message}`, logData || '');
});

// Handle show dialog
ipcMain.handle('show-dialog', async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options);
});

// Handle opening external links
ipcMain.on('open-external', async (event, { url }) => {
  if (url.startsWith('http') || url.startsWith('https')) {
    await shell.openExternal(url);
  }
});

// Handle navigation
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

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pythonProcess) {
      kill(pythonProcess.pid);
    }
    app.quit();
  }
});

// On macOS, recreate the window when dock icon is clicked
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Clean up Python process on exit
app.on('before-quit', () => {
  if (pythonProcess) {
    kill(pythonProcess.pid);
  }
}); 