import { describe, expect, it } from 'vitest';
import { BaseLLMClient, GroundedAnswer, SearchResult } from '../src/client/base';
import { AnalysisInput, Finding } from '../src/engine/types';
import {
  buildClaimGroundedJudgementUserPrompt,
  buildClaimJudgementUserPrompt,
  buildFourchesCaudinesUserPrompt
} from '../src/engine/prompts';
import { CitedSource, researchFindings } from '../src/engine/research';
import type { CompletionOptions, CompletionResponse, StreamCallbacks } from '../src/types/byok';

/**
 * Minimal BaseLLMClient double: a fixed queue of `complete` responses (one
 * per expected call, in order) plus an injectable `webSearch` so each test
 * controls exactly what the research stage sees, with no network involved.
 */
class StubClient extends BaseLLMClient {
  private readonly completionQueue: string[];
  private readonly canSearch: boolean;
  private readonly canGround: boolean;
  private readonly searchImpl: (query: string) => Promise<SearchResult[]>;
  private readonly groundedImpl: (options: CompletionOptions & { maxSearches?: number }) => Promise<GroundedAnswer>;
  readonly completeCalls: CompletionOptions[] = [];
  readonly groundedCalls: (CompletionOptions & { maxSearches?: number })[] = [];

  constructor(opts: {
    completions: string[];
    canSearch?: boolean;
    canGround?: boolean;
    searchImpl?: (query: string) => Promise<SearchResult[]>;
    groundedImpl?: (options: CompletionOptions & { maxSearches?: number }) => Promise<GroundedAnswer>;
  }) {
    super({ provider: 'anthropic', apiKey: 'test-key', model: 'stub-model' });
    this.completionQueue = [...opts.completions];
    this.canSearch = opts.canSearch ?? false;
    this.canGround = opts.canGround ?? false;
    this.searchImpl = opts.searchImpl ?? (async () => []);
    this.groundedImpl =
      opts.groundedImpl ??
      (async () => {
        throw new Error('StubClient: groundedAnswer() was not configured');
      });
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    this.completeCalls.push(options);
    const content = this.completionQueue.shift();
    if (content === undefined) {
      throw new Error('StubClient: no more queued completions');
    }
    return { content, model: this.getModel(), provider: this.getProvider() };
  }

  async stream(_options: CompletionOptions, _callbacks: StreamCallbacks): Promise<CompletionResponse> {
    throw new Error('StubClient: stream() is not used by the research stage');
  }

  override supportsWebSearch(): boolean {
    return this.canSearch;
  }

  override async webSearch(query: string): Promise<SearchResult[]> {
    return this.searchImpl(query);
  }

  override supportsGroundedAnswer(): boolean {
    return this.canGround;
  }

  override async groundedAnswer(options: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    this.groundedCalls.push(options);
    return this.groundedImpl(options);
  }
}

const sampleInput: AnalysisInput = {
  url: 'https://example.com/article-1',
  title: 'Une usine ferme dans le Nord',
  outlet: 'example.com',
  language: 'fr',
  blocks: [
    { id: 'b1', type: 'paragraph', text: "L'usine a licencié 200 salariés en 2023.", charStart: 0 },
    { id: 'b2', type: 'paragraph', text: 'Ce choix est profondément regrettable.', charStart: 60 }
  ]
};

function makeFinding(overrides: Partial<Finding> & Pick<Finding, 'category'>): Finding {
  return {
    id: `f_${Math.random().toString(36).slice(2, 9)}`,
    blockId: 'b1',
    quote: "L'usine a licencié 200 salariés en 2023.",
    severity: 2,
    label: 'Chiffre non sourcé',
    explanation: 'Aucune source ne vient étayer ce chiffre.',
    confidence: 0.9,
    ...overrides
  };
}

