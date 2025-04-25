// Launch script for the Electron app
const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');
const waitOn = require('wait-on');
const fs = require('fs');
const kill = require('tree-kill');

// Configuration
const isDev = process.env.NODE_ENV === 'development';
const PORT = 5000;
const URL = `http://localhost:${PORT}`;

// Store processes for cleanup
let electronProcess = null;
let pythonProcess = null;

/**
 * Launches the Python Flask backend server as a child process and waits until it is ready to accept connections.
 *
 * Spawns the Python process running `main.py` with environment variables set for unbuffered UTF-8 output and Electron integration. Resolves once the Flask server is accessible at the configured URL, or rejects if the server fails to start or does not become available within 30 seconds.
 *
 * @returns {Promise<void>} Resolves when the Flask server is ready to accept requests.
 *
 * @throws {Error} If the Python process fails to start, exits with a non-zero code, or the Flask server does not become available within the timeout period.
 */
function startPythonServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting Python server...');
    
    // Determine Python executable (python on Windows, python3 on Mac/Linux)
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    const mainScript = path.join(__dirname, 'main.py');
    
    // Environment variables for Python process
    const env = Object.assign({}, process.env, {
      ELECTRON_APP: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1'
    });
    
    // Start the Python Flask server
    pythonProcess = spawn(pythonExecutable, [mainScript], { env });
    
    // Handle Python process stdout
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Python: ${output}`);
      
      // Check if Flask server is running
      if (output.includes('Running on http')) {
        console.log('Python Flask server started successfully');
      }
    });
    
    // Handle Python process stderr
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python error: ${data}`);
    });
    
    // Handle Python process exit
    pythonProcess.on('exit', (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
    
    // Handle Python process error
    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      reject(err);
    });
    
    // Wait for the server to start
    waitOn({
      resources: [URL],
      timeout: 30000
    })
      .then(() => {
        console.log('Flask server is ready');
        resolve();
      })
      .catch((err) => {
        console.error('Error waiting for Flask server:', err);
        if (pythonProcess) {
          kill(pythonProcess.pid);
        }
        reject(err);
      });
  });
}

/**
 * Launches the Electron application as a child process.
 *
 * Starts the Electron frontend by spawning a new process running {@link electron.js}. When the Electron process exits, triggers cleanup of all managed processes.
 */
function startElectron() {
  console.log('Starting Electron app...');
  
  // Start Electron with our main script
  electronProcess = spawn(electron, [path.join(__dirname, 'electron.js')], {
    stdio: 'inherit'
  });
  
  // Handle Electron process exit
  electronProcess.on('close', () => {
    console.log('Electron app closed');
    cleanup();
  });
}

/**
 * Terminates the Electron and Python server processes and exits the application.
 *
 * Ensures both child processes are properly killed to prevent orphaned processes before shutting down the main process.
 */
function cleanup() {
  console.log('Cleaning up processes...');
  
  if (electronProcess) {
    electronProcess.kill();
  }
  
  if (pythonProcess) {
    kill(pythonProcess.pid, (err) => {
      if (err) {
        console.error('Error killing Python process:', err);
      }
    });
  }
  
  process.exit();
}

// Handle process exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
});

// Start the app
console.log('Starting AI Agent Pro application...');
startPythonServer()
  .then(startElectron)
  .catch((err) => {
    console.error('Failed to start application:', err);
    cleanup();
  }); 