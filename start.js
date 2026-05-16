const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');
const waitOn = require('wait-on');
const kill = require('tree-kill');

let electronProcess = null;
let viteProcess = null;

const isDev = process.env.NODE_ENV === 'development';
const frontendUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:5173';

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function cleanup() {
  if (viteProcess) {
    kill(viteProcess.pid);
  }
  if (electronProcess) {
    kill(electronProcess.pid);
  }
  process.exit();
}

async function startVite() {
  if (!isDev) {
    return;
  }

  console.log('Starting Vite frontend...');
  viteProcess = spawn(npmCommand(), ['run', 'dev', '--', '--host', '127.0.0.1'], {
    cwd: path.join(__dirname, 'gui'),
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
      BROWSER: 'none'
    })
  });

  viteProcess.on('close', (code) => {
    console.log(`Vite frontend closed with code ${code}`);
    if (electronProcess) {
      cleanup();
    }
  });

  viteProcess.on('error', (error) => {
    console.error('Failed to start Vite frontend:', error);
    cleanup();
  });

  await waitOn({ resources: [frontendUrl], timeout: 30000 });
}

function startElectron() {
  console.log('Starting AI Agent Pro application...');
  const electronEnv = Object.assign({}, process.env, {
    ELECTRON_APP: '1',
    FRONTEND_URL: frontendUrl
  });
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  electronProcess = spawn(electron, [path.join(__dirname, 'electron.js')], {
    stdio: 'inherit',
    env: electronEnv
  });

  electronProcess.on('close', (code) => {
    console.log(`Electron app closed with code ${code}`);
    if (viteProcess) {
      kill(viteProcess.pid);
    }
    process.exit(code || 0);
  });

  electronProcess.on('error', (error) => {
    console.error('Failed to start Electron:', error);
    cleanup();
  });
}

startVite()
  .then(startElectron)
  .catch((error) => {
    console.error('Failed to start frontend:', error);
    cleanup();
  });

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup();
});