describe('researchFindings', () => {
  it('researches only the factual findings among the audit\'s findings, and marks research unperformed with all-unverified claims when the client cannot search', async () => {
    const findings = [
      makeFinding({ category: 'source-absente', quote: 'a' }),
      makeFinding({ category: 'affirmation-non-etayee', quote: 'b' }),
      makeFinding({ category: 'surinterpretation', quote: 'c' }),
      // Editorial categories are never researched, even when present.
      makeFinding({ category: 'sophisme', quote: 'd' }),
      makeFinding({ category: 'cadrage', quote: 'e' }),
      makeFinding({ category: 'point-fort', quote: 'f' })
    ];
    const client = new StubClient({ completions: [], canSearch: false });

    const result = await researchFindings({ client, input: sampleInput, findings, citedSources: [] });

    expect(result.claims).toHaveLength(3);
    expect(result.research.performed).toBe(false);
    expect(result.research.skippedReason).toMatch(/recherche web/i);
    expect(result.research.queries).toEqual([]);
    expect(result.research.withdrawn).toEqual([]);
    for (const claim of result.claims) {
      expect(claim.verification).toBe('unverified');
      expect(claim.sources).toEqual([]);
    }
  });

  it('returns no claims and records why when the audit raised no factual findings', async () => {
    const findings = [makeFinding({ category: 'sophisme' })];
    const client = new StubClient({ completions: [], canSearch: true });

    const result = await researchFindings({ client, input: sampleInput, findings, citedSources: [] });

    expect(result.claims).toEqual([]);
    expect(result.research.performed).toBe(false);
    expect(result.research.skippedReason).toMatch(/aucun constat factuel/i);
  });

  it.each(['confirmed', 'contradicted'] as const)('forces a %s verdict with no sources down to unverified', async (verdict) => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const judgement = JSON.stringify({ verification: verdict, sources: [], rationale: 'Ça semble correct.' });

    const client = new StubClient({
      completions: [judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Un article', url: 'https://news.example/a', snippet: 'contenu' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/rejeté/i);
    expect(result.claims[0].findingId).toBe(finding.id);
  });

  it('keeps a confirmed verdict with its sources when backed by search results, and records the finding\'s quote as the query', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }],
      rationale: 'Corroboré par un communiqué officiel.'
    });

    const client = new StubClient({
      completions: [judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', snippet: '200 postes supprimés' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('confirmed');
    expect(result.claims[0].sources).toEqual([
      { title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }
    ]);
    expect(result.research.performed).toBe(true);
    expect(result.research.queries).toEqual([finding.quote]);
  });

  it('degrades only the finding whose web search throws, leaving the run and its other findings intact, and still records every query', async () => {
    const findingA = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const findingB = makeFinding({ category: 'source-absente', quote: 'autre extrait' });
    const judgementForB = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Source B', url: 'https://news.example/b', origin: 'search' }],
      rationale: 'ok'
    });

    const client = new StubClient({
      completions: [judgementForB],
      canSearch: true,
      searchImpl: async (query: string) => {
        if (query === findingA.quote) throw new Error('network down');
        return [{ title: 'Source B', url: 'https://news.example/b', snippet: 'preuve' }];
      }
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [findingA, findingB], citedSources: [] });

    expect(result.claims).toHaveLength(2);
    const [claimA, claimB] = result.claims;
    expect(claimA.verification).toBe('unverified');
    expect(claimA.sources).toEqual([]);
    expect(claimA.rationale).toMatch(/network down/);
    expect(claimB.verification).toBe('confirmed');
    expect(claimB.sources).toHaveLength(1);
    expect(result.research.queries).toEqual([findingA.quote, findingB.quote]);
  });

  it('propagates an aborted search instead of silently degrading the finding to unverified', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const controller = new AbortController();

    const client = new StubClient({
      completions: [],
      canSearch: true,
      searchImpl: async () => {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
    });

    await expect(
      researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [], abortSignal: controller.signal })
    ).rejects.toThrow(/aborted/i);
  });

  it('runs exactly one grounded call and keeps a confirmed verdict backed by the provider citations, even with empty snippets', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const judgement = JSON.stringify({ verification: 'confirmed', sources: [], rationale: 'Confirmé par la page consultée.' });

    const client = new StubClient({
      completions: [],
      canSearch: true,
      canGround: true,
      searchImpl: async () => {
        throw new Error('StubClient: webSearch() must not be called when groundedAnswer() is available');
      },
      groundedImpl: async () => ({
        content: judgement,
        citations: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', snippet: '' }]
      })
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(client.groundedCalls).toHaveLength(1);
    expect(client.completeCalls).toHaveLength(0);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('confirmed');
    expect(result.claims[0].sources).toEqual([{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }]);
    expect(result.research.performed).toBe(true);
    expect(result.research.provider).toBe('anthropic');
    expect(result.research.queries).toEqual([finding.quote]);
  });

  it('refuses a grounded verdict whose urls the model named but the provider never retrieved', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    // The model declined to search and answered from memory, naming a plausible
    // url. Nothing was read, so nothing was verified.
    const judgement = JSON.stringify({
      verification: 'contradicted',
      sources: [{ title: 'Insee', url: 'https://www.insee.fr/statistiques/plan-social', origin: 'search' }],
      rationale: 'Le chiffre est démenti.'
    });

    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({ content: judgement, citations: [] })
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/aucune source n'a été consultée/);
  });

  it('credits only the retrieved urls when the model names more sources than were fetched', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const judgement = JSON.stringify({
      verification: 'contradicted',
      sources: [
        { title: 'Page lue', url: 'https://news.example/lu', quote: 'Le plan portait sur 120 postes.', origin: 'search' },
        { title: 'Jamais récupérée', url: 'https://www.insee.fr/inventee', origin: 'search' }
      ],
      rationale: 'Le chiffre est démenti.'
    });

    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({
        content: judgement,
        citations: [{ title: 'Page lue', url: 'https://news.example/lu', snippet: '' }]
      })
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims[0].verification).toBe('contradicted');
    expect(result.claims[0].sources.map((s) => s.url)).toEqual(['https://news.example/lu']);
    // The quote the model gave for the url it really read is kept.
    expect(result.claims[0].sources[0].quote).toBe('Le plan portait sur 120 postes.');
  });

  it('forces a grounded confirmed/contradicted verdict with zero sources down to unverified', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const judgement = JSON.stringify({ verification: 'contradicted', sources: [], rationale: 'Ça semble faux.' });

    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({ content: judgement, citations: [] })
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/rejeté/i);
  });

  it('propagates an aborted grounded call instead of silently degrading the finding to unverified', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const controller = new AbortController();

    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
    });

    await expect(
      researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [], abortSignal: controller.signal })
    ).rejects.toThrow(/aborted/i);
  });

  it('yields unverified when every search result has a blank snippet, no matter what verdict the judge returned - the regression this stage exists to close', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Un article', url: 'https://news.example/blank', origin: 'search' }],
      rationale: "Ça a l'air vrai."
    });

    const client = new StubClient({
      completions: [judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Un article', url: 'https://news.example/blank', snippet: '' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/texte source lisible/i);
  });

  it('never hands the ungrounded judge a blank-snippet search result, while a real-snippet result still reaches it', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const judgement = JSON.stringify({ verification: 'unverified', sources: [], rationale: 'rien à signaler' });

    const client = new StubClient({
      completions: [judgement],
      canSearch: true,
      searchImpl: async () => [
        { title: 'Résultat sans texte', url: 'https://news.example/empty', snippet: '' },
        { title: 'Résultat avec texte', url: 'https://news.example/real', snippet: 'preuve concrète' }
      ]
    });

    await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    const judgePrompt = client.completeCalls[0].messages[0].content;
    expect(judgePrompt).not.toContain('https://news.example/empty');
    expect(judgePrompt).toContain('https://news.example/real');
  });

  it('reaches a confirmed verdict on the ungrounded route when the search results carry real snippets', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }],
      rationale: 'Corroboré.'
    });

    const client = new StubClient({
      completions: [judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', snippet: '200 postes supprimés' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims[0].verification).toBe('confirmed');
    expect(result.claims[0].sources).toEqual([{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }]);
  });

  it('forces unverified when a search-route judge names only the article\'s own cited source, with every search result blank - anchor text is not read page content', async () => {
    const finding = makeFinding({ category: 'source-absente' });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'cette étude', url: 'https://src.example/p', origin: 'article' }],
      rationale: "Confirmé par la source de l'article."
    });

    const client = new StubClient({
      completions: [judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'x', url: 'https://n.example/a', snippet: '' }]
    });

    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [{ href: 'https://src.example/p', domain: 'src.example', text: 'cette étude', blockId: 'b1' }]
    });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/texte source lisible/i);
  });
});

