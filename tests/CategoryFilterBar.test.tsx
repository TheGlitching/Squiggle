import { describe, it, expect } from 'vitest';
import { CATEGORY_DEFINITIONS } from '../src/ui/components/CategoryFilterBar';

describe('CategoryFilterBar Definitions & Logic', () => {
  it('defines all 7 category definitions with appropriate metadata and colors', () => {
    expect(CATEGORY_DEFINITIONS.length).toBe(7);
    
    const categoryIds = CATEGORY_DEFINITIONS.map(c => c.id);
    expect(categoryIds).toContain('all');
    expect(categoryIds).toContain('sophisme');
    expect(categoryIds).toContain('unsupported');
    expect(categoryIds).toContain('overreach');
    expect(categoryIds).toContain('sourceAbsent');
    expect(categoryIds).toContain('framing');
    expect(categoryIds).toContain('strength');
  });

  it('has French labels and short codes for all categories', () => {
    const sophisme = CATEGORY_DEFINITIONS.find(c => c.id === 'sophisme');
    expect(sophisme?.frenchLabel).toBe('Sophisme');
    expect(sophisme?.shortCode).toBe('SOPH');
    expect(sophisme?.colorKey).toBe('sophisme');

    const unsupported = CATEGORY_DEFINITIONS.find(c => c.id === 'unsupported');
    expect(unsupported?.frenchLabel).toBe('Affirmation non étayée');
    expect(unsupported?.shortCode).toBe('NON-ÉT');
  });
});
