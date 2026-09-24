import { spawn } from 'node:child_process';
import process from 'node:process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const SERVICES = [
  { name: 'gateway', port: 3000, color: 34 },
  { name: 'tenant', port: 3001, color: 33 },
  { name: 'user', port: 3002, color: 32 },
];

const children = [];

function emit(tag, color, data) {
  const lines = String(data).split(/\r?\n/);
  for (const line of lines) {
    if (line.trim()) {
      console.log(`\x1b[2m${new Date().toISOString().slice(11, 19)}\x1b[0m \x1b[${color}m${tag}\x1b[0m ${line}`);
    }
  }
}

for (const service of SERVICES) {
  const child = spawn(npm, ['run', `dev:${service.name}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);

  const tag = `[${service.name}]`;
  child.stdout.on('data', (data) => emit(tag, service.color, data));
  child.stderr.on('data', (data) => emit(tag, service.color, data));
  child.on('exit', (code, signal) => {
    emit(tag, service.color, `exited (${signal ?? `code ${code}`})`);
  });
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());