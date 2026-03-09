import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { parseEnv } from './utils.js';

// ─── GENERATE COMMAND ─────────────────────────────────────────────────────────

export async function runGenerate(outputDir = process.cwd(), opts = {}) {
  console.log('');
  p.intro(
    `${pc.bgCyan(pc.black(' DesignPull '))}  ${pc.cyan('generate')}`
  );

  // ── 1. Preflight checks (same as sync) ────────────────────────────────────
  const claudeInstalled = await checkClaudeCode();
  if (!claudeInstalled) {
    p.log.error(
      `${pc.bold('claude')} CLI not found.\n\n` +
      `Install it:\n\n` +
      `  ${pc.cyan('npm install -g @anthropic-ai/claude-code')}\n\n` +
      `Then run ${pc.cyan('designpull generate')} again.`
    );
    process.exit(1);
  }

  const mcpReady = await checkFigmaMcp();
  if (!mcpReady) {
    p.log.error(
      `Figma Console MCP not found in your Claude Code config.\n\n` +
      `Add it by running:\n\n` +
      `  ${pc.cyan('claude mcp add figma-console -s user \\\n' +
      '  -e FIGMA_ACCESS_TOKEN=figd_... \\\n' +
      '  -e ENABLE_MCP_APPS=true \\\n' +
      '  -- npx -y figma-console-mcp@latest')}\n\n` +
      `Then run ${pc.cyan('designpull generate')} again.`
    );
    process.exit(1);
  }

  // ── 2. Check token map exists ──────────────────────────────────────────────
  const tokenMapPath = path.join(outputDir, '.designpull', 'token-map.json');
  if (!fs.existsSync(tokenMapPath)) {
    p.log.error(
      `Token map not found.\n\n` +
      `Run ${pc.cyan('designpull sync')} first to create your design tokens in Figma.\n` +
      `The token map (${pc.bold('.designpull/token-map.json')}) is generated during sync.`
    );
    process.exit(1);
  }

  const tokenMap = JSON.parse(fs.readFileSync(tokenMapPath, 'utf-8'));

  // ── 3. Load .env for Figma URL ─────────────────────────────────────────────
  const envPath = path.join(outputDir, '.env');
  let figmaUrl = '';
  if (fs.existsSync(envPath)) {
    const env = parseEnv(fs.readFileSync(envPath, 'utf-8'));
    figmaUrl = env.FIGMA_FILE_URL || '';
  }

  p.log.message(
    `${pc.dim('Token map:    ')}${pc.white(tokenMapPath)}\n` +
    `${pc.dim('Figma file:   ')}${pc.white(figmaUrl || 'see .env')}\n` +
    `${pc.dim('Generate via: ')}${pc.white('Claude Code + Figma Console MCP')}`
  );

  // ── 4. Show which components will be generated ────────────────────────────
  const components = [
    { name: 'Button', variants: 'primary, secondary, ghost, danger', sizes: 'sm, md, lg', states: 'default, hover, focus, disabled, loading' },
    { name: 'Input', variants: 'default, error, disabled', sizes: 'sm, md, lg', states: 'default, focused, filled, error, disabled' },
    { name: 'Card', variants: 'default, elevated, outlined' },
    { name: 'Badge', variants: 'default, success, warning, error, info', sizes: 'sm, md' },
    { name: 'Text', variants: 'All type scale styles from Typography collection' },
  ];

  p.log.message(
    pc.bold('Components to generate:\n') +
    components.map(c => {
      let desc = `  ${pc.cyan('◆')} ${pc.bold(c.name)}`;
      if (c.variants) desc += `\n     variants: ${pc.dim(c.variants)}`;
      if (c.sizes) desc += `\n     sizes: ${pc.dim(c.sizes)}`;
      if (c.states) desc += `\n     states: ${pc.dim(c.states)}`;
      return desc;
    }).join('\n\n')
  );

  // ── 5. Confirm ─────────────────────────────────────────────────────────────
  const confirmed = await p.confirm({
    message: `Generate ${components.length} components in Figma via MCP?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Generate cancelled.');
    process.exit(0);
  }

  // ── 6. Desktop Bridge reminder ────────────────────────────────────────────
  p.log.message(
    `${pc.yellow('!')} Make sure the ${pc.bold('Desktop Bridge')} plugin is running in your Figma file.\n` +
    `  ${pc.dim('Figma Desktop → Plugins → Development → Figma Desktop Bridge')}`
  );

  const bridgeReady = await p.confirm({
    message: 'Desktop Bridge is running in Figma',
    initialValue: true,
  });

  if (p.isCancel(bridgeReady) || !bridgeReady) {
    p.cancel('Start the Desktop Bridge plugin then run designpull generate again.');
    process.exit(0);
  }

  // ── 7. Spawn Claude Code + MCP ────────────────────────────────────────────
  const genSpinner = p.spinner();
  genSpinner.start('Generating components in Figma via Claude Code MCP');

  const tmpDir = path.join(outputDir, '.designpull');
  const tmpPromptPath = path.join(tmpDir, 'generate-prompt.txt');

  const prompt = buildGenerateMcpPrompt(tokenMap, figmaUrl);
  fs.writeFileSync(tmpPromptPath, prompt, 'utf-8');

  try {
    const output = await spawnClaudeCode(tmpPromptPath, outputDir, (line) => {
      const clean = line.replace(/\x1B\[[0-9;]*m/g, '').trim();
      if (clean.length > 4) genSpinner.message(truncate(clean, 64));
    });

    genSpinner.stop('Components generated in Figma');

    const summary = extractSummary(output);

    p.note(
      [
        `${pc.green('✓')} Components generated: ${components.map(c => pc.bold(c.name)).join(', ')}`,
        summary ? `${pc.green('✓')} ${summary}` : '',
        '',
        pc.dim('Open Figma → Components page to see the generated components.'),
        pc.dim('All visual values reference variables from your token system.'),
      ].filter(Boolean).join('\n'),
      'Generate complete'
    );

  } catch (err) {
    genSpinner.stop('Generate failed');
    p.log.error(
      `Claude Code MCP error: ${err.message}\n\n` +
      pc.dim('Common causes:\n') +
      pc.dim('  · Desktop Bridge plugin not running in your Figma file\n') +
      pc.dim('  · figma-console MCP not configured — run: claude mcp list\n') +
      pc.dim('  · Token map is invalid or empty\n')
    );
    process.exit(1);
  } finally {
    if (fs.existsSync(tmpPromptPath)) fs.unlinkSync(tmpPromptPath);
  }

  p.outro(`${pc.dim('Figma: ')}${pc.cyan(figmaUrl || 'see .env')}`);
}

// ─── GENERATE MCP PROMPT ──────────────────────────────────────────────────────

function buildGenerateMcpPrompt(tokenMap, figmaUrl) {
  return `You are generating Figma components using the Figma Console MCP.
The Desktop Bridge plugin is running. Token variables are already created in the file.

Figma file: ${figmaUrl || 'the currently open Figma file'}

Token map context:
${JSON.stringify(tokenMap, null, 2)}

Execute the following completely without asking for confirmation.

---

## STEP 1 — Ensure "Components" page exists

Create a page named "Components" if it doesn't exist. All generated components will be placed here.

---

## STEP 2 — Generate Button component

Use figma_execute to build the Button component on the Components page.

Variants to create:
- Type: primary, secondary, ghost, danger
- Size: sm, md, lg
- State: default, hover, focus, disabled, loading

Visual properties (ALL must reference variables):
- background: color/interactive/primary (primary), transparent (ghost), etc.
- background-hover: color/interactive/primaryHover
- text: color/text/inverse (primary), color/text/primary (ghost)
- border-radius: radius/interactive
- padding-x: spacing/md
- padding-y: spacing/sm
- font: typography/label/md

NO hardcoded hex colors, NO hardcoded spacing values.

---

## STEP 3 — Generate Input component

Variants: default, error, disabled
Sizes: sm, md, lg
States: default, focused, filled, error, disabled

Visual properties (reference variables):
- background: color/surface/raised
- border: color/border/default
- border-focus: color/border/focus
- text: color/text/primary
- placeholder: color/text/secondary

---

## STEP 4 — Generate Card component

Variants: default, elevated, outlined

Visual properties:
- background: color/surface/raised
- border: color/border/default (outlined)
- border-radius: radius/card
- shadow: elevation/sm (elevated)
- padding: spacing/lg

---

## STEP 5 — Generate Badge component

Variants: default, success, warning, error, info
Sizes: sm, md

Visual properties:
- background: color/feedback/{variant}
- text: color/text/inverse
- border-radius: radius/full
- padding: spacing/xs spacing/sm
- font: typography/label/sm

---

## STEP 6 — Generate Text styles

Create text layer examples for all Typography styles:
- hero, h1, h2, h3, h4, h5, h6
- body/lg, body/md, body/sm
- label/md, label/sm
- caption, code

Use Desktop mode values. Each should be a text layer with the style applied.

---

## STEP 7 — Verify

1. Confirm all components were placed on the Components page
2. Count total components created
3. Report: "Generated X components on Components page"

Do not stop between steps. Execute all steps now and report results when done.`;
}

// ─── SPAWN CLAUDE CODE ────────────────────────────────────────────────────────

function spawnClaudeCode(promptFilePath, cwd, onLine, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['--print', '--dangerously-skip-permissions', `--message`, `$(cat "${promptFilePath}")`],
      {
        cwd,
        shell: true,
        env: { ...process.env },
      }
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error(
        `Claude Code subprocess timed out after ${timeoutMs / 1000}s.\n` +
        `The Desktop Bridge plugin may have disconnected.\n` +
        `Restart the plugin in Figma and run designpull generate again.`
      ));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      text.split('\n').forEach(line => onLine?.(line));
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) return;

      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout || `Claude Code exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      if (!timedOut) {
        reject(new Error(`Failed to start Claude Code: ${err.message}`));
      }
    });
  });
}

// ─── PREFLIGHT CHECKS ─────────────────────────────────────────────────────────

async function checkClaudeCode() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function checkFigmaMcp() {
  return new Promise((resolve) => {
    const child = spawn('claude', ['mcp', 'list'], { shell: true });
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    child.on('close', () => {
      resolve(output.toLowerCase().includes('figma'));
    });
    child.on('error', () => resolve(false));
  });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function extractSummary(output) {
  const lines = output.split('\n')
    .map(l => l.replace(/\x1B\[[0-9;]*m/g, '').trim())
    .filter(l => l.length > 10 && !l.startsWith('{') && !l.startsWith('['));
  return lines[lines.length - 1] || '';
}
