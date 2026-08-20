import { describe, expect, it } from 'vitest';
import { BaseLLMClient } from '../src/client/base';
import { extractPageText } from '../src/engine/sourceFetch';
import { FactualClaim, SourceCheck } from '../src/engine/types';
import {
  reconcileSourceChecks,
  VerifyCitedSourcesArgs,
  verifyCitedSources
} from '../src/engine/sourceVerification';
import type { CompletionOptions, CompletionResponse, StreamCallbacks } from '../src/types/byok';

/**
 * The article's own citations are the half of sourcing no search can cover:
 * an article citing a page proves nothing about what that page says, and a
 * citation can support the claim, contradict it, or be dead - until the page
 * is fetched and read, all three look identical. These tests drive the
 * fetch-then-judge path with an injectable fetcher and a scripted judge, and
 * verify the reconciliation rules that never let a claim overstate what was
 * actually read.
 */
class ScriptedClient extends BaseLLMClient {
  private queue: string[];
  readonly completeCalls: CompleteCall[] = [];

  constructor(completions: string[]) {
    super({ provider: 'anthropic', apiKey: 'test-key', model: 'stub-model' });
    this.queue = [...completions];
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const content = options.messages?.find((m) => m.role === 'user')?.content as string;
    this.completeCalls.push({
      userContent: content,
      systemPrompt: options.systemPrompt
    });
    const next = this.queue.shift();
    if (next === undefined) throw new Error('ScriptedClient: no more queued completions');
    return { content: next, model: this.getModel(), provider: this.getProvider() };
  }

  async stream(_o: CompletionOptions, _c: StreamCallbacks): Promise<CompletionResponse> {
    throw new Error('unused');
  }
}

interface CompleteCall {
  userContent: string;
  systemPrompt?: string;
}

const claim: FactualClaim = {
  id: 'c1',
  findingId: 'f1',
  blockId: 'b1',
  quote: 'L\'article affirme que X est vrai.',
  claim: 'X est vrai.',
  verification: 'non-verifiable',
  sources: [],
  rationale: undefined
};

const citedSources = [
  {
    href: 'https://source.example/etude',
    domain: 'source.example',
    text: 'L\'étude de référence',
    blockId: 'b1'
  }
];

interface VerifyOpts {
  maxPages?: number;
  fetchTimeoutMs?: number;
}

function verifyOptions(opts: VerifyOpts = {}): VerifyCitedSourcesArgs {
  return {
    client: new ScriptedClient([]),
    claims: [claim],
    citedSources,
    ...opts
  };
}

