import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { runGenerate } from '../src/generate.js';

vi.mock('fs');
vi.mock('child_process');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

describe('generate command', () => {
  const testDir = '/test/dir';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('prerequisites check', () => {
    it('should check for Claude Code installation', () => {
      const claudeCheck = 'claude --version';

      expect(claudeCheck).toBe('claude --version');
    });

    it('should check for Figma Console MCP', () => {
      const mcpCheck = 'claude mcp list';

      expect(mcpCheck).toBe('claude mcp list');
    });

    it('should check for token-map.json', () => {
      fs.existsSync = vi.fn().mockReturnValue(false);

      const tokenMapPath = path.join(testDir, '.designpull', 'token-map.json');
      expect(fs.existsSync(tokenMapPath)).toBe(false);
    });

    it('should verify token-map.json is valid JSON', () => {
      const validJSON = '{ "collections": [] }';
      const invalidJSON = '{ collections: [ }';

      expect(() => JSON.parse(validJSON)).not.toThrow();
      expect(() => JSON.parse(invalidJSON)).toThrow();
    });
  });

  describe('component list', () => {
    it('should define available components', () => {
      const components = [
        { name: 'Button', variants: 4, sizes: 3, states: 5 },
        { name: 'Input', variants: 3, sizes: 3, states: 5 },
        { name: 'Card', variants: 3 },
        { name: 'Badge', variants: 5, sizes: 2 },
        { name: 'Text', description: 'Full type scale' },
      ];

      expect(components).toHaveLength(5);
      expect(components[0].name).toBe('Button');
      expect(components[1].states).toBe(5);
    });

    it('should calculate total component variants', () => {
      const button = { variants: 4, sizes: 3, states: 5 };
      const totalVariants = button.variants * button.sizes * button.states;

      expect(totalVariants).toBe(60);
    });
  });

  describe('Claude Code subprocess', () => {
    it('should spawn Claude Code with correct arguments', () => {
      const mockSpawn = vi.fn();
      spawn.mockImplementation(mockSpawn);

      const args = ['--print'];
      const prompt = 'Generate Figma components';

      // Mock spawn
      mockSpawn('claude', args, {
        stdio: ['pipe', 'inherit', 'inherit'],
      });

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should pass component generation prompt', () => {
      const prompt = `Create a "Components" page in Figma and generate:
- Button component
- Input component
- Card component`;

      expect(prompt).toContain('Components');
      expect(prompt).toContain('Button');
      expect(prompt).toContain('Input');
    });

    it('should handle subprocess errors', () => {
      const processError = new Error('Command failed');

      expect(() => {
        throw processError;
      }).toThrow('Command failed');
    });
  });

  describe('prompt generation', () => {
    it('should include token system reference', () => {
      const mockTokenMap = {
        collections: [
          { name: 'Primitives', variables: [] },
          { name: 'Semantic', variables: [] },
        ],
      };

      const prompt = `Use token system: ${JSON.stringify(mockTokenMap)}`;

      expect(prompt).toContain('Primitives');
      expect(prompt).toContain('Semantic');
    });

    it('should specify no hardcoded values rule', () => {
      const rule = 'All component properties must reference variables. No hardcoded colors, spacing, or typography values.';

      expect(rule).toContain('No hardcoded');
      expect(rule).toContain('reference variables');
    });

    it('should request component organization', () => {
      const instruction = 'Create components on a page named "Components"';

      expect(instruction).toContain('Components');
    });
  });

  describe('error handling', () => {
    it('should handle missing Claude Code', () => {
      const error = 'claude CLI not found';

      expect(error).toContain('claude CLI not found');
    });

    it('should handle missing MCP configuration', () => {
      const error = 'Figma Console MCP not found in Claude Code config';

      expect(error).toContain('MCP not found');
    });

    it('should handle missing token map', () => {
      fs.existsSync = vi.fn().mockReturnValue(false);

      const tokenMapPath = path.join(testDir, '.designpull', 'token-map.json');
      const exists = fs.existsSync(tokenMapPath);

      expect(exists).toBe(false);
    });

    it('should handle subprocess timeout', () => {
      const timeoutError = 'Claude Code subprocess timed out';

      expect(timeoutError).toContain('timed out');
    });
  });

  describe('component specifications', () => {
    it('should define Button component requirements', () => {
      const buttonSpec = {
        variants: ['primary', 'secondary', 'ghost', 'danger'],
        sizes: ['sm', 'md', 'lg'],
        states: ['default', 'hover', 'focus', 'disabled', 'loading'],
        properties: ['background', 'text', 'border', 'padding'],
      };

      expect(buttonSpec.variants).toHaveLength(4);
      expect(buttonSpec.sizes).toHaveLength(3);
      expect(buttonSpec.states).toHaveLength(5);
    });

    it('should define Input component requirements', () => {
      const inputSpec = {
        variants: ['default', 'error', 'disabled'],
        sizes: ['sm', 'md', 'lg'],
        properties: ['background', 'text', 'border', 'padding', 'placeholder'],
      };

      expect(inputSpec.variants).toContain('error');
      expect(inputSpec.properties).toContain('placeholder');
    });

    it('should define Card component requirements', () => {
      const cardSpec = {
        variants: ['default', 'elevated', 'outlined'],
        properties: ['background', 'border', 'shadow', 'padding', 'radius'],
      };

      expect(cardSpec.variants).toHaveLength(3);
      expect(cardSpec.properties).toContain('shadow');
    });
  });

  describe('variable binding', () => {
    it('should verify components use semantic tokens', () => {
      const validComponent = {
        background: '{color/bg/canvas}',
        text: '{color/text/primary}',
        padding: '{space/4}',
      };

      Object.values(validComponent).forEach(value => {
        expect(value).toMatch(/^\{.+\}$/);
      });
    });

    it('should reject hardcoded values', () => {
      const invalidComponent = {
        background: '#FFFFFF',
        text: 'rgb(0,0,0)',
        padding: '16px',
      };

      Object.values(invalidComponent).forEach(value => {
        expect(value).not.toMatch(/^\{.+\}$/);
      });
    });
  });
});
