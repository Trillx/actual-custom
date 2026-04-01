const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || '5000';
const DATA_DIR = process.env.ACTUAL_DATA_DIR || '/home/runner/actual-data';

const serverPath = path.join(__dirname, 'packages', 'sync-server', 'build', 'app.js');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: PORT,
  ACTUAL_PORT: PORT,
  ACTUAL_DATA_DIR: DATA_DIR,
  ACTUAL_SERVER_FILES: path.join(DATA_DIR, 'server-files'),
  ACTUAL_USER_FILES: path.join(DATA_DIR, 'user-files'),
  ACTUAL_HOSTNAME: '0.0.0.0',
};

console.log(`Starting Actual Budget sync server on port ${PORT}`);
console.log(`Data directory: ${DATA_DIR}`);

const child = spawn('node', [serverPath], {
  env,
  stdio: 'inherit',
  cwd: __dirname,
});

child.on('error', (err) => {
  console.error('Failed to start sync server:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`Sync server exited with code ${code}`);
  process.exit(code || 0);
});

process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
