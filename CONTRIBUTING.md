# Contributing to DesignPull

Thank you for your interest in contributing to DesignPull! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your contribution
4. Make your changes
5. Push to your fork and submit a pull request

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Git
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- Figma Desktop (for testing Figma integrations)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/designpull.git
cd designpull

# Install dependencies
npm install

# Make scripts executable (Unix/macOS)
chmod +x scripts/mcp-server.sh scripts/mcp-wrapper.js
```

### Running Locally

```bash
# Run the CLI
node src/index.js --help

# Test a specific command
node src/index.js doctor
node src/index.js init
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests with UI

```bash
npm run test:ui
```

### Coverage Requirements

- Lines: >= 60%
- Functions: >= 60%
- Branches: >= 60%
- Statements: >= 60%

## Code Style

### JavaScript Style Guide

- Use ES modules (`import`/`export`)
- Use `const` and `let`, avoid `var`
- Use template literals for string interpolation
- Use arrow functions where appropriate
- Add JSDoc comments for all exported functions
- Keep functions focused and single-purpose
- Prefer descriptive names over comments

### Example

```javascript
/**
 * Parse .env file content into an object
 * @param {string} content - Raw .env file content
 * @returns {Object<string, string>} Parsed environment variables
 */
export function parseEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    result[key.trim()] = rest.join('=').trim();
  }
  return result;
}
```

### File Organization

- `src/` - Source code
  - `index.js` - CLI entry point
  - `init.js` - init command
  - `sync.js` - sync command
  - `doctor.js` - doctor command
  - `utils.js` - Shared utilities
- `test/` - Test files
  - `fixtures/` - Test fixtures
  - `*.test.js` - Test files (mirror src/ structure)
- `scripts/` - Build and utility scripts

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

Examples:
```
feat: add support for Windows MCP server management
fix: handle missing .env file gracefully
docs: update README with troubleshooting section
test: add unit tests for token parsing
```

## Pull Request Process

### Before Submitting

1. Ensure all tests pass: `npm test`
2. Update documentation if needed
3. Add tests for new functionality
4. Follow the code style guidelines
5. Update CHANGELOG.md with your changes

### PR Title

Use conventional commit format:
```
feat: add component variant generation
fix: resolve token parsing edge case
```

### PR Description

Include:
- What changed and why
- How to test the changes
- Screenshots (if UI changes)
- Related issue numbers

### Review Process

1. Automated tests must pass (CI workflow)
2. At least one maintainer approval required
3. All review comments must be addressed
4. Squash and merge when approved

## Reporting Bugs

### Before Reporting

1. Check existing issues
2. Run `designpull doctor` to check your environment
3. Try the latest version

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Run '...'
2. See error

**Expected behavior**
What you expected to happen.

**Environment**
- OS: [e.g., macOS 14.0, Windows 11]
- Node version: [e.g., 20.10.0]
- DesignPull version: [e.g., 0.1.0]
- Output of `designpull doctor`

**Additional context**
Any other context about the problem.
```

## Suggesting Features

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Other solutions you've thought about.

**Additional context**
Mockups, examples, or references.
```

## Questions?

- Open a [GitHub Discussion](https://github.com/kuriouscreator/designpull/discussions)
- Check the [README](README.md) for documentation
- Review existing [Issues](https://github.com/kuriouscreator/designpull/issues)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
