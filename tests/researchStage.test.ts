import { describe, expect, it } from 'vitest';
import { BaseLLMClient, GroundedAnswer, SearchResult } from '@squiggle/shared';
import { AnalysisInput, Finding } from '@squiggle/shared';
import {
  buildClaimGroundedJudgementUserPrompt,
  buildFourchesCaudinesUserPrompt,
  buildResearchAgentStepPrompt,
  FOURCHES_CAUDINES_CLAIM_GROUNDED_JUDGEMENT_SYSTEM_PROMPT,
  RESEARCH_AGENT_SYSTEM_PROMPT
} from '@squiggle/shared';
import { CitedSource, parseAndValidateLlmOutput, reconcileResearchedFindings, researchFindings } from '@squiggle/shared';
import type { CompletionOptions, CompletionResponse, StreamCallbacks } from '@squiggle/shared';

/**
 * Minimal BaseLLMClient double for the agentic search route: `complete` serves
 * a scripted queue of agent-action JSON (one per expected agent step, in
 * order) and records every call plus every issued web search; `webSearch` is
 * injectable so each test controls exactly what the research stage sees, with
 * no network involved. `fetchImpl` is forwarded to `researchFindings` so a
 * test (and its own fetch double) drives `read_source` decisions end to end.
 */
class StubClient extends BaseLLMClient {
  private readonly completionQueue: string[];
  private readonly canSearch: boolean;
  private readonly canGround: boolean;
  private readonly searchImpl: (query: string) => Promise<SearchResult[]>;
  private readonly groundedImpl: (options: CompletionOptions & { maxSearches?: number }) => Promise<GroundedAnswer>;
  readonly completeCalls: CompletionOptions[] = [];
  readonly probeCalls: CompletionOptions[] = [];
  readonly groundedCalls: (CompletionOptions & { maxSearches?: number })[] = [];
  readonly searches: { query: string; maxResults?: number }[] = [];

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

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    this.searches.push({ query, maxResults: opts?.maxResults });
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
    // The audit restates the fact it doubts; tests that care pass their own.
    checkableClaim: overrides.quote ?? "L'usine a licencié 200 salariés en 2023.",
    ...overrides
  };
}

/**
 * What a reader may see in `rationale`: a sentence about the evidence. Enum
 * values, the word "rejeté" and the engine's reasoning belong in the log, which
 * is why every case below also checks the diagnostic channel.
 */
