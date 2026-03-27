import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { parseEnv } from './utils.js';

// ─── DOCTOR COMMAND ───────────────────────────────────────────────────────────

export async function runDoctor(outputDir = process.cwd()) {
  console.log('');
  p.intro(
    `${pc.bgCyan(pc.black(' DesignPull '))}  ${pc.cyan('doctor')}`
  );

  p.log.message(pc.dim('Checking your DesignPull environment...\n'));

  const checks = [];
  let passed = 0;

  // ── 1. Node.js version ─────────────────────────────────────────────────────
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  const nodeOk = nodeMajor >= 20;
  checks.push({
    name: 'Node.js version (>= 20)',
    status: nodeOk ? 'pass' : 'fail',
    value: nodeVersion,
    fix: nodeOk ? null : 'Install Node.js 20 or higher from nodejs.org',
  });
  if (nodeOk) passed++;

  // ── 2. Claude Code installed ───────────────────────────────────────────────
  const claudeVersion = await getClaudeVersion();
  const claudeOk = claudeVersion !== null;
  checks.push({
    name: 'claude CLI installed',
    status: claudeOk ? 'pass' : 'fail',
    value: claudeVersion || 'not found',
    fix: claudeOk ? null : 'Run: npm install -g @anthropic-ai/claude-code',
  });
  if (claudeOk) passed++;

  // ── 3. Figma MCP server configured ─────────────────────────────────────────
  const figmaMcp = await checkFigmaMcp();
  checks.push({
    name: 'Figma MCP server configured',
    status: figmaMcp ? 'pass' : 'fail',
    value: figmaMcp ? 'configured' : 'not found',
    fix: figmaMcp ? null : 'Run: claude mcp add --transport http figma https://mcp.figma.com/mcp -s user',
  });
  if (figmaMcp) passed++;

  // ── 4. Chakra UI MCP (optional) ────────────────────────────────────────────
  const chakraMcp = await checkChakraMcp();
  checks.push({
    name: 'Chakra UI MCP configured (optional)',
    status: chakraMcp ? 'pass' : 'warn',
    value: chakraMcp ? 'configured' : 'not found',
    fix: chakraMcp ? null : 'Optional: Add Chakra UI MCP for component generation hints',
  });
  if (chakraMcp) passed++;

  // ── 5. FIGMA_ACCESS_TOKEN ──────────────────────────────────────────────────
  const envPath = path.join(outputDir, '.env');
  let figmaPat = '';
  if (fs.existsSync(envPath)) {
    const env = parseEnv(fs.readFileSync(envPath, 'utf-8'));
    figmaPat = env.FIGMA_ACCESS_TOKEN || '';
  }
  const figmaPatOk = figmaPat && figmaPat.startsWith('figd_') && figmaPat !== 'your_pat_here';
  checks.push({
    name: 'FIGMA_ACCESS_TOKEN set',
    status: figmaPatOk ? 'pass' : 'fail',
    value: figmaPatOk ? 'set' : 'missing',
    fix: figmaPatOk ? null : 'Set FIGMA_ACCESS_TOKEN in .env (get one at figma.com → Account Settings → Security)',
  });
  if (figmaPatOk) passed++;

  // ── 6. design-token.md ─────────────────────────────────────────────────────
  const tokenPath = path.join(outputDir, 'design-token.md');
  const tokenExists = fs.existsSync(tokenPath);
  checks.push({
    name: 'design-token.md exists',
    status: tokenExists ? 'pass' : 'fail',
    value: tokenExists ? 'found' : 'not found',
    fix: tokenExists ? null : 'Run: designpull init',
  });
  if (tokenExists) passed++;

  // ── 7. token-map.json (has been synced) ────────────────────────────────────
  const tokenMapPath = path.join(outputDir, '.designpull', 'token-map.json');
  const tokenMapExists = fs.existsSync(tokenMapPath);
  checks.push({
    name: '.designpull/token-map.json exists (synced)',
    status: tokenMapExists ? 'pass' : 'fail',
    value: tokenMapExists ? 'found' : 'not found',
    fix: tokenMapExists ? null : 'Run: designpull sync',
  });
  if (tokenMapExists) passed++;

  // ── Display results ────────────────────────────────────────────────────────
  const output = checks.map(check => {
    let icon;
    if (check.status === 'pass') icon = pc.green('✓');
    else if (check.status === 'warn') icon = pc.yellow('⚠');
    else icon = pc.red('✗');

    let line = `${icon}  ${check.name}`;
    if (check.value && check.status !== 'pass') {
      line += pc.dim(` → ${check.value}`);
    }
    return line;
  }).join('\n');

  p.log.message(output);

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = checks.filter(c => c.status !== 'warn').length;
  const passedRequired = checks.filter(c => c.status === 'pass' && c.status !== 'warn').length;

  console.log('');
  if (passed === checks.length) {
    p.note(
      pc.green(`${passedRequired}/${total} checks passed.`) + '\n\n' +
      pc.dim('Your environment is ready! Next steps:\n') +
      pc.dim('  1. ') + pc.cyan('designpull init') + pc.dim(' — set up tokens (if not done)\n') +
      pc.dim('  2. ') + pc.cyan('designpull sync') + pc.dim(' — write variables to Figma'),
      'Environment healthy'
    );
  } else {
    const failures = checks.filter(c => c.status === 'fail');
    p.note(
      pc.yellow(`${passedRequired}/${total} checks passed.`) + '\n\n' +
      pc.bold('Fix the following issues:\n\n') +
      failures.map(f => `  ${pc.red('✗')} ${f.name}\n    ${pc.dim(f.fix)}`).join('\n\n'),
      'Action required'
    );
  }

  p.outro(pc.dim('Questions? ') + pc.cyan('designpull.dev/docs'));
}

// ─── CHECKS ───────────────────────────────────────────────────────────────────

async function getClaudeVersion() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version']);
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) {
        const match = output.match(/(\d+\.\d+\.\d+)/);
        resolve(match ? match[1] : 'installed');
      } else {
        resolve(null);
      }
    });
    child.on('error', () => resolve(null));
  });
}

async function checkFigmaMcp() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['mcp', 'list']);
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('close', () => {
      resolve(output.toLowerCase().includes('figma'));
    });
    child.on('error', () => resolve(false));
  });
}

async function checkChakraMcp() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['mcp', 'list']);
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('close', () => {
      resolve(output.toLowerCase().includes('chakra'));
    });
    child.on('error', () => resolve(false));
  });
}
