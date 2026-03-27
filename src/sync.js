import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { parseEnv } from './utils.js';
import { parseDesignTokens } from './parser.js';

// ─── VALIDATION ───────────────────────────────────────────────────────────────

function validateTokenMap(tokenMap) {
  if (!tokenMap.collections || !Array.isArray(tokenMap.collections)) {
    throw new Error('Token map missing collections array');
  }

  const required = ['Primitives', 'Semantic', 'Typography'];
  for (const name of required) {
    if (!tokenMap.collections.find(c => c.name === name)) {
      throw new Error(`Token map missing required collection: ${name}`);
    }
  }

  const totalVars = tokenMap.collections.reduce((sum, c) => sum + c.variables.length, 0);
  if (totalVars < 10) {
    throw new Error(
      `Token map has suspiciously few variables: ${totalVars}. Parse may have failed.`
    );
  }
}

// ─── SYNC COMMAND ─────────────────────────────────────────────────────────────

export async function runSync(outputDir = process.cwd(), opts = {}) {
  console.log('');
  p.intro(
    `${pc.bgCyan(pc.black(' DesignPull '))}  ${pc.cyan('sync')}`
  );

  // ── 1. Load and validate config ──────────────────────────────────────────────
  const tokenPath = path.join(outputDir, 'design-token.md');
  const envPath   = path.join(outputDir, '.env');

  if (!fs.existsSync(tokenPath)) {
    p.log.error(
      `${pc.bold('design-token.md')} not found.\n` +
      `Run ${pc.cyan('designpull init')} first.`
    );
    process.exit(1);
  }

  if (!fs.existsSync(envPath)) {
    p.log.error(
      `${pc.bold('.env')} not found.\n` +
      `Run ${pc.cyan('designpull init')} first.`
    );
    process.exit(1);
  }

  const env = parseEnv(fs.readFileSync(envPath, 'utf-8'));
  const { FIGMA_ACCESS_TOKEN: figmaPat, FIGMA_FILE_URL: figmaUrl } = env;

  const missing = [];
  if (!figmaPat || figmaPat === 'your_pat_here') missing.push('FIGMA_ACCESS_TOKEN');

  if (missing.length > 0) {
    p.log.error(
      `Missing required values in ${pc.bold('.env')}:\n` +
      missing.map(k => `  ${pc.yellow(k)}`).join('\n') + '\n' +
      `Open ${pc.bold('.env')} and fill these in, then run ${pc.cyan('designpull sync')} again.`
    );
    process.exit(1);
  }

  // ── 2. Preflight — Claude Code installed? ─────────────────────────────────
  const claudeInstalled = await checkClaudeCode();
  if (!claudeInstalled) {
    p.log.error(
      `${pc.bold('claude')} CLI not found.\n\n` +
      `DesignPull uses Claude Code to write variables to Figma via MCP.\n` +
      `Install it:\n\n` +
      `  ${pc.cyan('npm install -g @anthropic-ai/claude-code')}\n\n` +
      `Then run ${pc.cyan('designpull sync')} again.`
    );
    process.exit(1);
  }

  // ── 3. Preflight — Figma MCP configured? ────────────────────────────────
  const mcpReady = await checkFigmaMcp();
  if (!mcpReady) {
    p.log.warn(
      `Figma MCP server not found in your Claude Code config.\n\n` +
      `Run this to add it:\n\n` +
      `  ${pc.cyan('claude mcp add --transport http figma https://mcp.figma.com/mcp -s user')}\n\n` +
      `Then authenticate in your browser when prompted.\n` +
      `Guide: ${pc.dim('https://help.figma.com/hc/en-us/articles/39166810751895')}\n\n` +
      `Then run ${pc.cyan('designpull sync')} again.`
    );
    process.exit(1);
  }

  const tokenFile = fs.readFileSync(tokenPath, 'utf-8');

  p.log.message(
    `${pc.dim('Token file:   ')}${pc.white(tokenPath)}\n` +
    `${pc.dim('Figma file:   ')}${pc.white(figmaUrl || 'see .env')}\n` +
    `${pc.dim('Write method: ')}${pc.white('Claude Code + Figma MCP Skills')}`
  );

  // ── 4. Parse design-token.md with local parser ──────────────────────────
  const parseSpinner = p.spinner();
  parseSpinner.start('Parsing design-token.md');

  // Ensure .designpull directory exists
  const tmpDir = path.join(outputDir, '.designpull');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  let tokenMap;
  try {
    tokenMap = parseDesignTokens(tokenFile);

    // Validate schema before proceeding
    try {
      validateTokenMap(tokenMap);
    } catch (validationErr) {
      parseSpinner.stop('Parse validation failed');
      p.log.error(
        `Token map validation error: ${validationErr.message}\n\n` +
        pc.dim('Raw parse output saved to .designpull/failed-parse.json for debugging')
      );
      fs.writeFileSync(
        path.join(tmpDir, 'failed-parse.json'),
        JSON.stringify(tokenMap, null, 2),
        'utf-8'
      );
      process.exit(1);
    }

    parseSpinner.stop(
      `Parsed ${pc.bold(countTokens(tokenMap))} tokens across ` +
      `${pc.bold(tokenMap.collections.length)} collections`
    );
  } catch (err) {
    parseSpinner.stop('Parse failed');
    p.log.error(`Parse error: ${err.message}`);
    process.exit(1);
  }

  // Write parsed token map to .designpull/token-map.json for inspection
  const tokenMapPath = path.join(tmpDir, 'token-map.json');
  fs.writeFileSync(tokenMapPath, JSON.stringify(tokenMap, null, 2), 'utf-8');
  p.log.message(pc.dim(`Token map saved → ${tokenMapPath}`));

  // ── 5. Preview + confirm ──────────────────────────────────────────────────
  p.log.message(
    tokenMap.collections.map(col =>
      `  ${pc.cyan('◆')} ${pc.bold(col.name)}  ${pc.dim(`${col.variables.length} variables · ${col.modes.join(' / ')}`)}`
    ).join('\n')
  );

  // Handle --dry-run flag
  if (opts.dryRun) {
    p.note(
      `${pc.green('✓')} Token map parsed and saved to .designpull/token-map.json\n` +
      `${pc.dim('Review the file to verify before syncing.')}\n\n` +
      pc.dim('Run ') + pc.cyan('designpull sync') + pc.dim(' without --dry-run to write to Figma.'),
      'Dry run complete'
    );
    p.outro(pc.dim('No changes made to Figma'));
    return;
  }

  const confirmed = await p.confirm({
    message: `Write ${countTokens(tokenMap)} variables to Figma via figma-use skill?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Sync cancelled.');
    process.exit(0);
  }

  // ── 6. Write variables to Figma via Claude Code + figma-use skill ───────
  const writeSpinner = p.spinner();
  writeSpinner.start('Writing variables to Figma via Claude Code + figma-use');

  try {
    const result = await syncViaFigmaSkills(tokenMap, figmaUrl, tmpDir, outputDir, (line) => {
      const clean = line.replace(/\x1B\[[0-9;]*m/g, '').trim();
      if (clean.length > 4) writeSpinner.message(truncate(clean, 64));
    });

    // Validate that Claude actually used the Figma MCP tools
    const output = (result.output || '').toLowerCase();
    if (output.includes("don't have") || output.includes('not available') || output.includes('no figma')) {
      throw new Error(
        'Claude could not access Figma MCP tools.\n' +
        `Run: ${pc.cyan('claude mcp add --transport http figma https://mcp.figma.com/mcp -s user')}\n` +
        'Then authenticate in your browser when prompted.'
      );
    }

    writeSpinner.stop('Variables written to Figma');

    p.note(
      [
        `${pc.green('✓')} Collections: ${tokenMap.collections.map(c => pc.bold(c.name)).join(', ')}`,
        `${pc.green('✓')} Variables: ${pc.bold(countTokens(tokenMap))}`,
        '',
        pc.dim('Open Figma → right sidebar → Local variables to verify.'),
      ].filter(Boolean).join('\n'),
      'Sync complete'
    );

  } catch (err) {
    writeSpinner.stop('Write failed');
    p.log.error(
      `Figma write error: ${err.message}\n\n` +
      pc.dim('Common causes:\n') +
      pc.dim('  · Figma MCP server not configured — see designpull doctor\n') +
      pc.dim('  · Figma file URL in .env is incorrect\n') +
      pc.dim('  · PAT does not have file edit access\n')
    );
    process.exit(1);
  }

  p.outro(`${pc.dim('Figma: ')}${pc.cyan(figmaUrl || 'see .env')}`);
}

// ─── SYNC VIA CLAUDE CODE + FIGMA-USE SKILL ─────────────────────────────────

function buildFigmaUsePrompt(tokenMap, figmaUrl) {
  const primitives = tokenMap.collections.find(c => c.name === 'Primitives');
  const semantic   = tokenMap.collections.find(c => c.name === 'Semantic');
  const typography = tokenMap.collections.find(c => c.name === 'Typography');

  return `You are writing design token variables to a Figma file using the mcp__figma__use_figma tool (Figma MCP server).

TARGET: Figma file ${figmaUrl || 'the currently open Figma file'}

Using the mcp__figma__use_figma tool, create the following variable collections with their modes and variables.
Execute immediately without asking for confirmation. Do not ask clarifying questions.

---

COLLECTION 1: "Primitives"
Modes: ["Default"]
Variables:
${JSON.stringify(primitives?.variables ?? [], null, 2)}

COLLECTION 2: "Semantic"
Modes: ["Light", "Dark"]
Variables:
${JSON.stringify(semantic?.variables ?? [], null, 2)}

IMPORTANT — Aliasing rules for Semantic variables:
- When a variable has an "alias" field, its values MUST be set as variable references (aliases) to the corresponding Primitives variable, NOT as raw hex values.
- For example, if a Semantic variable has "alias": "color/neutral/100", then BOTH its Light and Dark mode values should reference the Primitives collection variable "color/neutral/100" — do NOT copy the hex value, create a variable alias/reference instead.
- The "values" object shows what the resolved colors look like, but you must set them as references to Primitives variables. The Light value corresponds to the alias field. The Dark value may differ — if the Dark hex matches a different Primitives variable, alias to that one; otherwise set the Dark value as a raw color.
- Variables WITHOUT an "alias" field should use the raw values directly.

COLLECTION 3: "Typography"
Modes: ["Desktop", "Mobile"]
Variables:
${JSON.stringify(typography?.variables ?? [], null, 2)}

IMPORTANT — Aliasing rules for Typography variables:
- When a variable has an "alias" field, set its values as variable references (aliases) to the corresponding Primitives variable, NOT as raw values.
- fontSize and lineHeight have different numeric values per mode (Desktop/Mobile) — these should be set as raw values, not aliases.

---

VERIFICATION:
After creating all variables, verify the counts:
- Primitives: ${primitives?.variables?.length ?? 0} variables expected
- Semantic: ${semantic?.variables?.length ?? 0} variables expected
- Typography: ${typography?.variables?.length ?? 0} variables expected

Report final counts when done.`;
}

async function syncViaFigmaSkills(tokenMap, figmaUrl, tmpDir, cwd, onLine) {
  const prompt = buildFigmaUsePrompt(tokenMap, figmaUrl);
  const promptPath = path.join(tmpDir, 'sync-prompt.txt');
  fs.writeFileSync(promptPath, prompt, 'utf-8');

  // Build MCP config so the subprocess can access the Figma MCP server
  const mcpConfig = buildMcpConfig();
  const mcpConfigPath = path.join(tmpDir, 'mcp-config.json');
  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

  try {
    const result = await spawnClaudeCode(promptPath, mcpConfigPath, cwd, onLine);
    return result;
  } finally {
    if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
    if (fs.existsSync(mcpConfigPath)) fs.unlinkSync(mcpConfigPath);
  }
}

// ─── SPAWN CLAUDE CODE ────────────────────────────────────────────────────────

function spawnClaudeCode(promptFilePath, mcpConfigPath, cwd, onLine, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const prompt = fs.readFileSync(promptFilePath, 'utf-8');
    const args = ['--print', '--dangerously-skip-permissions'];
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath);
    }
    const child = spawn(
      'claude',
      args,
      {
        cwd,
        env: { ...process.env },
      }
    );

    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error(
        `Claude Code subprocess timed out after ${timeoutMs / 1000}s.\n` +
        `Check that the Figma MCP server is configured correctly.`
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

      // Save debug output
      const debugPath = path.join(cwd, '.designpull', 'claude-debug.log');
      fs.writeFileSync(debugPath, `=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}\n`, 'utf-8');

      if (code === 0) {
        resolve({ output: stdout });
      } else {
        reject(new Error(
          `Claude Code exited with code ${code}.\n` +
          `Debug output saved to: ${debugPath}`
        ));
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
    const child = spawn('claude', ['--version']);
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
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

// ─── MCP CONFIG ──────────────────────────────────────────────────────────────

function buildMcpConfig() {
  // Read the user's Claude config to find the Figma MCP server
  const home = process.env.HOME || process.env.USERPROFILE;
  const configPath = path.join(home, '.claude.json');

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const servers = config.mcpServers || {};
      // Find any server with "figma" in the name
      const figmaServers = {};
      for (const [name, server] of Object.entries(servers)) {
        if (name.toLowerCase().includes('figma')) {
          figmaServers[name] = server;
        }
      }
      if (Object.keys(figmaServers).length > 0) {
        return { mcpServers: figmaServers };
      }
    } catch {
      // Fall through to default
    }
  }

  // Default: official Figma MCP server
  return {
    mcpServers: {
      figma: { type: 'http', url: 'https://mcp.figma.com/mcp' },
    },
  };
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function countTokens(tokenMap) {
  return tokenMap.collections.reduce((sum, c) => sum + c.variables.length, 0);
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