const pinnedNow = new Date('2026-08-19T10:00:00Z');

describe('buildFourchesCaudinesUserPrompt', () => {
  const citedSource: CitedSource = { href: 'https://source.example/rapport', domain: 'source.example', text: 'selon le rapport annuel', blockId: 'b1' };

  it('renders the cited-sources section when the article cites one', () => {
    const prompt = buildFourchesCaudinesUserPrompt(sampleInput, { citedSources: [citedSource], now: pinnedNow });

    expect(prompt).toContain("SOURCES CITÉES PAR L'ARTICLE");
    expect(prompt).toContain('https://source.example/rapport');
    expect(prompt).toContain('source.example');
  });

  it('omits the cited-sources section cleanly when the article cites nothing', () => {
    const prompt = buildFourchesCaudinesUserPrompt(sampleInput, { now: pinnedNow });

    expect(prompt).not.toContain("SOURCES CITÉES PAR L'ARTICLE");
  });

  it('carries the pinned date and the near-future-is-not-an-error rule', () => {
    const prompt = buildFourchesCaudinesUserPrompt(sampleInput, { now: pinnedNow });

    expect(prompt).toContain('CONTEXTE TEMPOREL');
    expect(prompt).toContain('2026-08-19');
    expect(prompt).toContain("n'est PAS en soi une erreur");
  });
});

describe('temporal context in the claim-judgement prompts', () => {
  const claim = { quote: "L'usine a licencié 200 salariés en 2023.", claim: "L'usine a licencié 200 salariés en 2023." };

  it('carries the pinned date and the near-future-is-not-an-error rule in the search-route judgement prompt', () => {
    const prompt = buildClaimJudgementUserPrompt(claim, [], [], pinnedNow);

    expect(prompt).toContain('CONTEXTE TEMPOREL');
    expect(prompt).toContain('2026-08-19');
    expect(prompt).toContain("n'est PAS en soi une erreur");
  });

  it('carries the pinned date and the near-future-is-not-an-error rule in the grounded judgement prompt', () => {
    const prompt = buildClaimGroundedJudgementUserPrompt(claim, [], pinnedNow);

    expect(prompt).toContain('CONTEXTE TEMPOREL');
    expect(prompt).toContain('2026-08-19');
    expect(prompt).toContain("n'est PAS en soi une erreur");
  });
});