function expectReaderText(rationale: string | undefined): void {
  expect(rationale).toBeTruthy();
  expect(rationale).not.toMatch(/rejeté|non-verifiable|verifiee|douteuse|Verdict|'|StubClient/);
}

describe('researchFindings', () => {
  it('researches only the externally-researchable factual findings, and marks research unperformed with all-non-verifiable claims when the client cannot search', async () => {
    const findings = [
      // source-absente is factual but never externally researched: it is a
      // sourcing observation about the text, already resolved by
      // enforceEvidenceHonesty, not a truth claim a web search could settle.
      makeFinding({ category: 'source-absente', quote: 'a' }),
      makeFinding({ category: 'affirmation-non-etayee', quote: 'b' }),
      // Editorial categories are never researched, even when present. This
      // includes surinterpretation: an over-reach from the evidence is a
      // cadrage judgment about the prose, not a world claim a web search
      // could adjudicate.
      makeFinding({ category: 'surinterpretation', quote: 'c' }),
      makeFinding({ category: 'sophisme', quote: 'd' }),
      makeFinding({ category: 'cadrage', quote: 'e' }),
      makeFinding({ category: 'point-fort', quote: 'f' })
    ];
    const client = new StubClient({ completions: [], canSearch: false });

    const result = await researchFindings({ client, input: sampleInput, findings, citedSources: [] });

    expect(result.claims).toHaveLength(1);
    expect(result.claims.map((c) => c.quote)).toEqual(['b']);
    expect(result.research.performed).toBe(false);
    expect(result.research.skippedReason).toMatch(/recherche web/i);
    expect(result.research.queries).toEqual([]);
    expect(result.research.withdrawn).toEqual([]);
    for (const claim of result.claims) {
      expect(claim.verification).toBe('non-verifiable');
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

  it.each(['verifiee', 'douteuse'] as const)('forces a %s verdict with no sources down to non-verifiable', async (verdict) => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    // The agent renders a verdict naming no source, so there is nothing it
    // actually read to back it - the honesty invariant must reject it even
    // though the model was confident.
    const client = new StubClient({
      completions: [
        JSON.stringify({ action: 'verdict', verification: verdict, sources: [], rationale: 'Ça semble correct.' })
      ],
      canSearch: true
    });

    const diagnostics: string[] = [];
    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [],
      onDiagnostic: (note) => diagnostics.push(note)
    });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(result.claims[0].sources).toEqual([]);
    expectReaderText(result.claims[0].rationale);
    expect(diagnostics.join('\n')).toContain(`Verdict '${verdict}' rejeté`);
    expect(result.claims[0].findingId).toBe(finding.id);
  });

  it('keeps a verifiee verdict the agent backs with a real-snippet search result it actually issued', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const client = new StubClient({
      completions: [
        JSON.stringify({ action: 'search', query: finding.quote, note: 'cherche une confirmation' }),
        JSON.stringify({
          action: 'verdict',
          verification: 'verifiee',
          sources: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }],
          rationale: 'Corroboré par un communiqué officiel.'
        })
      ],
      canSearch: true,
      searchImpl: async () => [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', snippet: '200 postes supprimés' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].verification).toBe('verifiee');
    expect(result.claims[0].sources).toEqual([
      { title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }
    ]);
    expect(result.research.performed).toBe(true);
    // The query record is the search the agent actually issued.
    expect(result.research.queries).toEqual([finding.quote]);
  });

  it('absorbs a thrown web search on one finding so the run and the other findings stay intact', async () => {
    const findingA = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const findingB = makeFinding({ category: 'affirmation-non-etayee', quote: 'autre extrait' });
    const client = new StubClient({
      completions: [
        JSON.stringify({ action: 'search', query: findingA.quote, note: 'essai' }),
        JSON.stringify({ action: 'verdict', verification: 'non-verifiable', sources: [], rationale: 'recherche indisponible' }),
        JSON.stringify({ action: 'search', query: findingB.quote, note: 'essai' }),
        JSON.stringify({
          action: 'verdict',
          verification: 'verifiee',
          sources: [{ title: 'Source B', url: 'https://news.example/b', origin: 'search' }],
          rationale: 'ok'
        })
      ],
      canSearch: true,
      searchImpl: async (query: string) => {
        if (query === findingA.quote) throw new Error('network down');
        return [{ title: 'Source B', url: 'https://news.example/b', snippet: 'preuve' }];
      }
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [findingA, findingB], citedSources: [] });

    expect(result.claims).toHaveLength(2);
    const [claimA, claimB] = result.claims;
    expect(claimA.verification).toBe('non-verifiable');
    expect(claimB.verification).toBe('verifiee');
    expect(claimB.sources).toHaveLength(1);
    expect(result.research.queries).toContain(findingA.quote);
    expect(result.research.queries).toContain(findingB.quote);
  });

  it('propagates an aborted search instead of silently degrading the finding to non-verifiable', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const controller = new AbortController();

    const client = new StubClient({
      completions: [JSON.stringify({ action: 'search', query: finding.quote, note: 'essai' })],
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

  it('runs exactly one grounded call and keeps a verifiee verdict backed by a provider citation the model names, even with empty snippets', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    // The model names the page with a trailing slash the provider did not
    // report: still the same page, still credited.
    const judgement = JSON.stringify({
      verification: 'verifiee',
      sources: [{ title: 'Communiqué', url: 'https://www.news.example/plan-social/', origin: 'search' }],
      rationale: 'Confirmé par la page consultée.'
    });

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
    expect(result.claims[0].verification).toBe('verifiee');
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
      verification: 'douteuse',
      sources: [{ title: 'Insee', url: 'https://www.insee.fr/statistiques/plan-social', origin: 'search' }],
      rationale: 'Le chiffre est démenti.'
    });

    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({ content: judgement, citations: [] })
    });

    const diagnostics: string[] = [];
    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [],
      onDiagnostic: (note) => diagnostics.push(note)
    });

    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(result.claims[0].sources).toEqual([]);
    expectReaderText(result.claims[0].rationale);
    expect(diagnostics.join('\n')).toMatch(/aucune source n'a été consultée/);
  });

  it('credits only the retrieved urls when the model names more sources than were fetched', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', quote: "L'usine a licencié 200 salariés en 2023." });
    const judgement = JSON.stringify({
      verification: 'douteuse',
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

    expect(result.claims[0].verification).toBe('douteuse');
    expect(result.claims[0].sources.map((s) => s.url)).toEqual(['https://news.example/lu']);
    // The quote the model gave for the url it really read is kept.
    expect(result.claims[0].sources[0].quote).toBe('Le plan portait sur 120 postes.');
  });

  it('forces a grounded verifiee/douteuse verdict with zero sources down to non-verifiable', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const judgement = JSON.stringify({ verification: 'douteuse', sources: [], rationale: 'Ça semble faux.' });

    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({ content: judgement, citations: [] })
    });

    const diagnostics: string[] = [];
    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [],
      onDiagnostic: (note) => diagnostics.push(note)
    });

    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(result.claims[0].sources).toEqual([]);
    expectReaderText(result.claims[0].rationale);
    expect(diagnostics.join('\n')).toMatch(/rejeté/);
  });

  it('propagates an aborted grounded call instead of silently degrading the finding to non-verifiable', async () => {
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

  it('yields non-verifiable when every search result has a blank snippet, no matter what verdict the agent returned - the regression this stage exists to close', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const client = new StubClient({
      completions: [
        JSON.stringify({ action: 'search', query: finding.quote, note: 'cherche' }),
        JSON.stringify({
          action: 'verdict',
          verification: 'verifiee',
          sources: [{ title: 'Un article', url: 'https://news.example/blank', origin: 'search' }],
          rationale: "Ça a l'air vrai."
        })
      ],
      canSearch: true,
      searchImpl: async () => [{ title: 'Un article', url: 'https://news.example/blank', snippet: '' }]
    });

    const diagnostics: string[] = [];
    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [],
      onDiagnostic: (note) => diagnostics.push(note)
    });

    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(result.claims[0].sources).toEqual([]);
    expectReaderText(result.claims[0].rationale);
    expect(diagnostics.join('\n')).toMatch(/texte source lisible/i);
  });

  it('never lets a blank-snippet search result back a verdict, while a real-snippet result can', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const client = new StubClient({
      completions: [
        // One search returns only blank-snippet results: nothing readable.
        JSON.stringify({ action: 'search', query: 'vide', note: 'cherche' }),
        JSON.stringify({ action: 'verdict', verification: 'non-verifiable', sources: [], rationale: 'rien à signaler' })
      ],
      canSearch: true,
      searchImpl: async () => [{ title: 'Résultat sans texte', url: 'https://news.example/empty', snippet: '' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims[0].verification).toBe('non-verifiable');
    // The blank snippet never counted as evidence anywhere in the run.
    expect(result.claims[0].sources).toEqual([]);
  });

  it('reaches a verifiee verdict when a real-snippet search result backs it', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const client = new StubClient({
      completions: [
        JSON.stringify({ action: 'search', query: finding.quote, note: 'cherche' }),
        JSON.stringify({
          action: 'verdict',
          verification: 'verifiee',
          sources: [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }],
          rationale: 'Corroboré.'
        })
      ],
      canSearch: true,
      searchImpl: async () => [{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', snippet: '200 postes supprimés' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expect(result.claims[0].verification).toBe('verifiee');
    expect(result.claims[0].sources).toEqual([{ title: 'Communiqué officiel', url: 'https://news.example/plan-social', origin: 'search' }]);
  });

  it("reads a cited source the agent decides to read, and a verdict backed by that read page holds", async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const client = new StubClient({
      completions: [
        // The agent reads the article's own citation, then verdicts on it.
        JSON.stringify({ action: 'read_source', url: 'https://src.example/p', note: 'lit la source de l\'article' }),
        JSON.stringify({
          action: 'verdict',
          verification: 'verifiee',
          sources: [{ title: 'cette étude', url: 'https://src.example/p', origin: 'article' }],
          rationale: "La page lue confirme l'affirmation."
        })
      ],
      // The agent route needs a search-capable client to run at all, but this
      // agent chooses only read_source; searchImpl proves it was never used.
      canSearch: true,
      searchImpl: async () => {
        throw new Error('agent chose read_source, never searched');
      }
    });

    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [{ href: 'https://src.example/p', domain: 'src.example', text: 'cette étude', blockId: 'b1' }],
      fetchImpl: async () =>
        new Response('<html><body><p>Les données confirment X.</p></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
    });

    expect(result.claims[0].verification).toBe('verifiee');
    expect(result.claims[0].sources[0].url).toBe('https://src.example/p');
    // The cited source was actually read, so its URL is evidenced.
    expect(result.claims[0].sources[0].origin).toBe('article');
  });

  it('forces non-verifiable when a verdict names a cited source that was never read or searched', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    // The agent claims a verdict backed by the article's citation, but only
    // ever ran a search that returned a blank snippet - it never read the page.
    const client = new StubClient({
      completions: [
        JSON.stringify({ action: 'search', query: finding.quote, note: 'cherche' }),
        JSON.stringify({
          action: 'verdict',
          verification: 'verifiee',
          sources: [{ title: 'cette étude', url: 'https://src.example/p', origin: 'article' }],
          rationale: "Confirmé par la source de l'article."
        })
      ],
      canSearch: true,
      searchImpl: async () => [{ title: 'x', url: 'https://n.example/a', snippet: '' }]
    });

    const diagnostics: string[] = [];
    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [{ href: 'https://src.example/p', domain: 'src.example', text: 'cette étude', blockId: 'b1' }],
      fetchImpl: async () => {
        throw new Error('should not fetch: agent never chose read_source');
      },
      onDiagnostic: (note) => diagnostics.push(note)
    });

    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(result.claims[0].sources).toEqual([]);
    expectReaderText(result.claims[0].rationale);
    expect(diagnostics.join('\n')).toMatch(/texte source lisible/i);
  });

  it('respects the agent step cap by forcing conclusion before a runaway loop can continue', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    // A pathological agent answers every step with another search request,
    // never a verdict. The step ceiling must force it to conclude instead of
    // issuing unbounded searches against the provider.
    const searches = Array.from({ length: 8 }, (_, i) =>
      JSON.stringify({ action: 'search', query: `q${i + 1}`, note: 'encore' })
    );
    const client = new StubClient({
      completions: searches,
      canSearch: true,
      searchImpl: async () => [{ title: 'r', url: 'https://n.example/r', snippet: 'preuve' }]
    });

    const diagnostics: string[] = [];
    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [],
      onDiagnostic: (note) => diagnostics.push(note)
    });

    // The agent was forced to conclude when it hit the step ceiling; it never
    // returned a verdict, so the run degrades to non-verifiable rather than
    // looping forever.
    expect(result.claims[0].verification).toBe('non-verifiable');
    expectReaderText(result.claims[0].rationale);
    expect(diagnostics.join('\n')).toMatch(/step limit/i);
    expect(client.searches.length).toBeLessThan(8);
  });

  it('keeps the stage-wide search ceiling when there are more findings than searches', async () => {
    // Twenty findings, an agent that always asks for one more search. The
    // per-finding floor of one search used to apply even once the stage's
    // fourteen were spent, so every finding still searched.
    const findings = Array.from({ length: 20 }, (_, i) => makeFinding({ id: `f${i}`, category: 'affirmation-non-etayee' }));
    const client = new StubClient({
      completions: Array.from({ length: 60 }, () => JSON.stringify({ action: 'search', query: 'q', note: 'encore' })),
      canSearch: true,
      searchImpl: async () => [{ title: 'r', url: 'https://n.example/r', snippet: 'preuve' }]
    });

    const result = await researchFindings({ client, input: sampleInput, findings, citedSources: [] });

    expect(result.claims).toHaveLength(20);
    expect(client.searches.length).toBe(14);
  });

  it('hands the grounded call the search and output ceilings it was given', async () => {
    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({ content: JSON.stringify({ verification: 'non-verifiable', sources: [] }), citations: [] })
    });

    await researchFindings({
      client,
      input: sampleInput,
      findings: [makeFinding({ category: 'affirmation-non-etayee' })],
      citedSources: [],
      maxSearches: 3,
      maxTokens: 4096
    });

    expect(client.groundedCalls[0].maxSearches).toBe(3);
    expect(client.groundedCalls[0].maxTokens).toBe(4096);
  });
});

