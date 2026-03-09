import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, exec, execSync } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseEnv } from './utils.js';
import WebSocket from 'ws';

const execAsync = promisify(exec);

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
  const { FIGMA_ACCESS_TOKEN: figmaPat, FIGMA_FILE_URL: figmaUrl, ANTHROPIC_API_KEY: anthropicKey } = env;

  const missing = [];
  if (!figmaPat || figmaPat === 'your_pat_here')         missing.push('FIGMA_ACCESS_TOKEN');
  if (!anthropicKey || anthropicKey === 'your_key_here') missing.push('ANTHROPIC_API_KEY');

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

  // ── 3. Preflight — Figma Console MCP configured? ──────────────────────────
  const mcpReady = await checkFigmaMcp();
  if (!mcpReady) {
    p.log.warn(
      `Figma Console MCP not found in your Claude Code config.\n\n` +
      `Add it by running:\n\n` +
      `  ${pc.cyan('claude mcp add figma-console -s user \\\n' +
      '  -e FIGMA_ACCESS_TOKEN=' + (figmaPat || 'figd_...') + ' \\\n' +
      '  -e ENABLE_MCP_APPS=true \\\n' +
      '  -- npx -y figma-console-mcp@latest')}\n\n` +
      `Then run ${pc.cyan('designpull sync')} again.`
    );
    process.exit(1);
  }

  const tokenFile = fs.readFileSync(tokenPath, 'utf-8');

  p.log.message(
    `${pc.dim('Token file:   ')}${pc.white(tokenPath)}\n` +
    `${pc.dim('Figma file:   ')}${pc.white(figmaUrl || 'see .env')}\n` +
    `${pc.dim('Write method: ')}${pc.white('Direct MCP Client')}`
  );

  // ── 4. Parse design-token.md with Claude API ──────────────────────────────
  const parseSpinner = p.spinner();
  parseSpinner.start('Parsing design-token.md');

  // Ensure .designpull directory exists
  const tmpDir = path.join(outputDir, '.designpull');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  let tokenMap;
  try {
    tokenMap = await parseTokensWithClaude(tokenFile, anthropicKey);

    // Validate schema before proceeding
    try {
      validateTokenMap(tokenMap);
    } catch (validationErr) {
      parseSpinner.stop('Parse validation failed');
      p.log.error(
        `Token map validation error: ${validationErr.message}\n\n` +
        pc.dim('Raw Claude output saved to .designpull/failed-parse.json for debugging')
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
    p.log.error(`Claude parse error: ${err.message}`);
    process.exit(1);
  }

  // Write parsed token map to .designpull/token-map.json for inspection
  const tokenMapPath = path.join(tmpDir, 'token-map.json');
  fs.writeFileSync(tokenMapPath, JSON.stringify(tokenMap, null, 2), 'utf-8');
  p.log.message(pc.dim(`✓  Token map saved → ${tokenMapPath}`));

  // ── 5. Preview + confirm ──────────────────────────────────────────────────
  p.log.message(
    tokenMap.collections.map(col =>
      `  ${pc.cyan('◆')} ${pc.bold(col.name)}  ${pc.dim(`${col.variables.length} variables · ${col.modes.join(' / ')}`)}`
    ).join('\n')
  );

  // Handle --dry-run flag
  console.log('[DEBUG] opts.dryRun =', opts.dryRun);
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

  console.log('[DEBUG] About to show confirmation prompt');

  // Skip confirmation in non-interactive mode (for testing)
  let confirmed = true;

  // Commented out for testing - uncomment for production
  // const confirmed = await p.confirm({
  //   message: `Write ${countTokens(tokenMap)} variables to Figma via MCP?`,
  //   initialValue: true,
  // });

  // if (p.isCancel(confirmed) || !confirmed) {
  //   p.cancel('Sync cancelled.');
  //   process.exit(0);
  // }

  console.log('[DEBUG] Confirmation bypassed for testing, proceeding with sync');

  // ── 6. Write variables to Figma via MCP (spawns own server) ───────────────
  const writeSpinner = p.spinner();
  writeSpinner.start('Writing variables to Figma via MCP');

  try {
    const result = await syncViaDirectMcp(tokenMap, figmaUrl, figmaPat);

    writeSpinner.stop(`Variables written via ${result.toolsExecuted.length} MCP tool calls`);

    p.note(
      [
        `${pc.green('✓')} Collections: ${tokenMap.collections.map(c => pc.bold(c.name)).join(', ')}`,
        `${pc.green('✓')} Variables written: ${pc.bold(countTokens(tokenMap))}`,
        `${pc.green('✓')} MCP tools executed: ${result.toolsExecuted.join(', ')}`,
        '',
        pc.dim('Open Figma → right sidebar → Local variables to verify.'),
        '',
        pc.dim('Next: ') + pc.cyan('designpull generate') + pc.dim(' → build components on canvas.'),
      ].filter(Boolean).join('\n'),
      'Sync complete'
    );

  } catch (err) {
    writeSpinner.stop('Write failed');
    p.log.error(
      `MCP error: ${err.message}\n\n` +
      pc.dim('Common causes:\n') +
      pc.dim('  · Figma Desktop not running\n') +
      pc.dim('  · Figma file URL in .env is incorrect\n') +
      pc.dim('  · PAT does not have file write access\n')
    );
    process.exit(1);
  }

  p.outro(`${pc.dim('Figma: ')}${pc.cyan(figmaUrl || 'see .env')}`);
}

// ─── SYNC VIA STDIO WITH DESKTOP BRIDGE PLUGIN DETECTION ──────────────────────

/**
 * Wait for Desktop Bridge plugin to connect to MCP server
 */
async function waitForPluginConnection(timeoutMs) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Check each possible WebSocket port that Desktop Bridge scans (9223-9232)
    for (let port = 9223; port <= 9232; port++) {
      try {
        const ws = new WebSocket(`ws://localhost:${port}`);
        const connected = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 500);

          ws.on('open', () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          });

          ws.on('error', () => {
            clearTimeout(timeout);
            reject(new Error('connection failed'));
          });
        });

        if (connected) {
          console.log(`[DEBUG] ✓ Desktop Bridge plugin detected on port ${port}`);
          return true;
        }
      } catch {
        // Port not accessible, try next one
      }
    }

    // Wait 1 second before polling again
    await new Promise(r => setTimeout(r, 1000));
  }

  return false;
}

