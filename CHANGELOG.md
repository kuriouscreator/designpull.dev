# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

- `designpull generate` - Generate Figma components from token system
  - Creates Components page in Figma
  - Generates Button, Input, Card, Badge, and Text components
  - All components reference variables (no hardcoded values)
  - Spawns Claude Code with component generation prompts

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
- Unit tests for all commands (init, sync, generate, doctor)
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

[0.1.0]: https://github.com/kuriouscreator/designpull/releases/tag/v0.1.0
