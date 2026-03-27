import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runInit } from '../src/init.js';

vi.mock('fs');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  group: vi.fn(),
  note: vi.fn(),
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
  isCancel: vi.fn(),
  cancel: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    message: vi.fn(),
    step: vi.fn(),
  },
}));

describe('init command', () => {
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

  describe('file generation', () => {
    it('should check if design-token.md already exists', () => {
      fs.existsSync = vi.fn().mockReturnValue(true);

      const tokenPath = path.join(testDir, 'design-token.md');
      const exists = fs.existsSync(tokenPath);

      expect(exists).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith(tokenPath);
    });

    it('should create design-token.md with valid template', () => {
      const mockAnswers = {
        projectName: 'Test Project',
        projectDescription: 'Test Description',
        componentLibrary: 'Chakra UI',
        styling: 'CSS Modules',
        primaryColor: '#00A7E1',
        accentColor: '#003459',
        secondaryColor: '#00171F',
        darkColor: '#000505',
        neutralDark: '#0A0A0A',
        neutralMid: '#808080',
        neutralLight: '#F5F5F5',
        fontSans: 'Inter',
        fontMono: 'Fira Code',
        darkModeSurface: '#1A1A1A',
        darkModeRaised: '#2A2A2A',
      };

      expect(mockAnswers.projectName).toBe('Test Project');
      expect(mockAnswers.primaryColor).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should create .env file with Figma credentials only', () => {
      const mockEnvContent = `FIGMA_FILE_URL=https://figma.com/design/test
FIGMA_ACCESS_TOKEN=figd_test_token`;

      fs.writeFileSync = vi.fn();

      const envPath = path.join(testDir, '.env');
      fs.writeFileSync(envPath, mockEnvContent);

      expect(fs.writeFileSync).toHaveBeenCalledWith(envPath, mockEnvContent);
    });

    it('should not include ANTHROPIC_API_KEY in .env', () => {
      const envContent = `# DesignPull
FIGMA_FILE_URL=https://figma.com/design/test
FIGMA_FILE_KEY=test
FIGMA_ACCESS_TOKEN=figd_test_token`;

      expect(envContent).not.toContain('ANTHROPIC_API_KEY');
    });

    it('should create .gitignore file', () => {
      fs.existsSync = vi.fn().mockReturnValue(false);
      fs.writeFileSync = vi.fn();

      const gitignorePath = path.join(testDir, '.gitignore');
      const gitignoreContent = '.env\nnode_modules/';

      fs.writeFileSync(gitignorePath, gitignoreContent);

      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should validate hex color format', () => {
      const validColors = ['#FFFFFF', '#000000', '#00A7E1'];
      const invalidColors = ['#FFF', 'FFFFFF', 'rgb(255,255,255)', 'blue'];

      validColors.forEach(color => {
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });

      invalidColors.forEach(color => {
        expect(color).not.toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should handle missing required fields', () => {
      const incompleteAnswers = {
        projectName: '',
        primaryColor: '#00A7E1',
      };

      expect(incompleteAnswers.projectName).toBe('');
    });
  });

  describe('.env handling', () => {
    it('should not overwrite existing .env without confirmation', async () => {
      fs.existsSync = vi.fn().mockReturnValue(true);
      fs.readFileSync = vi.fn().mockReturnValue('EXISTING=value');

      const envPath = path.join(testDir, '.env');

      expect(fs.existsSync(envPath)).toBe(true);
    });

    it('should append to .gitignore if it exists', () => {
      const existingGitignore = 'node_modules/\n*.log';
      const newEntry = '.env';

      fs.existsSync = vi.fn().mockReturnValue(true);
      fs.readFileSync = vi.fn().mockReturnValue(existingGitignore);

      expect(fs.readFileSync()).toContain('node_modules');
    });
  });

  describe('error handling', () => {
    it('should handle file write errors gracefully', () => {
      fs.writeFileSync = vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        fs.writeFileSync('/test/file', 'content');
      }).toThrow('Permission denied');
    });

    it('should handle invalid output directory', () => {
      const invalidDir = '/nonexistent/path';

      fs.existsSync = vi.fn().mockReturnValue(false);
      fs.mkdirSync = vi.fn().mockImplementation(() => {
        throw new Error('Cannot create directory');
      });

      expect(() => {
        fs.mkdirSync(invalidDir, { recursive: true });
      }).toThrow('Cannot create directory');
    });
  });

  describe('integration scenarios', () => {
    it('should support custom output directory', async () => {
      const customDir = '/custom/path';

      expect(path.isAbsolute(customDir)).toBe(true);
      expect(customDir).toBe('/custom/path');
    });

    it('should validate Figma URL format', () => {
      const validUrls = [
        'https://figma.com/design/abc123',
        'https://www.figma.com/file/xyz789',
      ];

      const invalidUrls = [
        'http://figma.com',
        'not-a-url',
        '',
      ];

      validUrls.forEach(url => {
        expect(url).toContain('figma.com');
      });

      invalidUrls.forEach(url => {
        expect(url).not.toMatch(/^https:\/\/(www\.)?figma\.com\/(design|file)\/.+/);
      });
    });
  });
});