async function fetchImpl(_url: RequestInfo | URL): Promise<Response> {
  return new Response('<html><body><h1>Étude de référence</h1><p>Les données confirment que X est vrai.</p></body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}

describe('verifyCitedSources - fetch, judge, reconcile', () => {
  it('reads a cited page and downgrades a verified claim the page contradicts', async () => {
    const client = new ScriptedClient([
      JSON.stringify({
        relation: 'contredit',
        fiabilite: 'fiable',
        passage: 'Les données infirment X.',
        discordance: 'La page dit que X est faux, l\'article prétend qu\'elle le confirme.',
        raison: 'Source primaire officielle.'
      })
    ]);

    const result = await verifyCitedSources({
      ...verifyOptions(),
      client,
      fetchImpl: async () =>
        new Response('<html><body><p>Les données infirment X.</p></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
    });

    expect(result.checks[0].relation).toBe('contredit');
    expect(result.checks[0].fiabilite).toBe('fiable');
    expect(result.claims[0].verification).toBe('douteuse');
    expect(result.claims[0].rationale).toContain('Source citée');
    // The read page becomes reader-visible evidence, quoted with its discordance.
    expect(result.claims[0].sources.some((s) => s.url === 'https://source.example/etude' && s.quote)).toBe(true);
  });

  it('promotes a non-verifiable claim when a trusted cited page supports it', async () => {
    const client = new ScriptedClient([
      JSON.stringify({
        relation: 'supporte',
        fiabilite: 'fiable',
        passage: 'Les données confirment X.',
        raison: 'Publication officielle.'
      })
    ]);

    const result = await verifyCitedSources({
      ...verifyOptions(),
      client,
      fetchImpl
    });

    expect(result.claims[0].verification).toBe('verifiee');
    expect(result.checks[0].relation).toBe('supporte');
  });

  it('never certifies a claim with only a dubious supporting page', async () => {
    const client = new ScriptedClient([
      JSON.stringify({
        relation: 'supporte',
        fiabilite: 'douteuse',
        passage: 'X est vrai.',
        raison: 'Site anonyme sans auteur ni date.'
      })
    ]);

    const result = await verifyCitedSources({
      ...verifyOptions(),
      client,
      fetchImpl
    });

    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(result.claims[0].rationale).toContain('non fiable');
    // The dubious page is surfaced, not dropped: the reader sees the article's
    // only cited backer and the reason it cannot certify the claim.
    expect(result.claims[0].sources).toHaveLength(1);
    expect(result.claims[0].sources[0].url).toBe('https://source.example/etude');
  });

  it('marks a dead cited link inaccessible without failing the claim', async () => {
    const client = new ScriptedClient([]); // no judge call expected

    const result = await verifyCitedSources({
      ...verifyOptions(),
      client,
      fetchImpl: async () => {
        throw new Error('network unreachable');
      }
    });

    expect(result.checks[0].relation).toBe('inaccessible');
    expect(result.claims[0].verification).toBe('non-verifiable');
    expect(client.completeCalls).toHaveLength(0);
  });

  it('drops a verified claim whose only backers were dead or unrelated pages', async () => {
    const verifiedClaim: FactualClaim = {
      ...claim,
      verification: 'verifiee',
      // The research stage marked it verified on the article's own citations alone.
      sources: [{ title: 'L\'étude', url: 'https://source.example/etude', quote: '', origin: 'article' }]
    };

    const result = await verifyCitedSources({
      ...verifyOptions(),
      client: new ScriptedClient([]),
      claims: [verifiedClaim],
      citedSources
    });

    expect(result.checks[0].relation).toBe('inaccessible');
    expect(result.claims[0].verification).toBe('non-verifiable');
  });

  it('keeps a verified claim when the cited pages failed but search evidence stands', async () => {
    const verifiedClaim: FactualClaim = {
      ...claim,
      verification: 'verifiee',
      sources: [
        { title: 'Agence de presse', url: 'https://news.example/independant', quote: 'X est vrai.', origin: 'search' }
      ]
    };

    const result = await verifyCitedSources({
      ...verifyOptions(),
      client: new ScriptedClient([]),
      claims: [verifiedClaim],
      citedSources
    });

    expect(result.claims[0].verification).toBe('verifiee');
    expect(result.claims[0].rationale).toContain('sources de recherche');
  });

  it('resolves a verdict on the articles own citation alone is a reading, subject to total page budget', async () => {
    const client = new ScriptedClient([]); // budget exhausted before any judge call

    const result = await verifyCitedSources({
      ...verifyOptions({ maxPages: 0 }),
      client,
      fetchImpl
    });

    expect(result.checks).toHaveLength(0);
    expect(result.claims[0].verification).toBe('non-verifiable');
  });

  it('strips scripts, styles and whitespace from a fetched page', () => {
    const html = `<html><head><style>.x{color:red}</style></head><body>
      <script>window.x = 1;</script>
      <p>Un&nbsp;passage&nbsp;utile.</p>
      <p>Deuxième&nbsp;ligne.</p>
    </body></html>`;
    const text = extractPageText(html);
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('window.x');
    expect(text).toContain('Un passage utile.');
    expect(text).toContain('Deuxième ligne.');
  });
});

describe('reconcileSourceChecks', () => {
  const checks: SourceCheck[] = [
    {
      claimId: 'c1',
      url: 'https://source.example/etude',
      title: 'L\'étude',
      relation: 'contredit',
      fiabilite: 'fiable',
      discordance: 'La page dit que X est faux.'
    }
  ];

  it('a contradiction turns a verified claim douteuse and is reflected in the evidence', () => {
    const verifiedClaim: FactualClaim = {
      ...claim,
      verification: 'verifiee',
      sources: [{ title: 'Agence', url: 'https://news.example', quote: 'confirme', origin: 'search' }]
    };

    const [out] = reconcileSourceChecks([verifiedClaim], checks);
    expect(out.verification).toBe('douteuse');
    expect(out.sources.some((s) => s.url === 'https://source.example/etude' && s.quote)).toBe(true);
  });

  it('a supporting trusted page promotes non-verifiable to verifiee', () => {
    const [out] = reconcileSourceChecks(
      [{ ...claim, verification: 'non-verifiable' }],
      [
        {
          claimId: 'c1',
          url: 'https://source.example/etude',
          title: 'L\'étude',
          relation: 'supporte',
          fiabilite: 'fiable',
          passage: 'Les données confirment X.'
        }
      ]
    );
    expect(out.verification).toBe('verifiee');
  });
});