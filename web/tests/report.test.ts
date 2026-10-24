/**
 * Where each finding's passage is in the pasted text, and the names the report
 * gives it. A passage that is not found is a finding the reader cannot place;
 * a name that drifts from the extension's is the same finding called two
 * things depending on where it was read.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Finding, TextBlock } from '../../shared/src/engine/types';
import { CATEGORY_LABELS, locateFindings, SEVERITY_LABELS } from '../src/report';

const BLOCKS: TextBlock[] = [
  { id: 'b1', type: 'heading', text: 'Cantines : le menu fait fuir les élèves', charStart: 0 },
  { id: 'b2', type: 'paragraph', text: 'Selon un expert, la fréquentation aurait chuté de 30 %. Les parents l’ont remarqué.', charStart: 41 },
  { id: 'b3', type: 'paragraph', text: 'La mairie promet un bilan « avant l’été ».', charStart: 128 },
];

function finding(id: string, overrides: Partial<Finding>): Finding {
  return {
    id,
    blockId: 'b2',
    quote: '',
    category: 'cadrage',
    severity: 2,
    label: id,
    explanation: 'x',
    confidence: 0.9,
    ...overrides,
  };
}

function marked(located: ReturnType<typeof locateFindings>, blockId: string) {
  return (located.segments.get(blockId) ?? []).filter((s) => s.findings.length > 0).map((s) => [s.text, s.findings.map((f) => f.id)]);
}

describe('locateFindings', () => {
  it('uses the engine’s offset when it matches the quote', () => {
    const quote = 'la fréquentation aurait chuté de 30 %';
    const start = 41 + BLOCKS[1].text.indexOf(quote);
    const result = locateFindings(BLOCKS, [finding('f1', { quote, charStart: start, charEnd: start + quote.length })]);
    expect(marked(result, 'b2')).toEqual([[quote, ['f1']]]);
    expect(result.located.has('f1')).toBe(true);
  });

  it('finds a quote whose typography a copy-paste changed', () => {
    const result = locateFindings(BLOCKS, [
      finding('f1', { quote: "Les parents  l'ont remarqué." }),
      finding('f2', { blockId: 'b3', quote: 'un bilan "avant l’été"' }),
    ]);
    expect(marked(result, 'b2')).toEqual([['Les parents l’ont remarqué.', ['f1']]]);
    expect(marked(result, 'b3')).toEqual([['un bilan « avant l’été »', ['f2']]]);
  });

  it('looks in the other blocks when the engine named the wrong one', () => {
    const result = locateFindings(BLOCKS, [finding('f1', { blockId: 'b3', quote: 'le menu fait fuir les élèves' })]);
    expect(marked(result, 'b1')).toEqual([['le menu fait fuir les élèves', ['f1']]]);
  });

  it('shares an overlap between two findings, in the graver tone, and anchors each where it starts', () => {
    const result = locateFindings(BLOCKS, [
      finding('mild', { severity: 1, quote: 'Selon un expert, la fréquentation' }),
      finding('grave', { severity: 3, verification: 'douteuse', quote: 'la fréquentation aurait chuté de 30 %' }),
    ]);
    expect(marked(result, 'b2')).toEqual([
      ['Selon un expert, ', ['mild']],
      ['la fréquentation', ['grave', 'mild']],
      [' aurait chuté de 30 %', ['grave']],
    ]);
    const starts = (result.segments.get('b2') ?? []).flatMap((s) => s.starts.map((f) => [s.text, f.id]));
    expect(starts).toEqual([
      ['Selon un expert, ', 'mild'],
      ['la fréquentation', 'grave'],
    ]);
  });

  it('reports a quote that is nowhere in the text as not located, and keeps every word of the text', () => {
    const result = locateFindings(BLOCKS, [finding('f1', { quote: 'Une phrase que le texte ne contient pas.' })]);
    expect(result.located.has('f1')).toBe(false);
    for (const block of BLOCKS) {
      expect((result.segments.get(block.id) ?? []).map((s) => s.text).join('')).toBe(block.text);
    }
  });
});

describe('the names the report uses', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');

  it('are the extension’s category labels', () => {
    const source = read('src/adapters/findingAdapters.ts');
    const block = source.slice(source.indexOf('CATEGORY_LABELS_FR'), source.indexOf('};', source.indexOf('CATEGORY_LABELS_FR')));
    for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
      expect(block).toMatch(new RegExp(`'?${category}'?: '${label}'`));
    }
  });

  it('are the extension’s severity labels', () => {
    const source = read('src/ui/components/SeverityBadge.tsx');
    for (const [level, label] of Object.entries(SEVERITY_LABELS)) {
      expect(source).toMatch(new RegExp(`case ${level}:[\\s\\S]*?return '${label}'`));
    }
  });
});
