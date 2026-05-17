const { spawn } = require('child_process');
const electron = require('electron');
const net = require('net');
const path = require('path');
const waitOn = require('wait-on');
const kill = require('tree-kill');

let electronProcess = null;
let viteProcess = null;

const isDev = process.env.NODE_ENV === 'development';
const host = process.env.HOST || '127.0.0.1';
let backendPort = Number.parseInt(process.env.PORT || '5000', 10);
let frontendPort = Number.parseInt(process.env.FRONTEND_PORT || '5173', 10);
let frontendUrl = process.env.FRONTEND_URL || `http://${host}:${frontendPort}`;

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function canListen(port, listenHost) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, listenHost);
  });
}

async function findAvailablePort(startPort, listenHost) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await canListen(port, listenHost)) {
      return port;
    }
  }
  throw new Error(`No available port found from ${startPort} to ${startPort + 99}`);
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

  console.log(`Starting Vite frontend on ${frontendUrl}...`);
  viteProcess = spawn(
    npmCommand(),
    ['run', 'dev', '--', '--host', host, '--port', String(frontendPort), '--strictPort'],
    {
    cwd: path.join(__dirname, 'gui'),
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
      BROWSER: 'none',
      HOST: host,
      PORT: String(backendPort),
      FRONTEND_PORT: String(frontendPort),
      VITE_BACKEND_URL: `http://${host}:${backendPort}`
    })
    },
  );

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
    HOST: host,
    PORT: String(backendPort),
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

async function start() {
  backendPort = await findAvailablePort(backendPort, host);
  if (isDev) {
    frontendPort = await findAvailablePort(frontendPort, host);
    frontendUrl = process.env.FRONTEND_URL || `http://${host}:${frontendPort}`;
  }

  console.log(`Using backend port ${backendPort}`);
  if (isDev) {
    console.log(`Using frontend port ${frontendPort}`);
  }

  await startVite();
  startElectron();
}

start()
  .catch((error) => {
    console.error('Failed to start application:', error);
    cleanup();
  });

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup();
});
