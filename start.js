const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');
const waitOn = require('wait-on');
const fs = require('fs');
const kill = require('tree-kill');

const isDev = process.env.NODE_ENV === 'development';
const PORT = 5000;
const URL = `http://localhost:${PORT}`;

let electronProcess = null;
let pythonProcess = null;

/**
 * Start the Python Flask server
 */
function startPythonServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting Python server...');

    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    const mainScript = path.join(__dirname, 'main.py');
    const env = Object.assign({}, process.env, {
      ELECTRON_APP: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1'
    });

    pythonProcess = spawn(pythonExecutable, [mainScript], { env });

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Python: ${output}`);

      if (output.includes('Running on http')) {
        console.log('Python Flask server started successfully');
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python error: ${data}`);
    });

    pythonProcess.on('exit', (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      reject(err);
    });

    waitOn({ resources: [URL], timeout: 30000 })
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
 * Start the Electron app
 */
function startElectron() {
  console.log('Starting Electron app...');

  electronProcess = spawn(electron, [path.join(__dirname, 'electron.js')], {
    stdio: 'inherit'
  });

  electronProcess.on('close', () => {
    console.log('Electron app closed');
    cleanup();
  });
}

/**
 * Clean up processes
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

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
});

console.log('Starting AI Agent Pro application...');
startPythonServer()
  .then(startElectron)
  .catch((err) => {
    console.error('Failed to start application:', err);
    cleanup();
  });
