import { describe, it, expect } from 'vitest';
import { parseDesignTokens } from '../src/parser.js';

// Minimal design-token.md matching the format from `designpull init`
const SAMPLE_MARKDOWN = `# design-token.md

---

## Primitive Tokens

### Colors — Brand
\`\`\`
color/brand/primary:       #2F48C4
color/brand/accent:        #3CF8F8
color/brand/secondary:     #8B5CF6
color/brand/dark:          #1A1A2E
\`\`\`

### Colors — Neutrals
\`\`\`
color/neutral/900:         #0A0A0A
color/neutral/500:         #808080
color/neutral/100:         #F5F5F5
color/neutral/white:       #FFFFFF
\`\`\`

### Colors — Feedback
\`\`\`
color/feedback/success:    #629B54
color/feedback/warning:    #EA943E
color/feedback/error:      #A72A3F
\`\`\`

### Spacing
\`\`\`
spacing/1:   4px
spacing/2:   8px
spacing/4:   16px
spacing/6:   24px
spacing/8:   32px
spacing/12:  48px
\`\`\`

### Size
\`\`\`
size/md:   40px
\`\`\`

### Border Radius
\`\`\`
radius/md:     8px
radius/lg:     12px
radius/xl:     16px
radius/full:   9999px
\`\`\`

### Border Width
\`\`\`
border/width/default:  1.5px
\`\`\`

### Elevation
\`\`\`
elevation/sm:  0 1px 2px rgba(0,0,0,0.08)
elevation/lg:  0 8px 24px rgba(0,0,0,0.12)
\`\`\`

### Typography
\`\`\`
typography/family/sans:     "Inter"
typography/family/mono:     "IBM Plex Mono"
typography/weight/regular:  400
typography/weight/medium:   500
\`\`\`

---

## Semantic Tokens

### color/surface
\`\`\`
color/surface/default      light → color/neutral/100       dark → #0A0A0A
color/surface/raised       light → color/neutral/white     dark → color/brand/dark
\`\`\`

### color/text
\`\`\`
color/text/primary         light → color/neutral/900       dark → color/neutral/100
color/text/inverse         light → color/neutral/white     dark → color/neutral/900
\`\`\`

### color/feedback
\`\`\`
color/feedback/success     → color/feedback/success
color/feedback/warning     → color/feedback/warning
color/feedback/info        light → color/brand/primary    dark → color/brand/accent
\`\`\`

### Spacing aliases
\`\`\`
spacing/xs    → spacing/1    (4px)
spacing/md    → spacing/4    (16px)
\`\`\`

### Radius aliases
\`\`\`
radius/interactive  → radius/md
radius/card         → radius/lg
\`\`\`

---

## Typography Scale

### Desktop
\`\`\`
h1:        48px / line-height 56 / weight medium
body/md:   16px / line-height 24 / weight regular
code:      14px / line-height 20 / weight regular (IBM Plex Mono)
\`\`\`

### Mobile
\`\`\`
h1:        30px / line-height 38 / weight medium
body/md:   16px / line-height 24 / weight regular
code:      13px / line-height 20 / weight regular (IBM Plex Mono)
\`\`\`

---

## CSS Custom Property Convention

\`\`\`css
--color-surface-default
\`\`\`
`;

