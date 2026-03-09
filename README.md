# DesignPull CLI

[![npm version](https://img.shields.io/npm/v/designpull.svg)](https://www.npmjs.com/package/designpull)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![CI](https://github.com/kuriouscreator/designpull/workflows/CI/badge.svg)](https://github.com/kuriouscreator/designpull/actions)

**Code in. Design out. Ship faster.**

DesignPull is a command-line tool that scaffolds design token files and writes them to Figma as live variables via Claude Code + Figma Console MCP. Define your design system in markdown, sync to Figma, and generate production-ready components — all from your terminal.

---

## What it does

1. **Scaffolds a complete design token system** in a single markdown file (`design-token.md`)
2. **Writes tokens to Figma as variables** (primitives, semantic tokens, typography) via MCP — no REST API, no manual copy-paste
3. **Generates Figma components** (Button, Input, Card, etc.) that reference your tokens — zero hardcoded values

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **Figma Console MCP** — configured via Claude Code (see [MCP Setup](#mcp-setup) below)
- **Figma Desktop** — variables API only works in Desktop, not browser
- **Anthropic API key** — for token parsing ([console.anthropic.com](https://console.anthropic.com))
- **Figma Personal Access Token** — with file content (read) + variables (read/write) scopes

---

## Installation

```bash
npm install -g designpull
```

Or run locally:

```bash
git clone https://github.com/kuriouscreator/designpull
cd designpull
npm install
npm start
```

---

## Quick Start

### 1. Initialize your design token file

```bash
designpull init
```

This generates:
- `design-token.md` — your single source of truth for design tokens
- `.env` — Figma credentials and Anthropic API key
- `.gitignore` — ensures `.env` is not committed

Follow the interactive prompts to set up:
- Project details (name, description, component library, styling approach)
- Brand colors (primary, accent, secondary, dark, neutrals)
- Typography (fonts)
- Dark mode surface colors
- Figma file URL and Personal Access Token

### 2. Sync tokens to Figma

```bash
designpull sync
```

This:
- Parses `design-token.md` using Claude (Sonnet 4)
- Creates 3 variable collections in Figma:
  - **Primitives** — raw values (colors, spacing, radii, etc.)
  - **Semantic** — intent-based aliases to primitives (Light/Dark modes)
  - **Typography** — type scale (Desktop/Mobile modes)
- Writes all variables to your Figma file via the Figma Console MCP

**Requirements:**
- Desktop Bridge plugin running in your Figma file (`Plugins → Development → Figma Desktop Bridge`)
- Valid `ANTHROPIC_API_KEY` and `FIGMA_ACCESS_TOKEN` in `.env`

**Options:**
- `--dry-run` — parse tokens and preview without writing to Figma

### 3. Generate components (optional)

```bash
designpull generate
```

This creates Figma components on a "Components" page:
- **Button** — variants (primary, secondary, ghost, danger), sizes (sm, md, lg), states (default, hover, focus, disabled, loading)
- **Input** — variants (default, error, disabled), sizes (sm, md, lg), states
- **Card** — variants (default, elevated, outlined)
- **Badge** — variants (default, success, warning, error, info), sizes (sm, md)
- **Text** — all type scale styles

All components reference variables from your token system — no hardcoded values.

---

## MCP Setup

DesignPull uses **Claude Code** to orchestrate writes to Figma via the **Figma Console MCP**. You need to configure both:

### Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### Add Figma Console MCP

```bash
claude mcp add figma-console -s user \
  -e FIGMA_ACCESS_TOKEN=figd_your_token_here \
  -e ENABLE_MCP_APPS=true \
  -- npx -y figma-console-mcp@latest
```

Replace `figd_your_token_here` with your actual Figma Personal Access Token.

### Verify MCP is configured

```bash
claude mcp list
```

You should see `figma-console` in the list.

### (Optional) Add Chakra UI MCP

For better component generation hints:

```bash
claude mcp add chakra-ui -s user -- npx -y @chakra-ui/mcp@latest
```

---

## Commands Reference

| Command | Description | Options |
|---------|-------------|---------|
| `designpull init` | Set up `design-token.md` and Figma connection | `-o, --output <dir>` |
| `designpull sync` | Parse tokens and write to Figma variables | `-o, --output <dir>`, `--dry-run` |
| `designpull generate` | Generate components in Figma from tokens | `-o, --output <dir>` |
| `designpull doctor` | Check environment health (Node, Claude, MCP, credentials) | `-o, --output <dir>` |

---

## design-token.md

This is your single source of truth. Edit it to change your design system, then run `designpull sync` to push updates to Figma.

### Structure

- **Project** — metadata (name, description, library, styling)
- **Primitive Tokens** — raw values only (colors, spacing, radii, fonts, etc.)
- **Semantic Tokens** — intent-based aliases to primitives (Light/Dark modes)
- **Typography Scale** — font sizes, line heights, weights (Desktop/Mobile modes)
- **Component Token Map** — which tokens each component uses

### Token Architecture

**Two-tier system:**
1. **Primitives** — raw values, no intent encoded
2. **Semantic** — intent only, aliases to primitives, no raw values

**Flow:** Primitive → Semantic → Component

Components **never** reference primitives directly — they only use semantic tokens.

### Rules

1. Semantic tokens never contain raw values — aliases only
2. Components never reference primitive tokens directly
3. Light and dark semantic sets must have identical token paths
4. Desktop and mobile type scales must have identical token paths
5. `body/md` fontSize must be 16px in both breakpoints (accessibility)
6. No hardcoded values survive into generated component code

---

## How the sync works

DesignPull **does not use Figma's REST API**. Here's why:

1. **REST API doesn't support variable creation** — you can read variables, but not write them
2. **Figma Plugins can write variables** — but only via the plugin environment (not REST)
3. **Solution: MCP + Claude Code** — we spawn Claude Code as a subprocess, which has the Figma Console MCP active, which runs a plugin in Figma Desktop that can write variables

### The flow

```
design-token.md
  ↓ (Claude API parses)
token-map.json
  ↓ (DesignPull CLI spawns)
Claude Code subprocess
  ↓ (Figma Console MCP calls)
Desktop Bridge plugin in Figma
  ↓ (Plugin API writes)
Figma variables
```

This is the **only** way to programmatically write Figma variables from a local CLI tool. The Desktop Bridge plugin must be running in your Figma file for this to work.

---

## Troubleshooting

### Desktop Bridge plugin not running

**Error:** `Claude Code subprocess timed out` or `MCP connection failed`

**Fix:**
1. Open your Figma file in **Figma Desktop** (not browser)
2. Right-click anywhere on canvas
3. `Plugins → Development → Figma Desktop Bridge`
4. Leave the plugin open while running `designpull sync` or `designpull generate`

---

### MCP not found

**Error:** `Figma Console MCP not found in your Claude Code config`

**Fix:**

```bash
claude mcp add figma-console -s user \
  -e FIGMA_ACCESS_TOKEN=figd_your_token_here \
  -e ENABLE_MCP_APPS=true \
  -- npx -y figma-console-mcp@latest
```

Verify:

```bash
claude mcp list
```

---

### PAT errors

**Error:** `Missing required values in .env: FIGMA_ACCESS_TOKEN`

**Fix:**
1. Go to [figma.com](https://figma.com) → Account Settings → Security → Personal Access Tokens
2. Create a new token with these scopes:
   - **File content (read)**
   - **Variables (read/write)** *(if available — Enterprise plan only)*
3. Copy the token (starts with `figd_`)
4. Open `.env` and set `FIGMA_ACCESS_TOKEN=figd_your_token_here`

**Note:** Variables API requires Figma Enterprise plan. If you don't have it, DesignPull will fall back to console-based extraction (you'll get a snippet to run in Figma's plugin console).

---

### Parse validation failed

**Error:** `Token map missing required collection: Primitives`

**Fix:**
- Check `design-token.md` for syntax errors
- Ensure all three sections exist: Primitives, Semantic, Typography
- Review `.designpull/failed-parse.json` to see what Claude extracted
- If Claude output is malformed, file a bug at [github.com/kuriouscreator/designpull/issues](https://github.com/kuriouscreator/designpull/issues)

---

### Claude Code not installed

**Error:** `claude CLI not found`

**Fix:**

```bash
npm install -g @anthropic-ai/claude-code
```

Verify:

```bash
claude --version
```

---

## Development

```bash
git clone https://github.com/kuriouscreator/designpull
cd designpull
npm install
node src/index.js --help
```

Test a command:

```bash
node src/index.js init
```

---

## Folder Structure

```
designpull/
├── src/
│   ├── index.js        # Commander entry point
│   ├── init.js         # designpull init
│   ├── sync.js         # designpull sync
│   ├── generate.js     # designpull generate
│   └── doctor.js       # designpull doctor
├── package.json
├── .env.example
└── README.md
```

---

## Environment Variables

See `.env.example` for the full list. Required:

- `FIGMA_FILE_URL` — your Figma file URL
- `FIGMA_ACCESS_TOKEN` — Figma Personal Access Token (starts with `figd_`)
- `ANTHROPIC_API_KEY` — Anthropic API key for token parsing

---

## Questions?

- **Docs:** [designpull.dev/docs](https://designpull.dev/docs)
- **Issues:** [github.com/kuriouscreator/designpull/issues](https://github.com/kuriouscreator/designpull/issues)
- **Twitter:** [@designpull](https://twitter.com/designpull)

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup instructions
- Code style guidelines
- Testing requirements
- Pull request process

---

## License

MIT - see [LICENSE](LICENSE) for details
