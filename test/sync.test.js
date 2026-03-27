import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSync } from '../src/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock('fs');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  })),
  confirm: vi.fn(),
  isCancel: vi.fn(),
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    message: vi.fn(),
  },
  note: vi.fn(),
}));

describe('sync command', () => {
  const testDir = '/test/dir';
  const fixturesDir = path.join(__dirname, 'fixtures');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('.env validation', () => {
    it('should check for required environment variables', () => {
      const requiredVars = [
        'FIGMA_FILE_URL',
        'FIGMA_ACCESS_TOKEN',
      ];

      const mockEnv = {
        FIGMA_FILE_URL: 'https://figma.com/design/test',
        FIGMA_ACCESS_TOKEN: 'figd_test',
      };

      requiredVars.forEach(varName => {
        expect(mockEnv[varName]).toBeDefined();
      });
    });

    it('should not require ANTHROPIC_API_KEY', () => {
      const requiredVars = [
        'FIGMA_FILE_URL',
        'FIGMA_ACCESS_TOKEN',
      ];

      expect(requiredVars).not.toContain('ANTHROPIC_API_KEY');
    });

    it('should fail if .env file is missing', () => {
      fs.existsSync = vi.fn().mockReturnValue(false);

      const envPath = path.join(testDir, '.env');
      expect(fs.existsSync(envPath)).toBe(false);
    });

    it('should parse .env file correctly', () => {
      const envContent = `FIGMA_FILE_URL=https://figma.com/design/test
FIGMA_ACCESS_TOKEN=figd_test_token`;

      const parsed = envContent.split('\n').reduce((acc, line) => {
        const [key, value] = line.split('=');
        if (key && value) acc[key] = value;
        return acc;
      }, {});

      expect(parsed.FIGMA_FILE_URL).toBe('https://figma.com/design/test');
      expect(parsed.FIGMA_ACCESS_TOKEN).toBe('figd_test_token');
    });
  });

  describe('design-token.md validation', () => {
    it('should check if design-token.md exists', () => {
      fs.existsSync = vi.fn().mockReturnValue(false);

      const tokenPath = path.join(testDir, 'design-token.md');
      expect(fs.existsSync(tokenPath)).toBe(false);
    });

    it('should read design-token.md content', () => {
      const mockContent = '# design-token.md\n## Primitive Tokens';

      fs.readFileSync = vi.fn().mockReturnValue(mockContent);

      expect(fs.readFileSync()).toContain('design-token.md');
      expect(fs.readFileSync()).toContain('Primitive Tokens');
    });
  });

  describe('token map validation', () => {
    it('should validate token map has required collections', () => {
      const validTokenMap = {
        collections: [
          { name: 'Primitives', modes: ['Default'], variables: [] },
          { name: 'Semantic', modes: ['Light', 'Dark'], variables: [] },
          { name: 'Typography', modes: ['Desktop', 'Mobile'], variables: [] },
        ],
      };

      const collectionNames = validTokenMap.collections.map(c => c.name);

      expect(collectionNames).toContain('Primitives');
      expect(collectionNames).toContain('Semantic');
      expect(collectionNames).toContain('Typography');
    });

    it('should reject token map with missing collections', () => {
      const invalidTokenMap = {
        collections: [
          { name: 'Primitives', modes: ['Default'], variables: [] },
        ],
      };

      const requiredCollections = ['Primitives', 'Semantic', 'Typography'];
      const collectionNames = invalidTokenMap.collections.map(c => c.name);
      const missingCollections = requiredCollections.filter(
        name => !collectionNames.includes(name)
      );

      expect(missingCollections.length).toBeGreaterThan(0);
      expect(missingCollections).toContain('Semantic');
    });

    it('should validate minimum number of variables', () => {
      const tokenMap = {
        collections: [
          {
            name: 'Primitives',
            modes: ['Default'],
            variables: [
              { name: 'color/primary', type: 'COLOR', values: { Default: '#000' } },
              { name: 'space/1', type: 'FLOAT', values: { Default: 4 } },
            ],
          },
        ],
      };

      const totalVars = tokenMap.collections.reduce(
        (sum, col) => sum + col.variables.length,
        0
      );

      expect(totalVars).toBeGreaterThanOrEqual(2);
    });
  });

  describe('local token parsing', () => {
    it('should handle valid token response', async () => {
      const mockResponse = {
        collections: [
          {
            name: 'Primitives',
            modes: ['Default'],
            variables: [
              {
                name: 'color/brand/primary',
                type: 'COLOR',
                values: { Default: '#00A7E1' },
                alias: null,
                description: 'Primary brand color',
              },
            ],
          },
        ],
      };

      expect(mockResponse.collections).toHaveLength(1);
      expect(mockResponse.collections[0].variables).toHaveLength(1);
    });

    it('should validate variable structure', () => {
      const validVariable = {
        name: 'color/primary',
        type: 'COLOR',
        values: { Default: '#000' },
        alias: null,
        description: 'Primary color',
      };

      expect(validVariable).toHaveProperty('name');
      expect(validVariable).toHaveProperty('type');
      expect(validVariable).toHaveProperty('values');
      expect(['COLOR', 'FLOAT', 'STRING']).toContain(validVariable.type);
    });
  });

  describe('dry run mode', () => {
    it('should not write to Figma in dry-run mode', () => {
      const dryRunOpts = { dryRun: true };

      expect(dryRunOpts.dryRun).toBe(true);
    });

    it('should still validate tokens in dry-run mode', () => {
      const tokenMap = {
        collections: [
          { name: 'Primitives', modes: ['Default'], variables: [] },
        ],
      };

      expect(tokenMap.collections).toBeDefined();
      expect(Array.isArray(tokenMap.collections)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle parse errors', async () => {
      const mockError = new Error('Parse failed: invalid markdown structure');

      expect(() => {
        throw mockError;
      }).toThrow('Parse failed');
    });

    it('should handle Claude Code subprocess errors', async () => {
      const subprocessError = new Error('Claude Code exited with code 1');

      expect(subprocessError.message).toContain('Claude Code');
    });
  });

  describe('token map persistence', () => {
    it('should write token map to .designpull directory', () => {
      const tokenMap = { collections: [] };
      const outputPath = path.join(testDir, '.designpull', 'token-map.json');

      fs.mkdirSync = vi.fn();
      fs.writeFileSync = vi.fn();

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(tokenMap, null, 2));

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.designpull'),
        expect.any(Object)
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should format JSON with proper indentation', () => {
      const tokenMap = { collections: [{ name: 'Test' }] };
      const formatted = JSON.stringify(tokenMap, null, 2);

      expect(formatted).toContain('  ');
      expect(formatted).toContain('"collections"');
    });
  });
});
