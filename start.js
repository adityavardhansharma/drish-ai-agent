const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

let electronProcess = null;

function cleanup() {
  if (electronProcess) {
    electronProcess.kill();
  }
  process.exit();
}

console.log('Starting AI Agent Pro application...');

electronProcess = spawn(electron, [path.join(__dirname, 'electron.js')], {
  stdio: 'inherit',
  env: Object.assign({}, process.env, {
    ELECTRON_APP: '1'
  })
});

electronProcess.on('close', (code) => {
  console.log(`Electron app closed with code ${code}`);
  process.exit(code || 0);
});

electronProcess.on('error', (error) => {
  console.error('Failed to start Electron:', error);
  cleanup();
});

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup();
});
