import { describe, it, expect } from 'vitest';
import { CATEGORY_DEFINITIONS } from '../src/ui/components/CategoryFilterBar';

describe('CategoryFilterBar Definitions & Logic', () => {
  it('defines all 7 category definitions with label + glyph, never a colour', () => {
    expect(CATEGORY_DEFINITIONS.length).toBe(7);

    const categoryIds = CATEGORY_DEFINITIONS.map((c) => c.id);
    expect(categoryIds).toContain('all');
    expect(categoryIds).toContain('sophisme');
    expect(categoryIds).toContain('unsupported');
    expect(categoryIds).toContain('overreach');
    expect(categoryIds).toContain('sourceAbsent');
    expect(categoryIds).toContain('framing');
    expect(categoryIds).toContain('strength');

    // Colour means severity only: no pill may carry a category hue key.
    for (const category of CATEGORY_DEFINITIONS) {
      expect(category).not.toHaveProperty('colorKey');
      expect(category).not.toHaveProperty('subtleColorKey');
      expect(category).not.toHaveProperty('borderColorKey');
      expect(category.icon).toBeTruthy();
    }
  });

  it('has French labels and short codes for all categories', () => {
    const sophisme = CATEGORY_DEFINITIONS.find((c) => c.id === 'sophisme');
    expect(sophisme?.frenchLabel).toBe('Sophisme');
    expect(sophisme?.shortCode).toBe('SOPH');
    expect(sophisme?.icon).toBe('⚡');

    const unsupported = CATEGORY_DEFINITIONS.find((c) => c.id === 'unsupported');
    expect(unsupported?.frenchLabel).toBe('Affirmation non étayée');
    expect(unsupported?.shortCode).toBe('NON-ÉT');
  });
});
