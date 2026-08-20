import { describe, expect, it } from 'vitest';
import { BaseLLMClient, GroundedAnswer, SearchResult } from '../src/client/base';
import { AnalysisInput, Finding } from '../src/engine/types';
import { researchFindings } from '../src/engine/research';
import { RESEARCH_AGENT_SYSTEM_PROMPT } from '../src/engine/prompts';
import type { CompletionOptions, CompletionResponse, StreamCallbacks } from '../src/types/byok';

/**
 * The agentic counterfactual hunt: before a claim is accepted, the research
 * agent is told to search FOR a contradiction, not just for confirmation, and
 * it drives its own sequence of searches - restarting and refining the query
 * across steps until it has enough to verdict. The stub records every agent
 * step's user prompt and every web query, so the tests can assert that (a) the
 * agent's operative directive demands contradiction-hunting, (b) the agent
 * issues multiple searches of its own choosing rather than a fixed probe list,
 * and (c) it lands a verdict that the accumulated search evidence backs.
 */
class AgentStub extends BaseLLMClient {
  private completionQueue: string[];
  readonly webSearches: { query: string; maxResults?: number }[] = [];
  readonly stepUserContents: string[] = [];
  readonly stepSystemPrompts: string[] = [];
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
    if (user) this.stepUserContents.push(user);
    if (options.systemPrompt) this.stepSystemPrompts.push(options.systemPrompt);
    const content = this.completionQueue.shift();
    if (content === undefined) throw new Error('AgentStub: no more queued completions');
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

describe('agentic counterfactual research', () => {
  it('drives its own multi-step search sequence and lands a verdict backed by the evidence it gathered', async () => {
    const stub = new AgentStub({
      completions: [
        // First step: the agent chooses its first web search.
        JSON.stringify({ action: 'search', query: CLAIM_QUOTE, note: 'cherche les faits' }),
        // Second step: it refines toward a contradiction-seeking query.
        JSON.stringify({ action: 'search', query: `${CLAIM_QUOTE} démenti`, note: 'cherche une contradiction' }),
        // Third step: enough gathered, render a verdict on the evidence received.
        JSON.stringify({
          action: 'verdict',
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

    // The agent chose and ran two searches of its own, at the fixed result cap.
    expect(stub.webSearches.map((s) => s.query)).toEqual([CLAIM_QUOTE, `${CLAIM_QUOTE} démenti`]);
    expect(stub.webSearches.every((s) => s.maxResults === 5)).toBe(true);
    // Both are recorded in the query disclosure.
    expect(result.research.queries.join('|')).toContain('démenti');
    expect(result.research.queries).toHaveLength(2);

    // The agent's operative directive demands contradiction-hunting.
    expect(stub.stepSystemPrompts[0]).toContain(RESEARCH_AGENT_SYSTEM_PROMPT);

    // The run is genuinely iterative: the agent saw the accumulated search
    // evidence before its next decision (the directive and a real-snippet
    // step prompt prove searches fed back into the loop).
    const secondStepPrompt = stub.stepUserContents[1];
    expect(secondStepPrompt).toContain('RÉSULTATS DE RECHERCHE DÉJÀ OBTENUS');

    expect(result.claims[0].verification).toBe('verifiee');
    expect(result.claims[0].sources[0].url).toBe('https://news.example/plan');
  });

  it('degrades to non-verifiable when the agent can never produce a usable verdict step', async () => {
    const calls: string[] = [];
    const stub = new AgentStub({
      completions: [
        // The agent's first step is not salvageable JSON at all; with no
        // evidence gathered and no parseable action, the claim degrades
        // honestly rather than looping or inventing a contradiction.
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

    // Nothing was ever gathered or searched: honest downgrade, no fabrication.
    expect(calls).toEqual([]);
    expect(result.research.performed).toBe(true);
    expect(result.claims[0].verification).toBe('non-verifiable');
  });
});
