#!/usr/bin/env node

import { spawn } from 'child_process';
import { platform } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = platform() === 'win32';
const command = process.argv[2];

if (!command || !['start', 'stop', 'restart', 'status'].includes(command)) {
  console.error('Usage: node mcp-wrapper.js {start|stop|restart|status}');
  process.exit(1);
}

const scriptPath = isWindows
  ? join(__dirname, 'mcp-server.bat')
  : join(__dirname, 'mcp-server.sh');

const shellCommand = isWindows ? 'cmd' : 'bash';
const shellArgs = isWindows ? ['/c', scriptPath, command] : [scriptPath, command];

const child = spawn(shellCommand, shellArgs, {
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error(`Failed to execute ${scriptPath}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