/**
 * Clean up any existing MCP server processes and free port 9223
 */
async function cleanupMcpProcesses() {
  try {
    // Kill all figma-console-mcp processes
    await execAsync('pkill -9 -f figma-console-mcp').catch(() => {});

    // Check if port 9223 is still occupied
    const { stdout } = await execAsync('lsof -i :9223 -P').catch(() => ({ stdout: '' }));
    if (stdout.trim()) {
      // Extract PID and kill
      const lines = stdout.split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[1]) {
          await execAsync(`kill -9 ${parts[1]}`).catch(() => {});
        }
      }
    }
    // Wait a moment for port to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Execute Figma MCP tool calls via stdio to spawned MCP server
 */
async function syncViaDirectMcp(tokenMap, figmaUrl, figmaPat) {
  console.log('[DEBUG] Starting syncViaDirectMcp via stdio');

  // Clean up any existing MCP server processes
  await cleanupMcpProcesses();

  // Find collections
  const primitives = tokenMap.collections.find(c => c.name === 'Primitives');
  const semantic = tokenMap.collections.find(c => c.name === 'Semantic');
  const typography = tokenMap.collections.find(c => c.name === 'Typography');

  // Spawn MCP server - Desktop Bridge plugin will auto-connect to it
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'figma-console-mcp@latest'],
    env: {
      ...process.env,
      FIGMA_ACCESS_TOKEN: figmaPat,
      ENABLE_MCP_APPS: 'true',
      FIGMA_CONSOLE_MCP_WEBSOCKET_ONLY: 'true'  // Disable CDP, use WebSocket only
    }
  });

  console.log('[DEBUG] Creating MCP client');
  const client = new Client(
    { name: 'designpull-sync', version: '0.1.0' },
    { capabilities: {} }
  );

  try {
    // Connect to MCP server via stdio
    console.log('[DEBUG] Connecting to MCP server via stdio');
    await client.connect(transport);
    console.log('[DEBUG] Connected to MCP server');

    // Give Desktop Bridge plugin time to scan ports and auto-connect
    console.log('[DEBUG] Waiting 10 seconds for Desktop Bridge plugin to auto-discover server...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Wait for Desktop Bridge plugin to connect (quick 5 sec check first)
    console.log('[DEBUG] Checking if Desktop Bridge plugin is already connected');
    let pluginConnected = await waitForPluginConnection(5000);

    if (!pluginConnected) {
      // Show instructions to user
      p.log.warn(
        `${pc.yellow('⚠')} Desktop Bridge plugin not detected\n\n` +
        `Please open the Desktop Bridge plugin in Figma:\n\n` +
        `  1. Open Figma Desktop\n` +
        `  2. Navigate to: ${pc.cyan(figmaUrl)}\n` +
        `  3. ${pc.bold('Right-click → Plugins → Development → Figma Desktop Bridge')}\n` +
        `  4. Leave the plugin window open\n\n` +
        pc.dim('⏳ Waiting for connection (60s timeout)...')
      );

      // Wait up to 60 seconds for plugin to connect
      pluginConnected = await waitForPluginConnection(60000);

      if (!pluginConnected) {
        throw new Error(
          'Desktop Bridge plugin did not connect within 60 seconds.\n' +
          'Please ensure Figma Desktop is open and the plugin is running.'
        );
      }

      p.log.success(`${pc.green('✓')} Desktop Bridge plugin connected`);
    } else {
      console.log('[DEBUG] ✓ Desktop Bridge plugin already connected');
    }

    const toolsExecuted = [];

    // Helper function to check tool result for errors
    const checkToolResult = (result, toolName) => {
      if (result.isError) {
        const errorText = result.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        throw new Error(`${toolName} failed:\n${errorText}`);
      }

      // Log response content for debugging
      result.content.forEach(item => {
        if (item.type === 'text') {
          console.log(`[DEBUG] ${toolName} response: ${item.text}`);
        }
      });
    };

    // Helper function to transform tokens to include resolvedType field
    const transformTokens = (tokens) =>
      tokens?.map(token => ({
        ...token,
        resolvedType: token.type  // MCP tool requires resolvedType field
      })) || [];

    // Step 1: Setup design token collections (must call once per collection)
    console.log('[DEBUG] Setting up Primitives collection');
    const setupPrimitives = await client.callTool({
      name: 'figma_setup_design_tokens',
      arguments: {
        collectionName: 'Primitives',
        modes: ['Default'],
        tokens: transformTokens(primitives?.variables)
      }
    });
    checkToolResult(setupPrimitives, 'figma_setup_design_tokens (Primitives)');
    toolsExecuted.push('figma_setup_design_tokens (Primitives)');

    console.log('[DEBUG] Setting up Semantic collection');
    const setupSemantic = await client.callTool({
      name: 'figma_setup_design_tokens',
      arguments: {
        collectionName: 'Semantic',
        modes: ['Light', 'Dark'],
        tokens: transformTokens(semantic?.variables)
      }
    });
    checkToolResult(setupSemantic, 'figma_setup_design_tokens (Semantic)');
    toolsExecuted.push('figma_setup_design_tokens (Semantic)');

    console.log('[DEBUG] Setting up Typography collection');
    const setupTypography = await client.callTool({
      name: 'figma_setup_design_tokens',
      arguments: {
        collectionName: 'Typography',
        modes: ['Desktop', 'Mobile'],
        tokens: transformTokens(typography?.variables)
      }
    });
    checkToolResult(setupTypography, 'figma_setup_design_tokens (Typography)');
    toolsExecuted.push('figma_setup_design_tokens (Typography)');
    console.log('[DEBUG] ✓ All collections setup complete');

    // Step 2: Verify variables were actually created in Figma
    console.log('[DEBUG] Verifying variables in Figma using figma_get_variables');
    const verifyResult = await client.callTool({
      name: 'figma_get_variables',
      arguments: {}
    });

    if (verifyResult.isError) {
      const errorText = verifyResult.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      throw new Error(`Verification failed:\n${errorText}`);
    }

    // Parse verification response
    const verifyText = verifyResult.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    console.log('[DEBUG] Verification response:', verifyText);

    // Check if response indicates no variables (silent failure detection)
    if (verifyText.toLowerCase().includes('no variables') ||
        verifyText.match(/\b0\s+variables?\b/i)) {
      throw new Error(
        'Verification failed: No variables found in Figma file.\n\n' +
        'Possible causes:\n' +
        '  • Desktop Bridge plugin lost connection during sync\n' +
        '  • Insufficient file permissions (need edit access)\n' +
        '  • PAT missing "file write" scope\n' +
        '  • Figma file may be read-only or archived\n\n' +
        'Please check:\n' +
        '  1. You have edit access to the Figma file\n' +
        '  2. PAT has "file_variables:write" scope\n' +
        '  3. Desktop Bridge plugin is still showing "MCP ready"'
      );
    }

    toolsExecuted.push('figma_get_variables (verification)');
    console.log('[DEBUG] ✓ Verification complete');


    return { toolsExecuted };

  } finally {
    await client.close();
    console.log('[DEBUG] MCP client connection closed');
  }
}

