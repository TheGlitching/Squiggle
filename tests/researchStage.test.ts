import { describe, expect, it } from 'vitest';
import { BaseLLMClient, GroundedAnswer, SearchResult } from '../src/client/base';
import { AnalysisInput, FactualClaim } from '../src/engine/types';
import { buildFourchesCaudinesUserPrompt, ResearchEvidenceForPrompt } from '../src/engine/prompts';
import { CitedSource, researchClaims } from '../src/engine/research';
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

describe('researchClaims', () => {
  it('extracts claims capped at maxClaims and marks research unperformed with all-unverified claims when the client cannot search', async () => {
    const extraction = JSON.stringify({
      claims: [
        { blockId: 'b1', quote: 'a', claim: 'claim 1' },
        { blockId: 'b1', quote: 'b', claim: 'claim 2' },
        { blockId: 'b1', quote: 'c', claim: 'claim 3' },
        { blockId: 'b1', quote: 'd', claim: 'claim 4' },
        { blockId: 'b1', quote: 'e', claim: 'claim 5' }
      ]
    });
    const client = new StubClient({ completions: [extraction], canSearch: false });

    const result = await researchClaims({
      client,
      input: sampleInput,
      citedSources: [],
      maxClaims: 2
    });

    expect(result.claims).toHaveLength(2);
    expect(result.research.performed).toBe(false);
    expect(result.research.skippedReason).toMatch(/recherche web/i);
    expect(result.research.queries).toEqual([]);
    for (const claim of result.claims) {
      expect(claim.verification).toBe('unverified');
      expect(claim.sources).toEqual([]);
    }
  });

  it.each(['confirmed', 'contradicted'] as const)('forces a %s verdict with no sources down to unverified', async (verdict) => {
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: '200 salariés licenciés en 2023' }] });
    const judgement = JSON.stringify({ verification: verdict, sources: [], rationale: 'Ça semble correct.' });

    const client = new StubClient({
      completions: [extraction, judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Un article', url: 'https://news.example/a', snippet: 'contenu' }]
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/rejeté/i);
  });

  it('keeps a confirmed verdict with its sources when backed by search results, and records the query', async () => {
    const claimText = '200 salariés licenciés en 2023';
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: claimText }] });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }],
      rationale: 'Corroboré par un communiqué officiel.'
    });

    const client = new StubClient({
      completions: [extraction, judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', snippet: '200 postes supprimés' }]
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('confirmed');
    expect(result.claims[0].sources).toEqual([
      { title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }
    ]);
    expect(result.research.performed).toBe(true);
    expect(result.research.queries).toEqual([claimText]);
  });

  it('degrades only the claim whose web search throws, leaving the run and its other claims intact, and still records every query', async () => {
    const extraction = JSON.stringify({
      claims: [
        { blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim A' },
        { blockId: 'b1', quote: 'autre extrait', claim: 'claim B' }
      ]
    });
    const judgementForB = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Source B', url: 'https://news.example/b', origin: 'search' }],
      rationale: 'ok'
    });

    const client = new StubClient({
      completions: [extraction, judgementForB],
      canSearch: true,
      searchImpl: async (query: string) => {
        if (query === 'claim A') throw new Error('network down');
        return [{ title: 'Source B', url: 'https://news.example/b', snippet: 'preuve' }];
      }
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims).toHaveLength(2);
    const [claimA, claimB] = result.claims;
    expect(claimA.verification).toBe('unverified');
    expect(claimA.sources).toEqual([]);
    expect(claimA.rationale).toMatch(/network down/);
    expect(claimB.verification).toBe('confirmed');
    expect(claimB.sources).toHaveLength(1);
    expect(result.research.queries).toEqual(['claim A', 'claim B']);
  });

  it('propagates an aborted search instead of silently degrading the claim to unverified', async () => {
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim A' }] });
    const controller = new AbortController();

    const client = new StubClient({
      completions: [extraction],
      canSearch: true,
      searchImpl: async () => {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
    });

    await expect(
      researchClaims({ client, input: sampleInput, citedSources: [], abortSignal: controller.signal })
    ).rejects.toThrow(/aborted/i);
  });

  it('runs exactly one grounded call and keeps a confirmed verdict backed by the provider citations, even with empty snippets', async () => {
    const claimText = '200 salariés licenciés en 2023';
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: claimText }] });
    const judgement = JSON.stringify({ verification: 'confirmed', sources: [], rationale: 'Confirmé par la page consultée.' });

    const client = new StubClient({
      completions: [extraction],
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

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(client.groundedCalls).toHaveLength(1);
    expect(client.completeCalls).toHaveLength(1);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('confirmed');
    expect(result.claims[0].sources).toEqual([{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }]);
    expect(result.research.performed).toBe(true);
    expect(result.research.provider).toBe('anthropic');
    expect(result.research.queries).toEqual([claimText]);
  });

  it('refuses a grounded verdict whose urls the model named but the provider never retrieved', async () => {
    const extraction = JSON.stringify({
      claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim from memory' }]
    });
    // The model declined to search and answered from memory, naming a plausible
    // url. Nothing was read, so nothing was verified.
    const judgement = JSON.stringify({
      verification: 'contradicted',
      sources: [{ title: 'Insee', url: 'https://www.insee.fr/statistiques/plan-social', origin: 'search' }],
      rationale: 'Le chiffre est démenti.'
    });

    const client = new StubClient({
      completions: [extraction],
      canGround: true,
      groundedImpl: async () => ({ content: judgement, citations: [] })
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/aucune source n'a été consultée/);
  });

  it('credits only the retrieved urls when the model names more sources than were fetched', async () => {
    const extraction = JSON.stringify({
      claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'partially fetched' }]
    });
    const judgement = JSON.stringify({
      verification: 'contradicted',
      sources: [
        { title: 'Page lue', url: 'https://news.example/lu', quote: 'Le plan portait sur 120 postes.', origin: 'search' },
        { title: 'Jamais récupérée', url: 'https://www.insee.fr/inventee', origin: 'search' }
      ],
      rationale: 'Le chiffre est démenti.'
    });

    const client = new StubClient({
      completions: [extraction],
      canGround: true,
      groundedImpl: async () => ({
        content: judgement,
        citations: [{ title: 'Page lue', url: 'https://news.example/lu', snippet: '' }]
      })
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims[0].verification).toBe('contradicted');
    expect(result.claims[0].sources.map((s) => s.url)).toEqual(['https://news.example/lu']);
    // The quote the model gave for the url it really read is kept.
    expect(result.claims[0].sources[0].quote).toBe('Le plan portait sur 120 postes.');
  });

  it('forces a grounded confirmed/contradicted verdict with zero sources down to unverified', async () => {
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim zero sources' }] });
    const judgement = JSON.stringify({ verification: 'contradicted', sources: [], rationale: 'Ça semble faux.' });

    const client = new StubClient({
      completions: [extraction],
      canGround: true,
      groundedImpl: async () => ({ content: judgement, citations: [] })
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/rejeté/i);
  });

  it('propagates an aborted grounded call instead of silently degrading the claim to unverified', async () => {
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim abort' }] });
    const controller = new AbortController();

    const client = new StubClient({
      completions: [extraction],
      canGround: true,
      groundedImpl: async () => {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
    });

    await expect(
      researchClaims({ client, input: sampleInput, citedSources: [], abortSignal: controller.signal })
    ).rejects.toThrow(/aborted/i);
  });

  it('yields unverified when every search result has a blank snippet, no matter what verdict the judge returned - the regression this stage exists to close', async () => {
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim blank snippets' }] });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Un article', url: 'https://news.example/blank', origin: 'search' }],
      rationale: "Ça a l'air vrai."
    });

    const client = new StubClient({
      completions: [extraction, judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Un article', url: 'https://news.example/blank', snippet: '' }]
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/texte source lisible/i);
  });

  it('never hands the ungrounded judge a blank-snippet search result, while a real-snippet result still reaches it', async () => {
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim filter' }] });
    const judgement = JSON.stringify({ verification: 'unverified', sources: [], rationale: 'rien à signaler' });

    const client = new StubClient({
      completions: [extraction, judgement],
      canSearch: true,
      searchImpl: async () => [
        { title: 'Résultat sans texte', url: 'https://news.example/empty', snippet: '' },
        { title: 'Résultat avec texte', url: 'https://news.example/real', snippet: 'preuve concrète' }
      ]
    });

    await researchClaims({ client, input: sampleInput, citedSources: [] });

    const judgePrompt = client.completeCalls[1].messages[0].content;
    expect(judgePrompt).not.toContain('https://news.example/empty');
    expect(judgePrompt).toContain('https://news.example/real');
  });

  it('reaches a confirmed verdict on the ungrounded route when the search results carry real snippets', async () => {
    const claimText = 'claim with real snippet';
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: claimText }] });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }],
      rationale: 'Corroboré.'
    });

    const client = new StubClient({
      completions: [extraction, judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', snippet: '200 postes supprimés' }]
    });

    const result = await researchClaims({ client, input: sampleInput, citedSources: [] });

    expect(result.claims[0].verification).toBe('confirmed');
    expect(result.claims[0].sources).toEqual([{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }]);
  });

  it('forces unverified when a search-route judge names only the article\'s own cited source, with every search result blank - anchor text is not read page content', async () => {
    const extraction = JSON.stringify({ claims: [{ blockId: 'b1', quote: "L'usine a licencié 200 salariés en 2023.", claim: 'claim article-only' }] });
    const judgement = JSON.stringify({
      verification: 'confirmed',
      sources: [{ title: 'cette étude', url: 'https://src.example/p', origin: 'article' }],
      rationale: "Confirmé par la source de l'article."
    });

    const client = new StubClient({
      completions: [extraction, judgement],
      canSearch: true,
      searchImpl: async () => [{ title: 'x', url: 'https://n.example/a', snippet: '' }]
    });

    const result = await researchClaims({
      client,
      input: sampleInput,
      citedSources: [{ href: 'https://src.example/p', domain: 'src.example', text: 'cette étude', blockId: 'b1' }]
    });

    expect(result.claims[0].verification).toBe('unverified');
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].rationale).toMatch(/texte source lisible/i);
  });
});

