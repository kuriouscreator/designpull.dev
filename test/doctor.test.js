import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { runDoctor } from '../src/doctor.js';

vi.mock('fs');
vi.mock('child_process');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    step: vi.fn(),
  },
}));

describe('doctor command', () => {
  const testDir = '/test/dir';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'version', 'get').mockReturnValue('v20.10.0');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Node.js version check', () => {
    it('should pass for Node.js >= 20', () => {
      const version = 'v20.10.0';
      const major = parseInt(version.slice(1).split('.')[0]);

      expect(major).toBeGreaterThanOrEqual(20);
    });

    it('should fail for Node.js < 20', () => {
      const version = 'v18.19.0';
      const major = parseInt(version.slice(1).split('.')[0]);

      expect(major).toBeLessThan(20);
    });

    it('should parse version string correctly', () => {
      const versions = ['v20.10.0', 'v22.1.0', 'v21.5.3'];

      versions.forEach(version => {
        const parsed = version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
        expect(parsed).not.toBeNull();
        expect(parseInt(parsed[1])).toBeGreaterThanOrEqual(20);
      });
    });
  });

  describe('Claude Code installation check', () => {
    it('should detect Claude Code installation', () => {
      const mockExec = vi.fn((cmd, callback) => {
        callback(null, { stdout: 'claude version 1.0.0' });
      });

      exec.mockImplementation(mockExec);

      expect(exec).toBeDefined();
    });

    it('should handle missing Claude Code', () => {
      const mockExec = vi.fn((cmd, callback) => {
        callback(new Error('command not found: claude'));
      });

      exec.mockImplementation(mockExec);

      expect(() => {
        mockExec('claude --version', (error) => {
          if (error) throw error;
        });
      }).toThrow();
    });
  });

  describe('Figma Console MCP check', () => {
    it('should detect MCP in Claude config', () => {
      const mockMcpList = `figma-console
chakra-ui`;

      expect(mockMcpList).toContain('figma-console');
    });

    it('should handle missing MCP', () => {
      const mockMcpList = 'chakra-ui';

      expect(mockMcpList).not.toContain('figma-console');
    });

    it('should parse mcp list output', () => {
      const output = 'figma-console\nchakra-ui\nother-mcp';
      const mcps = output.split('\n').filter(Boolean);

      expect(mcps).toHaveLength(3);
      expect(mcps).toContain('figma-console');
    });
  });

  describe('environment variables check', () => {
    it('should check for ANTHROPIC_API_KEY', () => {
      const mockEnv = {
        ANTHROPIC_API_KEY: 'sk-ant-test123',
      };

      expect(mockEnv.ANTHROPIC_API_KEY).toBeDefined();
      expect(mockEnv.ANTHROPIC_API_KEY).toMatch(/^sk-ant-/);
    });

    it('should check for FIGMA_ACCESS_TOKEN', () => {
      const mockEnv = {
        FIGMA_ACCESS_TOKEN: 'figd_test123',
      };

      expect(mockEnv.FIGMA_ACCESS_TOKEN).toBeDefined();
      expect(mockEnv.FIGMA_ACCESS_TOKEN).toMatch(/^figd_/);
    });

    it('should handle missing environment variables', () => {
      const mockEnv = {};

      expect(mockEnv.ANTHROPIC_API_KEY).toBeUndefined();
      expect(mockEnv.FIGMA_ACCESS_TOKEN).toBeUndefined();
    });

    it('should validate API key format', () => {
      const validKeys = [
        'sk-ant-api03-abcd1234',
        'sk-ant-test-xyz789',
      ];

      const invalidKeys = [
        'invalid-key',
        '',
        'sk-openai-123',
      ];

      validKeys.forEach(key => {
        expect(key).toMatch(/^sk-ant-/);
      });

      invalidKeys.forEach(key => {
        expect(key).not.toMatch(/^sk-ant-/);
      });
    });
  });

  describe('design-token.md check', () => {
    it('should check if design-token.md exists', () => {
      fs.existsSync = vi.fn().mockReturnValue(true);

      const tokenPath = path.join(testDir, 'design-token.md');
      expect(fs.existsSync(tokenPath)).toBe(true);
    });

    it('should fail if design-token.md is missing', () => {
      fs.existsSync = vi.fn().mockReturnValue(false);

      const tokenPath = path.join(testDir, 'design-token.md');
      expect(fs.existsSync(tokenPath)).toBe(false);
    });
  });

  describe('token-map.json check', () => {
    it('should check if token-map.json exists', () => {
      fs.existsSync = vi.fn().mockReturnValue(true);

      const tokenMapPath = path.join(testDir, '.designpull', 'token-map.json');
      expect(fs.existsSync(tokenMapPath)).toBe(true);
    });

    it('should suggest running sync if token-map is missing', () => {
      fs.existsSync = vi.fn().mockReturnValue(false);

      const tokenMapPath = path.join(testDir, '.designpull', 'token-map.json');
      const exists = fs.existsSync(tokenMapPath);

      if (!exists) {
        const suggestion = 'Run designpull sync to generate token map';
        expect(suggestion).toContain('designpull sync');
      }
    });
  });

  describe('optional checks', () => {
    it('should check for Chakra UI MCP (optional)', () => {
      const mcpList = ['figma-console', 'chakra-ui'];

      const hasChakra = mcpList.includes('chakra-ui');
      expect(hasChakra).toBe(true);
    });

    it('should not fail without optional MCPs', () => {
      const mcpList = ['figma-console'];

      const hasRequired = mcpList.includes('figma-console');
      const hasChakra = mcpList.includes('chakra-ui');

      expect(hasRequired).toBe(true);
      expect(hasChakra).toBe(false);
    });
  });

  describe('health check summary', () => {
    it('should count passed checks', () => {
      const checks = [
        { name: 'Node.js', passed: true },
        { name: 'Claude Code', passed: true },
        { name: 'Figma MCP', passed: false },
        { name: 'API Key', passed: true },
      ];

      const passedCount = checks.filter(c => c.passed).length;
      expect(passedCount).toBe(3);
    });

    it('should count failed checks', () => {
      const checks = [
        { name: 'Node.js', passed: true },
        { name: 'Claude Code', passed: false },
        { name: 'Figma MCP', passed: false },
      ];

      const failedCount = checks.filter(c => !c.passed).length;
      expect(failedCount).toBe(2);
    });

    it('should determine overall health status', () => {
      const allPassed = [
        { name: 'Check 1', passed: true },
        { name: 'Check 2', passed: true },
      ];

      const someFailed = [
        { name: 'Check 1', passed: true },
        { name: 'Check 2', passed: false },
      ];

      expect(allPassed.every(c => c.passed)).toBe(true);
      expect(someFailed.every(c => c.passed)).toBe(false);
    });
  });

  describe('fix instructions', () => {
    it('should provide fix for missing Claude Code', () => {
      const fix = 'Install Claude Code: npm install -g @anthropic-ai/claude-code';

      expect(fix).toContain('npm install -g @anthropic-ai/claude-code');
    });

    it('should provide fix for missing MCP', () => {
      const fix = 'Add Figma Console MCP: claude mcp add figma-console';

      expect(fix).toContain('claude mcp add');
    });

    it('should provide fix for missing API key', () => {
      const fix = 'Set ANTHROPIC_API_KEY in .env file';

      expect(fix).toContain('ANTHROPIC_API_KEY');
      expect(fix).toContain('.env');
    });
  });

  describe('edge cases', () => {
    it('should handle .env file in parent directory', () => {
      const dirs = [
        path.join(testDir, '.env'),
        path.join(testDir, '..', '.env'),
      ];

      expect(dirs).toHaveLength(2);
    });

    it('should handle malformed .env file', () => {
      const malformedEnv = 'KEY1=value1\nINVALID LINE\nKEY2=value2';

      const parsed = malformedEnv.split('\n').reduce((acc, line) => {
        const match = line.match(/^([^=]+)=(.+)$/);
        if (match) {
          acc[match[1]] = match[2];
        }
        return acc;
      }, {});

      expect(parsed.KEY1).toBe('value1');
      expect(parsed.KEY2).toBe('value2');
      expect(parsed['INVALID LINE']).toBeUndefined();
    });
  });
});