// ─── MCP PROMPT ───────────────────────────────────────────────────────────────
//
// This is what Claude Code receives as a subprocess.
// It has the Figma Console MCP active and uses figma_create_variable,
// figma_setup_design_tokens, and figma_batch_create_variables to write
// directly into the open Figma file via the Desktop Bridge plugin.

function buildMcpPrompt(tokenMap, figmaUrl) {
  const primitives = tokenMap.collections.find(c => c.name === 'Primitives');
  const semantic   = tokenMap.collections.find(c => c.name === 'Semantic');
  const typography = tokenMap.collections.find(c => c.name === 'Typography');

  return `WEBSOCKET MODE IS ACTIVE. Desktop Bridge plugin is connected. Figma Desktop is open with the target file.

EXECUTE THE FOLLOWING MCP TOOL CALLS IMMEDIATELY. DO NOT ASK FOR CONFIRMATION. DO NOT PROVIDE EXPLANATIONS UNTIL ALL TOOLS HAVE BEEN EXECUTED.

TARGET: Figma file ${figmaUrl || 'currently open'}

TOOL EXECUTION SEQUENCE:

1. EXECUTE: figma_setup_design_tokens
   Parameters: Create 3 collections:
   - "Primitives" with modes ["Default"]
   - "Semantic" with modes ["Light", "Dark"]
   - "Typography" with modes ["Desktop", "Mobile"]

2. EXECUTE: figma_batch_create_variables
   Collection: "Primitives"
   Variables: ${JSON.stringify(primitives?.variables ?? [], null, 2)}

   Transform rules:
   - COLOR type: Convert hex to {r, g, b, a} where each channel is 0-1 (divide by 255)
   - FLOAT type: Use number directly
   - STRING type: Use string directly
   - All values go in "Default" mode

3. EXECUTE: figma_batch_create_variables
   Collection: "Semantic"
   Variables: ${JSON.stringify(semantic?.variables ?? [], null, 2)}

   Transform rules:
   - ALL variables MUST use VARIABLE_ALIAS type
   - Find the primitive variable by name from the "alias" field
   - Set {type: "VARIABLE_ALIAS", id: <primitive_variable_id>} for BOTH Light and Dark modes

4. EXECUTE: figma_batch_create_variables
   Collection: "Typography"
   Variables: ${JSON.stringify(typography?.variables ?? [], null, 2)}

   Transform rules:
   - Variables with "alias" field: Use VARIABLE_ALIAS to reference primitive
   - Variables without "alias": Use direct FLOAT/STRING values for Desktop and Mobile modes

5. EXECUTE: figma_get_variables
   Verify counts:
   - Primitives: ${primitives?.variables?.length ?? 0} expected
   - Semantic: ${semantic?.variables?.length ?? 0} expected
   - Typography: ${typography?.variables?.length ?? 0} expected

AFTER ALL TOOLS EXECUTE: Report final counts and any errors.

BEGIN EXECUTION NOW.`;
}