describe('parser', () => {
  const result = parseDesignTokens(SAMPLE_MARKDOWN);

  describe('overall structure', () => {
    it('should return collections array with 3 collections', () => {
      expect(result.collections).toHaveLength(3);
    });

    it('should have Primitives, Semantic, and Typography', () => {
      const names = result.collections.map(c => c.name);
      expect(names).toEqual(['Primitives', 'Semantic', 'Typography']);
    });
  });

  describe('Primitives collection', () => {
    const primitives = result.collections.find(c => c.name === 'Primitives');

    it('should have mode Default', () => {
      expect(primitives.modes).toEqual(['Default']);
    });

    it('should parse COLOR tokens', () => {
      const primary = primitives.variables.find(v => v.name === 'color/brand/primary');
      expect(primary).toBeDefined();
      expect(primary.type).toBe('COLOR');
      expect(primary.values.Default).toBe('#2F48C4');
      expect(primary.alias).toBeNull();
    });

    it('should parse FLOAT tokens (strip px)', () => {
      const spacing = primitives.variables.find(v => v.name === 'spacing/4');
      expect(spacing).toBeDefined();
      expect(spacing.type).toBe('FLOAT');
      expect(spacing.values.Default).toBe(16);
    });

    it('should parse decimal FLOAT tokens', () => {
      const border = primitives.variables.find(v => v.name === 'border/width/default');
      expect(border).toBeDefined();
      expect(border.type).toBe('FLOAT');
      expect(border.values.Default).toBe(1.5);
    });

    it('should parse STRING tokens (elevation)', () => {
      const elevation = primitives.variables.find(v => v.name === 'elevation/sm');
      expect(elevation).toBeDefined();
      expect(elevation.type).toBe('STRING');
      expect(elevation.values.Default).toBe('0 1px 2px rgba(0,0,0,0.08)');
    });

    it('should parse quoted STRING tokens (font family)', () => {
      const font = primitives.variables.find(v => v.name === 'typography/family/sans');
      expect(font).toBeDefined();
      expect(font.type).toBe('STRING');
      expect(font.values.Default).toBe('Inter');
    });

    it('should parse bare number as FLOAT (weight)', () => {
      const weight = primitives.variables.find(v => v.name === 'typography/weight/medium');
      expect(weight).toBeDefined();
      expect(weight.type).toBe('FLOAT');
      expect(weight.values.Default).toBe(500);
    });

    it('should parse all primitive tokens', () => {
      // 4 brand + 4 neutral + 3 feedback + 6 spacing + 1 size + 4 radius + 1 border + 2 elevation + 4 typography
      expect(primitives.variables.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Semantic collection', () => {
    const semantic = result.collections.find(c => c.name === 'Semantic');

    it('should have modes Light and Dark', () => {
      expect(semantic.modes).toEqual(['Light', 'Dark']);
    });

    it('should parse light/dark tokens with alias references', () => {
      const surface = semantic.variables.find(v => v.name === 'color/surface/raised');
      expect(surface).toBeDefined();
      expect(surface.type).toBe('COLOR');
      expect(surface.values.Light).toBe('#FFFFFF'); // resolved from color/neutral/white
      expect(surface.values.Dark).toBe('#1A1A2E'); // resolved from color/brand/dark
      expect(surface.alias).toBe('color/neutral/white');
    });

    it('should handle dark mode raw hex values', () => {
      const surface = semantic.variables.find(v => v.name === 'color/surface/default');
      expect(surface).toBeDefined();
      expect(surface.values.Light).toBe('#F5F5F5'); // resolved from color/neutral/100
      expect(surface.values.Dark).toBe('#0A0A0A'); // raw hex
    });

    it('should parse shared alias tokens', () => {
      const success = semantic.variables.find(v => v.name === 'color/feedback/success');
      expect(success).toBeDefined();
      expect(success.values.Light).toBe('#629B54');
      expect(success.values.Dark).toBe('#629B54');
      expect(success.alias).toBe('color/feedback/success');
    });

    it('should parse spacing aliases and strip comments', () => {
      const xs = semantic.variables.find(v => v.name === 'spacing/xs');
      expect(xs).toBeDefined();
      expect(xs.type).toBe('FLOAT');
      expect(xs.values.Light).toBe(4);
      expect(xs.values.Dark).toBe(4);
      expect(xs.alias).toBe('spacing/1');
    });

    it('should parse radius aliases', () => {
      const card = semantic.variables.find(v => v.name === 'radius/card');
      expect(card).toBeDefined();
      expect(card.alias).toBe('radius/lg');
      expect(card.values.Light).toBe(12);
    });
  });

  describe('Typography collection', () => {
    const typography = result.collections.find(c => c.name === 'Typography');

    it('should have modes Desktop and Mobile', () => {
      expect(typography.modes).toEqual(['Desktop', 'Mobile']);
    });

    it('should create fontSize variables with per-mode values', () => {
      const h1 = typography.variables.find(v => v.name === 'h1/fontSize');
      expect(h1).toBeDefined();
      expect(h1.type).toBe('FLOAT');
      expect(h1.values.Desktop).toBe(48);
      expect(h1.values.Mobile).toBe(30);
    });

    it('should create lineHeight variables', () => {
      const h1 = typography.variables.find(v => v.name === 'h1/lineHeight');
      expect(h1).toBeDefined();
      expect(h1.values.Desktop).toBe(56);
      expect(h1.values.Mobile).toBe(38);
    });

    it('should create fontWeight variables with alias', () => {
      const h1 = typography.variables.find(v => v.name === 'h1/fontWeight');
      expect(h1).toBeDefined();
      expect(h1.type).toBe('FLOAT');
      expect(h1.values.Desktop).toBe(500); // medium
      expect(h1.alias).toBe('typography/weight/medium');
    });

    it('should create fontFamily variables with alias', () => {
      const h1 = typography.variables.find(v => v.name === 'h1/fontFamily');
      expect(h1).toBeDefined();
      expect(h1.type).toBe('STRING');
      expect(h1.values.Desktop).toBe('Inter');
      expect(h1.alias).toBe('typography/family/sans');
    });

    it('should use mono font family for code style', () => {
      const code = typography.variables.find(v => v.name === 'code/fontFamily');
      expect(code).toBeDefined();
      expect(code.values.Desktop).toBe('IBM Plex Mono');
      expect(code.alias).toBe('typography/family/mono');
    });

    it('should handle body/md with same values across modes', () => {
      const bodyFontSize = typography.variables.find(v => v.name === 'body/md/fontSize');
      expect(bodyFontSize).toBeDefined();
      expect(bodyFontSize.values.Desktop).toBe(16);
      expect(bodyFontSize.values.Mobile).toBe(16);
    });

    it('should produce 4 variables per typography style', () => {
      // 3 styles (h1, body/md, code) × 4 vars each = 12
      expect(typography.variables).toHaveLength(12);
    });
  });

  describe('validation compatibility', () => {
    it('should have at least 10 total variables', () => {
      const total = result.collections.reduce((sum, c) => sum + c.variables.length, 0);
      expect(total).toBeGreaterThanOrEqual(10);
    });

    it('should have all required collection names', () => {
      const names = result.collections.map(c => c.name);
      expect(names).toContain('Primitives');
      expect(names).toContain('Semantic');
      expect(names).toContain('Typography');
    });

    it('should have valid variable structure', () => {
      for (const collection of result.collections) {
        for (const variable of collection.variables) {
          expect(variable).toHaveProperty('name');
          expect(variable).toHaveProperty('type');
          expect(variable).toHaveProperty('values');
          expect(variable).toHaveProperty('alias');
          expect(variable).toHaveProperty('description');
          expect(['COLOR', 'FLOAT', 'STRING']).toContain(variable.type);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should ignore CSS section code blocks', () => {
      // The CSS Custom Property Convention section has a ```css block
      // It should NOT be parsed as primitives or semantic tokens
      const primitives = result.collections.find(c => c.name === 'Primitives');
      const cssVar = primitives.variables.find(v => v.name === '--color-surface-default');
      expect(cssVar).toBeUndefined();
    });

    it('should handle empty markdown gracefully', () => {
      const empty = parseDesignTokens('');
      expect(empty.collections).toHaveLength(3);
      expect(empty.collections[0].variables).toHaveLength(0);
    });

    it('should handle markdown with no code blocks', () => {
      const noBlocks = parseDesignTokens('## Primitive Tokens\nSome text');
      expect(noBlocks.collections[0].variables).toHaveLength(0);
    });
  });
});
