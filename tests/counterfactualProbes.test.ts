import { describe, expect, it } from 'vitest';
import { BaseLLMClient, GroundedAnswer, SearchResult } from '../src/client/base';
import { AnalysisInput, Finding } from '../src/engine/types';
import { researchFindings } from '../src/engine/research';
import type { CompletionOptions, CompletionResponse, StreamCallbacks } from '../src/types/byok';

/**
 * The counterfactual hunt: before a claim is accepted, the research stage
 * deliberately searches FOR a contradiction, not just for confirmation. The
 * stub records every web query and every completion's user content, so the
 * tests can assert that the search was widened to a contradiction-seeking
 * probe set, that the judge saw those probes named alongside the raw claim,
 * and that the generated contradiction was actually weighed rather than
 * skipped past.
 */
class ProbeStub extends BaseLLMClient {
  private completionQueue: string[];
  readonly webSearches: { query: string; maxResults?: number }[] = [];
  readonly judgeUserContents: string[] = [];
  private readonly searchImpl: (query: string) => Promise<SearchResult[]>;

  constructor(opts: {
    completions: string[];
    searchImpl: (query: string) => Promise<SearchResult[]>;
  }) {
    super({ provider: 'anthropic', apiKey: 'test-key', model: 'stub-model' });
    this.completionQueue = [...opts.completions];
    this.searchImpl = opts.searchImpl;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const user = options.messages?.find((m) => m.role === 'user')?.content as string | undefined;
    if (user) this.judgeUserContents.push(user);
    const content = this.completionQueue.shift();
    if (content === undefined) throw new Error('ProbeStub: no more queued completions');
    return { content, model: this.getModel(), provider: this.getProvider() };
  }

  async stream(_o: CompletionOptions, _c: StreamCallbacks): Promise<CompletionResponse> {
    throw new Error('unused');
  }

  override supportsWebSearch(): boolean {
    return true;
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    this.webSearches.push({ query, maxResults: opts?.maxResults });
    return this.searchImpl(query);
  }

  override supportsGroundedAnswer(): boolean {
    return false;
  }

  async groundedAnswer(_o: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    throw new Error('unused');
  }
}

const CLAIM_QUOTE = '200 salariés ont été licenciés en 2023.';
const FINDINGS: Finding[] = [
  {
    id: 'f1',
    blockId: 'b1',
    quote: CLAIM_QUOTE,
    category: 'affirmation-non-etayee',
    severity: 3,
    label: 'Chiffre non étayé',
    explanation: 'Le chiffre de 200 licenciements n\'est pas sourcé.',
    confidence: 0.9
  }
];

const input: AnalysisInput = {
  url: 'https://example.com/a',
  title: 'Une usine ferme',
  language: 'fr',
  blocks: [{ id: 'b1', type: 'paragraph', text: CLAIM_QUOTE, charStart: 0 }]
};

const PROBES = [
  'licenciements 2025 usine',
  '200 salariés usine 2025',
  'licenciements 2025 démenti'
];

describe('counterfactual probing in the research stage', () => {
  it('searches the claim and every generated probe, then names them to the judge', async () => {
    const stub = new ProbeStub({
      completions: [
        JSON.stringify({ probes: PROBES }),
        JSON.stringify({
          verification: 'verifiee',
          sources: [{ title: 'Communiqué', url: 'https://news.example/plan', quote: '200 postes supprimés', origin: 'search' }],
          rationale: 'Le communiqué officiel confirme le chiffre.'
        })
      ],
      searchImpl: async (query) => [
        { title: 'Résultat', url: 'https://news.example/plan', snippet: `répond à : ${query}` }
      ]
    });

    const result = await researchFindings({
      client: stub,
      input,
      findings: FINDINGS,
      citedSources: []
    });

    // The claim's own text plus the three generated probes were handed to the
    // provider as web queries, at the widened per-claim budget.
    const queries = stub.webSearches.map((s) => s.query);
    expect(queries).toEqual([CLAIM_QUOTE, ...PROBES]);
    expect(stub.webSearches.every((s) => s.maxResults === 5)).toBe(true);
    expect(result.research.queries.join('|')).toContain('démenti');

    // The judge's prompt names the counterfactual probes explicitly, so the
    // negating evidence must be weighed rather than skimmed past as noise.
    const judgePrompt = stub.judgeUserContents[stub.judgeUserContents.length - 1];
    expect(judgePrompt).toContain('démenti');
    expect(judgePrompt).toContain('RECHERCHES CONTREFACTUELLES');

    expect(result.claims[0].verification).toBe('verifiee');
  });

  it('degrades to the raw claim alone when probe generation fails', async () => {
    const calls: string[] = [];
    const stub = new ProbeStub({
      completions: [
        // Probe generation returns something no parser can salvage: the repair
        // path would recover a stray-brace JSON, so this is not JSON at all.
        'pas du JSON, juste du texte'
      ],
      searchImpl: async (query) => {
        calls.push(query);
        return [];
      }
    });

    const result = await researchFindings({
      client: stub,
      input,
      findings: FINDINGS,
      citedSources: []
    });

    expect(calls).toEqual([CLAIM_QUOTE]);
    expect(result.research.performed).toBe(true);
    // The judge never ran (no evidenced results, empty set), so the claim stays
    // unverifiable - an honest downgrade, never a fabricated contradiction.
    expect(result.claims[0].verification).toBe('non-verifiable');
  });
});