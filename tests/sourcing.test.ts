/**
 * The sources an article invokes, by nature: asked of the audit in the same
 * call, then held to what the text really says. The articles are invented.
 */
import { describe, expect, it } from 'vitest';
import {
  AnalysisInput,
  buildFourchesCaudinesUserPrompt,
  MAX_SOURCING_ENTRIES,
  parseAndValidateLlmOutput,
  parseSourcing,
} from '@squiggle/shared';

const ARTICLE: AnalysisInput = {
  url: 'https://presse.example/societe/cantines',
  title: 'Les cantines de Valbourg passent au bio',
  language: 'fr',
  blocks: [
    {
      id: 'b1',
      type: 'paragraph',
      text: 'Selon l’Insee, 42 % des repas servis à Valbourg sont désormais bio, d’après une étude de l’université de Valbourg.',
      charStart: 0,
    },
    {
      id: 'b2',
      type: 'paragraph',
      text: 'Un proche du dossier affirme que la mairie prépare une hausse des tarifs. Le Courrier de Valbourg évoque 15 %.',
      charStart: 120,
    },
    {
      id: 'b3',
      type: 'paragraph',
      text: 'La fréquentation a doublé en un an.',
      charStart: 240,
    },
  ],
};

const audit = (sourcing: unknown) =>
  JSON.stringify({
    summary: 'Un article qui appuie ses chiffres sur des sources de natures diverses.',
    scores: [{ domain: 'robustesse_factuelle', score: 25, strengths: [], weaknesses: [] }],
    findings: [],
    sourcing,
  });

describe('the audit prompt', () => {
  it('asks for the sources by nature, as the text presents them, and never for their reliability', () => {
    const prompt = buildFourchesCaudinesUserPrompt(ARTICLE);
    expect(prompt).toContain('SOURCES SUR LESQUELLES S\'APPUIE LE TEXTE ("sourcing")');
    expect(prompt).toContain('C\'est la source que CITE LE TEXTE');
    expect(prompt).toContain('JAMAIS sa fiabilité');
    expect(prompt).toContain('"nature": "statistique-publique"');
  });

  it('asks it of a short message too', () => {
    const message = buildFourchesCaudinesUserPrompt({
      ...ARTICLE,
      title: '',
      blocks: [{ id: 'b1', type: 'paragraph', text: 'URGENT : un ami gendarme dit que les radars changent lundi.', charStart: 0 }],
    });
    expect(message).toContain('Analyse le message court');
    expect(message).toContain('"sourcing"');
  });
});

describe('parseSourcing', () => {
  it('keeps each source the text names, in reading order, with the text’s own characters', () => {
    const report = parseAndValidateLlmOutput(
      audit([
        { blockId: 'b2', quote: 'Le Courrier de Valbourg', nature: 'media' },
        // Retyped with a straight apostrophe: still the article's words.
        { blockId: 'b1', quote: "Selon l'Insee", nature: 'statistique-publique' },
        { blockId: 'b1', quote: 'une étude de l’université de Valbourg', nature: 'etude' },
        { blockId: 'b2', quote: 'Un proche du dossier', nature: 'temoignage-anonyme' },
        { blockId: 'b3', quote: 'La fréquentation a doublé en un an', nature: 'aucune' },
      ]),
      ARTICLE,
    );
    expect(report.sourcing?.map((e) => [e.nature, e.quote])).toEqual([
      ['statistique-publique', 'Selon l’Insee'],
      ['etude', 'une étude de l’université de Valbourg'],
      ['temoignage-anonyme', 'Un proche du dossier'],
      ['media', 'Le Courrier de Valbourg'],
      ['aucune', 'La fréquentation a doublé en un an'],
    ]);
    expect(report.sourcing?.[0]).toMatchObject({ blockId: 'b1', charStart: 0, charEnd: 13 });
  });

  it('drops what the text does not say, what is not a nature, and a second reading of the same words', () => {
    const entries = parseSourcing(
      [
        { blockId: 'b1', quote: 'selon le ministère de l’Éducation', nature: 'institution' },
        { blockId: 'b1', quote: 'Selon l’Insee', nature: 'note-de-fiabilite' },
        { blockId: 'b1', quote: 'Selon l’Insee', nature: 'statistique-publique' },
        { blockId: 'b1', quote: 'Selon l’Insee', nature: 'institution' },
        { blockId: 'b1', quote: '', nature: 'aucune' },
        'Selon l’Insee',
        null,
      ],
      ARTICLE.blocks,
    );
    expect(entries.map((e) => e.nature)).toEqual(['statistique-publique']);
  });

  it('holds the list to its ceiling', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `b${i}`,
      type: 'paragraph' as const,
      text: `Selon l’agence numéro ${i}, tout va bien.`,
      charStart: i * 100,
    }));
    const entries = parseSourcing(
      many.map((b) => ({ blockId: b.id, quote: b.text.split(',')[0], nature: 'institution' })),
      many,
    );
    expect(entries).toHaveLength(MAX_SOURCING_ENTRIES);
    expect(entries[0].blockId).toBe('b0');
  });

  it('survives an audit whose other parts fail validation, and an audit that has no list', () => {
    const broken = JSON.stringify({
      summary: 'Résumé.',
      scores: [{ domain: 'robustesse_factuelle', score: 25 }],
      findings: [{ blockId: 'b1', quote: '' }],
      claims: 'pas une liste',
      sourcing: [{ blockId: 'b2', quote: 'Un proche du dossier', nature: 'temoignage-anonyme' }],
    });
    expect(parseAndValidateLlmOutput(broken, ARTICLE).sourcing?.map((e) => e.nature)).toEqual(['temoignage-anonyme']);
    expect(parseAndValidateLlmOutput(audit(undefined), ARTICLE).sourcing).toEqual([]);
  });
});
