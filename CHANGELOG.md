# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-03-27

### Fixed
- **`designpull sync` now actually writes to Figma** — prompt is passed via stdin instead of CLI arg (fixes truncation), and MCP config is explicitly passed to the Claude subprocess
- **Output validation** — sync now detects when Claude fails to use Figma tools and reports an error instead of false success
- **Semantic token dark mode** — `color/border/default` and `color/icon/subtle` now use `color/neutral/100` in dark mode (was `color/neutral/500`, invisible on dark backgrounds)
- **Feedback tokens** — `color/feedback/success`, `warning`, and `error` now have explicit light/dark splits for consistency
- **Removed `shell: true`** from all `spawn()` calls (fixes Node.js DEP0190 deprecation warning)
- **Updated prompt** to reference `mcp__figma__use_figma` tool name and explicit aliasing instructions for variable references

### Changed
- MCP setup error messages now show the actual `claude mcp add` command instead of just a link
- `designpull doctor` fix message updated with setup command

## [0.2.1] - 2026-03-27

### Fixed
- Version bump for npm publishing (0.2.0 was already published)

## [0.2.0] - 2026-03-26

### Changed

#### Migrated to Figma MCP Skills
- **Replaced figma-console-mcp + Desktop Bridge** with Figma's official MCP skills (`figma-use`). Variables are now written directly to Figma files — no Desktop Bridge plugin needed.
- **Replaced Claude API token parsing** with a local deterministic parser (`src/parser.js`). Zero-dependency, instant, fully testable. Handles all 4 markdown patterns from `design-token.md`.
- **`designpull sync`** now uses the local parser for `design-token.md` → `token-map.json`, then spawns Claude Code with the `figma-use` skill to write variables to Figma.
- **`designpull doctor`** checks for Figma MCP server instead of Figma Console MCP. Removed `ANTHROPIC_API_KEY` check.
- **`designpull init`** no longer asks for Anthropic API key. Removed Desktop Bridge plugin orchestration.

### Added
- `src/parser.js` — Local deterministic parser for `design-token.md` with 4 pattern handlers (primitives, semantic light/dark, shared aliases, typography scale)
- `test/parser.test.js` — 30 tests covering all parsing patterns, edge cases, and schema validation

### Removed
- **3 dependencies removed:** `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `ws`
- **`scripts/` directory removed:** `mcp-wrapper.js`, `mcp-server.sh`, `mcp-server.bat` (managed figma-console-mcp lifecycle)
- **4 npm scripts removed:** `mcp:start`, `mcp:stop`, `mcp:restart`, `mcp:status`
- `designpull generate` command (will be reintroduced in a future release)
- `ANTHROPIC_API_KEY` no longer required in `.env`
- Desktop Bridge plugin detection, WebSocket port scanning, zombie process cleanup

### Technical Details
- Runtime dependencies reduced from 6 to 3: `@clack/prompts`, `commander`, `picocolors`
- Net code reduction: ~2,100 lines removed
- 106 tests across 5 test files (all passing)

## [0.1.0] - 2026-03-08

### Added

#### Core Commands
- `designpull init` - Interactive setup wizard for design token scaffolding
  - Collects project metadata (name, description, component library, styling approach)
  - Prompts for brand colors (primary, accent, secondary, dark, neutrals)
  - Configures typography (fonts)
  - Sets up dark mode surfaces
  - Generates `design-token.md`, `.env`, and `.gitignore`
  - Optional first sync to Figma

- `designpull sync` - Parse design tokens and write to Figma variables
  - Parses `design-token.md` using Claude API (Sonnet 4)
  - Creates 3 variable collections in Figma: Primitives, Semantic, Typography
  - Writes variables via Figma Console MCP (direct stdio connection)
  - Supports `--dry-run` flag for preview without writing
  - Validates token map schema and minimum variable count

- `designpull doctor` - Environment health check
  - Validates Node.js version (>= 20)
  - Checks Claude Code installation
  - Verifies Figma Console MCP configuration
  - Confirms environment variables (`ANTHROPIC_API_KEY`, `FIGMA_ACCESS_TOKEN`)
  - Checks for `design-token.md` and `token-map.json`

#### Cross-Platform Support
- Windows batch script for MCP server management (`scripts/mcp-server.bat`)
- Cross-platform Node.js wrapper (`scripts/mcp-wrapper.js`) for process management
- Automatic OS detection and script delegation

#### Testing Infrastructure
- Comprehensive test suite with Vitest
- Unit tests for all commands (init, sync, doctor)
- Test fixtures for valid/invalid design tokens
- Coverage reporting with c8
- `prepublishOnly` hook to prevent publishing without passing tests

#### Documentation
- Comprehensive README with setup, troubleshooting, and architecture
- LICENSE (MIT)
- CONTRIBUTING guidelines
- GitHub issue templates (bug report, feature request)
- Pull request template

#### CI/CD
- GitHub Actions workflow for automated testing
- GitHub Actions workflow for npm publishing
- Test matrix for Node.js 20.x and 22.x

### Technical Details
- Package manager: npm
- Test framework: Vitest
- CLI framework: Commander.js
- Interactive prompts: @clack/prompts
- MCP client: @modelcontextprotocol/sdk
- Token parsing: @anthropic-ai/sdk (Claude Sonnet 4)
- Figma integration: figma-console-mcp (via stdio)

### Requirements
- Node.js >= 20.0.0
- Claude Code CLI
- Figma Console MCP
- Figma Desktop (variables API)
- Anthropic API key
- Figma Personal Access Token

[0.2.1]: https://github.com/kuriouscreator/designpull/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/kuriouscreator/designpull/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kuriouscreator/designpull/releases/tag/v0.1.0