describe('buildFourchesCaudinesUserPrompt evidence rendering', () => {
  const sampleClaim: FactualClaim = {
    id: 'c1',
    blockId: 'b1',
    quote: "L'usine a licencié 200 salariés en 2023.",
    claim: '200 salariés licenciés en 2023',
    verification: 'confirmed',
    sources: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }]
  };
  const citedSource: CitedSource = { href: 'https://source.example/rapport', domain: 'source.example', text: 'selon le rapport annuel', blockId: 'b1' };

  it('renders the cited-sources and factual-verification sections into the audit prompt when evidence is supplied', () => {
    const evidence: ResearchEvidenceForPrompt = { citedSources: [citedSource], claims: [sampleClaim] };
    const prompt = buildFourchesCaudinesUserPrompt(sampleInput, evidence);

    expect(prompt).toContain("SOURCES CITÉES PAR L'ARTICLE");
    expect(prompt).toContain('https://source.example/rapport');
    expect(prompt).toContain('source.example');
    expect(prompt).toContain('VÉRIFICATIONS FACTUELLES');
    expect(prompt).toContain('200 salariés licenciés en 2023');
    expect(prompt).toContain('confirmed');
    expect(prompt).toContain('https://news.example/plan-social');
  });

  it('omits both evidence sections cleanly when no evidence is supplied', () => {
    const prompt = buildFourchesCaudinesUserPrompt(sampleInput);

    expect(prompt).not.toContain("SOURCES CITÉES PAR L'ARTICLE");
    expect(prompt).not.toContain('VÉRIFICATIONS FACTUELLES');
  });
});