/**
 * The case seen in production on the first real hosted analysis: a franceinfo
 * piece on smartphone prices. The audit rightly flagged that the three quoted
 * customers are anonymous, quoting "confie un client". Research then searched
 * that fragment, the search returned a company called Confie, and its About,
 * Client Services and Contact pages were listed under the finding as
 * "Sources consultées".
 */
describe('the anonymous-witness case (franceinfo, smartphone prices)', () => {
  const article: AnalysisInput = {
    url: 'https://www.franceinfo.fr/sciences/high-tech/smartphones-la-penurie-de-puces-electroniques-fait-grimper-les-prix_8249692.html',
    title: 'Smartphones : la pénurie de puces électroniques fait grimper les prix',
    outlet: 'franceinfo.fr',
    language: 'fr',
    blocks: [
      {
        id: 'b2',
        type: 'paragraph',
        charStart: 0,
        text:
          "Désormais, pour s'offrir un smartphone neuf, il faut parfois dépenser l'équivalent d'un salaire. " +
          "\"C'est quasiment, entre guillemets, le prix d'un loyer, donc oui, enfin, ça nous frustre un peu\", confie un client. " +
          "Une autre ajoute : \"S'endetter pour un téléphone, de mon point de vue, ça vaut pas le coup.\""
      },
      {
        id: 'b5',
        type: 'paragraph',
        charStart: 400,
        text: "Au total, cette année, le prix de certaines puces mémoire a augmenté de 350 %."
      }
    ]
  };

  /** The audit's answer, as the model now writes it: no checkable claim behind anonymous witnesses. */
  const auditAnswer = JSON.stringify({
    summary: 'Article informatif, appuyé sur des témoignages anonymes.',
    scores: [{ domain: 'robustesse_factuelle', score: 25 }],
    findings: [
      {
        blockId: 'b2',
        quote: 'confie un client',
        category: 'affirmation-non-etayee',
        severity: 1,
        label: 'Témoins non identifiables',
        explanation: 'Les trois personnes citées restent anonymes, ce qui empêche toute vérification.',
        checkableClaim: ''
      },
      {
        blockId: 'b5',
        quote: 'le prix de certaines puces mémoire a augmenté de 350 %',
        category: 'affirmation-non-etayee',
        severity: 2,
        label: 'Chiffre sans source',
        explanation: "Le chiffre de 350 % n'est rattaché à aucune étude.",
        checkableClaim: 'Le prix de certaines puces mémoire a augmenté de 350 % en 2026.'
      }
    ]
  });

  /** What the search engine returns for the bare fragment "confie un client". */
  const confieHits: SearchResult[] = [
    { title: 'About Us | Confie', url: 'https://www.confie.com/about-us', snippet: '' },
    { title: 'Confie Client Services | Confie', url: 'https://www.confie.com/client-services', snippet: '' },
    { title: 'Contact Us | Confie', url: 'https://www.confie.com/contact-us', snippet: '' }
  ];
  const memoryHit: SearchResult = {
    title: 'Les prix de la mémoire DRAM ont triplé',
    url: 'https://news.example/dram-prix',
    snippet: 'Les prix contractuels de certaines mémoires ont progressé de 350 % sur un an.'
  };

  it('never searches the anonymous witnesses, and never lists a page under them', async () => {
    const audited = parseAndValidateLlmOutput(auditAnswer, article);
    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({
        // The model, given the restated claim, names only the page about memory prices.
        content: JSON.stringify({
          verification: 'verifiee',
          sources: [{ title: memoryHit.title, url: memoryHit.url, quote: memoryHit.snippet, origin: 'search' }],
          rationale: 'Une source de presse spécialisée rapporte la même hausse.'
        }),
        citations: [...confieHits, memoryHit]
      })
    });

    const { claims } = await researchFindings({ client, input: article, findings: audited.findings, citedSources: [] });
    const { findings } = reconcileResearchedFindings(audited.findings, claims);

    // One grounded call, for the checkable figure only, carrying the restated fact.
    expect(client.groundedCalls).toHaveLength(1);
    expect(client.groundedCalls[0].messages[0].content).toContain('AFFIRMATION À VÉRIFIER : Le prix de certaines puces mémoire a augmenté de 350 % en 2026.');
    expect(claims.map((c) => c.claim)).toEqual(['Le prix de certaines puces mémoire a augmenté de 350 % en 2026.']);

    const witnesses = findings.find((f) => f.quote === 'confie un client');
    expect(witnesses?.verification).toBe('non-verifiable');
    expect(witnesses?.sources ?? []).toEqual([]);

    // The search hits that were never used are not shown as consulted sources.
    expect(claims[0].sources.map((s) => s.url)).toEqual([memoryHit.url]);
  });

  it('lists nothing, and says so, when a search returns only pages that share the words', async () => {
    const finding = makeFinding({
      category: 'affirmation-non-etayee',
      blockId: 'b2',
      quote: 'confie un client',
      checkableClaim: 'Un client a déclaré que le prix d’un smartphone neuf équivaut à un loyer.'
    });
    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({
        content: JSON.stringify({
          verification: 'non-verifiable',
          sources: [{ title: 'About Us | Confie', url: 'https://www.confie.com/about-us', origin: 'search' }],
          rationale: ''
        }),
        citations: confieHits
      })
    });

    const { claims } = await researchFindings({ client, input: article, findings: [finding], citedSources: [] });

    expect(claims[0].verification).toBe('non-verifiable');
    expect(claims[0].sources).toEqual([]);
    expectReaderText(claims[0].rationale);
  });

  it('drops the provider results the model did not use, even on a confirmed verdict', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee', blockId: 'b5', quote: 'a augmenté de 350 %' });
    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({
        content: JSON.stringify({ verification: 'verifiee', sources: [{ title: '', url: memoryHit.url, origin: 'search' }], rationale: 'Confirmé.' }),
        citations: [...confieHits, memoryHit]
      })
    });

    const { claims } = await researchFindings({ client, input: article, findings: [finding], citedSources: [] });

    expect(claims[0].verification).toBe('verifiee');
    expect(claims[0].sources.map((s) => s.url)).toEqual([memoryHit.url]);
  });

  it('keeps an agent verdict of non-verifiable free of the search hits it saw', async () => {
    const finding = makeFinding({
      category: 'affirmation-non-etayee',
      blockId: 'b2',
      quote: 'confie un client',
      checkableClaim: 'Un client a déclaré que le prix d’un smartphone neuf équivaut à un loyer.'
    });
    const client = new StubClient({
      completions: [
        JSON.stringify({ action: 'search', query: 'prix smartphone neuf équivalent loyer client', note: 'cherche le témoignage' }),
        JSON.stringify({
          action: 'verdict',
          verification: 'non-verifiable',
          sources: [{ title: 'About Us | Confie', url: 'https://www.confie.com/about-us', origin: 'search' }],
          rationale: 'Aucune source pertinente trouvée.'
        })
      ],
      canSearch: true,
      searchImpl: async () => confieHits.map((h) => ({ ...h, snippet: 'Confie is an insurance distribution company.' }))
    });

    const { claims } = await researchFindings({ client, input: article, findings: [finding], citedSources: [] });

    expect(claims[0].verification).toBe('non-verifiable');
    expect(claims[0].sources).toEqual([]);
    expect(claims[0].rationale).toBe('Aucune source pertinente trouvée.');
  });

  it('records why nothing was searched when no finding carries a checkable claim', async () => {
    const audited = parseAndValidateLlmOutput(auditAnswer, article);
    const client = new StubClient({ completions: [], canGround: true });

    const result = await researchFindings({
      client,
      input: article,
      findings: audited.findings.filter((f) => f.quote === 'confie un client'),
      citedSources: []
    });

    expect(client.groundedCalls).toHaveLength(0);
    expect(result.claims).toEqual([]);
    expect(result.research.performed).toBe(false);
    expect(result.research.skippedReason).toMatch(/recherche web pourrait/);
  });

  it('asks the audit for the checkable claim, and the research prompts to search the claim, not the quote', () => {
    // Long enough to be read as the article it is, not as a short message.
    const long = { ...article, blocks: [...article.blocks, { id: 'pad', type: 'paragraph' as const, text: 'Suite. '.repeat(200), charStart: 0 }] };
    expect(buildFourchesCaudinesUserPrompt(long, { now: pinnedNow })).toMatch(/"checkableClaim"[\s\S]*témoignage anonyme/);
    expect(RESEARCH_AGENT_SYSTEM_PROMPT).toMatch(/jamais la seule citation exacte/);
    expect(FOURCHES_CAUDINES_CLAIM_GROUNDED_JUDGEMENT_SYSTEM_PROMPT).toMatch(/jamais la seule citation exacte/);
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

describe('temporal context in the judgement prompts', () => {
  const claim = { quote: "L'usine a licencié 200 salariés en 2023.", claim: "L'usine a licencié 200 salariés en 2023." };

  it('carries the pinned date and the near-future-is-not-an-error rule in the research agent step prompt', () => {
    const prompt = buildResearchAgentStepPrompt({
      claim,
      searchEvidence: [],
      readEvidence: [],
      remainingArticleSources: [],
      now: pinnedNow,
      searchesLeft: 4,
      readsLeft: 0
    });

    expect(prompt).toContain('CONTEXTE TEMPOREL');
    expect(prompt).toContain('2026-08-19');
    expect(prompt).toContain("n'est PAS en soi une erreur");
    expect(prompt).toContain('RÉSULTATS DE RECHERCHE DÉJÀ OBTENUS');
  });

  it('carries the pinned date and the near-future-is-not-an-error rule in the grounded judgement prompt', () => {
    const prompt = buildClaimGroundedJudgementUserPrompt(claim, [], pinnedNow);

    expect(prompt).toContain('CONTEXTE TEMPOREL');
    expect(prompt).toContain('2026-08-19');
    expect(prompt).toContain("n'est PAS en soi une erreur");
  });
});

describe('RESEARCH_AGENT_SYSTEM_PROMPT', () => {
  it('demands contradiction-hunting and evidential honesty in its operative directive', () => {
    expect(RESEARCH_AGENT_SYSTEM_PROMPT).toContain('CONTRADICTION');
    expect(RESEARCH_AGENT_SYSTEM_PROMPT).toContain('read_source');
    expect(RESEARCH_AGENT_SYSTEM_PROMPT).toContain("Une URL que tu n'as pas réellement lue ne prouve rien");
  });
  it('names no provider and no engine reasoning when the client cannot search the web', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const client = new StubClient({ completions: [], canSearch: false });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expectReaderText(result.claims[0].rationale);
    expect(result.claims[0].rationale).not.toMatch(/anthropic/i);
    expect(result.research.skippedReason).not.toMatch(/anthropic/i);
  });

  it('keeps a provider error out of the claim and sends it to the diagnostic channel', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => {
        throw new Error('HTTP 503 upstream connect error');
      }
    });
    const diagnostics: string[] = [];

    const result = await researchFindings({
      client,
      input: sampleInput,
      findings: [finding],
      citedSources: [],
      onDiagnostic: (note) => diagnostics.push(note)
    });

    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(result.claims[0].rationale).not.toContain('503');
    expectReaderText(result.claims[0].rationale);
    expect(diagnostics.join('\n')).toContain('HTTP 503 upstream connect error');
  });

  it('does not require a diagnostic listener: the reader text is the same without one', async () => {
    const finding = makeFinding({ category: 'affirmation-non-etayee' });
    const client = new StubClient({
      completions: [],
      canGround: true,
      groundedImpl: async () => ({ content: JSON.stringify({ verification: 'verifiee', sources: [] }), citations: [] })
    });

    const result = await researchFindings({ client, input: sampleInput, findings: [finding], citedSources: [] });

    expectReaderText(result.claims[0].rationale);
  });
});