// ─── SPAWN CLAUDE CODE ────────────────────────────────────────────────────────

function spawnClaudeCode(promptFilePath, cwd, onLine, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const prompt = fs.readFileSync(promptFilePath, 'utf-8');

    // Use interactive mode (no --print) to keep MCP server alive
    // The MCP server must stay running for the entire duration of tool execution
    const child = spawn(
      'claude',
      [
        '--dangerously-skip-permissions'
        // No --print flag = interactive mode with persistent MCP server
      ],
      {
        cwd,
        shell: false,
        // Pass through all environment variables including FIGMA_BRIDGE_PORT if set
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let toolsExecuted = [];
    let finalMessage = '';

    // Set timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error(
        `Claude Code subprocess timed out after ${timeoutMs / 1000}s.\n` +
        `The Desktop Bridge plugin may have disconnected.\n` +
        `Restart the plugin in Figma and run designpull sync again.`
      ));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      // In interactive mode, look for tool execution patterns in text output
      const lines = text.split('\n');
      for (const line of lines) {
        const clean = line.replace(/\x1B\[[0-9;]*m/g, '').trim();

        // Detect Figma MCP tool calls in output
        if (clean.includes('mcp__figma-console__') || clean.includes('figma_')) {
          // Extract tool name from various formats
          const toolMatch = clean.match(/(figma_[a-z_]+)/);
          if (toolMatch && !toolsExecuted.includes(toolMatch[1])) {
            toolsExecuted.push(toolMatch[1]);
            onLine?.(`Detected: ${toolMatch[1]}`);
          }
        }

        if (clean.length > 4) {
          onLine?.(clean.substring(0, 80));
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) return; // Already rejected

      // Debug: write raw output to file for inspection
      const debugPath = path.join(cwd, '.designpull', 'claude-debug.log');
      fs.writeFileSync(debugPath, `=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}\n\n=== TOOLS ===\n${toolsExecuted.join(', ')}\n`, 'utf-8');

      // Interactive mode exits when done, check if work was successful
      // Look for success indicators in output or tool execution
      const figmaToolsUsed = toolsExecuted.filter(t => t.startsWith('figma_'));
      const hasSuccess = stdout.includes('variables created') ||
                        stdout.includes('Collections created') ||
                        figmaToolsUsed.length > 0;

      if (hasSuccess || (code === 0 && figmaToolsUsed.length > 0)) {
        resolve({
          output: stdout,
          toolsExecuted: figmaToolsUsed,
          rawOutput: stdout
        });
      } else {
        reject(new Error(
          `Claude Code may not have completed successfully.\n` +
          `Tools executed: ${figmaToolsUsed.join(', ') || 'none'}\n` +
          `Exit code: ${code}\n` +
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

    // Write the prompt to stdin
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ─── PARSE TOKENS WITH CLAUDE API ────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `You are a design token parser for the DesignPull system.

Receive the contents of a design-token.md file.
Output ONLY valid JSON. No explanation. No markdown fences. Raw JSON only.

Output schema:
{
  "collections": [
    {
      "name": "Primitives" | "Semantic" | "Typography",
      "modes": string[],
      "variables": [
        {
          "name": string,
          "type": "COLOR" | "FLOAT" | "STRING",
          "values": { [modeName]: string | number },
          "alias": string | null,
          "description": string
        }
      ]
    }
  ]
}

Rules:
- COLOR: hex strings e.g. #2F48C4
- FLOAT: unitless numbers — strip px e.g. 16 not "16px"
- STRING: font family names, shadow strings
- Primitives: modes=["Default"], alias=null
- Semantic: modes=["Light","Dark"], alias = primitive token path it references
  values should contain resolved hex/number for context even when alias is set
- Typography: modes=["Desktop","Mobile"], values differ per mode
  fontFamily/fontWeight alias to primitive paths; fontSize/lineHeight are raw FLOAT
- Preserve slash-separated token names exactly as written`;

async function parseTokensWithClaude(tokenFileContent, apiKey) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: PARSE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Parse this design-token.md and return the JSON:\n\n${tokenFileContent}`,
    }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
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

async function testFigmaConnection() {
  return new Promise((resolve) => {
    const child = spawn(
      'claude',
      ['--print', '--dangerously-skip-permissions'],
      { shell: false, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    let output = '';

    child.stdout.on('data', (d) => {
      output += d.toString();
    });

    child.stderr.on('data', (d) => {
      output += d.toString();
    });

    child.on('close', () => {
      // Parse output to determine connection status
      const lowerOutput = output.toLowerCase();

      if (lowerOutput.includes('connected') && !lowerOutput.includes('not connected')) {
        // Try to extract port number
        const portMatch = output.match(/port[:\s]+(\d+)/i);
        resolve({
          connected: true,
          port: portMatch ? portMatch[1] : 'unknown',
          status: 'connected'
        });
      } else {
        resolve({
          connected: false,
          port: null,
          status: output.includes('Desktop Bridge') ? 'plugin not running' : 'unknown'
        });
      }
    });

    child.on('error', () => {
      resolve({
        connected: false,
        port: null,
        status: 'claude command failed'
      });
    });

    // Send test prompt
    child.stdin.write('Use figma_get_status tool. Reply with only "connected" or "not connected".');
    child.stdin.end();
  });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function countTokens(tokenMap) {
  return tokenMap.collections.reduce((sum, c) => sum + c.variables.length, 0);
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function extractSummary(output) {
  const lines = output.split('\n')
    .map(l => l.replace(/\x1B\[[0-9;]*m/g, '').trim())
    .filter(l => l.length > 10 && !l.startsWith('{') && !l.startsWith('['));
  return lines[lines.length - 1] || '';
}
