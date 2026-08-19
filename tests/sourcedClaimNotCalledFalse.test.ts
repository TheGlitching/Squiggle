import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureKeyStorage } from '../src/crypto/storage';
import { AnalysisPipeline } from '../src/engine/pipeline';
import { AnthropicClient } from '../src/client/anthropic';

/**
 * The reported defect, end to end: the audit declared facts false that were true
 * and hyperlinked in the article. Two behaviours have to hold for a reader to
 * trust the result, and neither is about prose quality:
 *
 *  1. a claim the article hyperlinks must never be reported as unsourced,
 *  2. a verdict of "false" must be impossible without a source that was read.
 */

const ARTICLE_BLOCKS = [
  {
    id: 'b1',
    type: 'paragraph' as const,
    text: 'Le déficit public a atteint 5,5 % du PIB en 2023, selon les comptes nationaux.',
    charStart: 0,
  },
];

const CITED = [
  {
    href: 'https://www.insee.fr/fr/statistiques/deficit-2023',
    domain: 'insee.fr',
    text: 'comptes nationaux',
    blockId: 'b1',
  },
];

/** A minimal Anthropic SSE stream carrying one text payload. */
const sseStream = (text: string): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const events = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { text } },
        { type: 'message_delta', usage: { output_tokens: 10 } },
      ];
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
};

const AUDIT = {
  verdict: 'reviser_avant_publication',
  summary: 'Audit portant sur l’article transmis.',
  scores: [{ domain: 'robustesse_factuelle', score: 12, strengths: [], weaknesses: [] }],
  findings: [
    {
      blockId: 'b1',
      quote: 'Le déficit public a atteint 5,5 % du PIB en 2023',
      category: 'source-absente',
      severity: 3,
      label: 'Chiffre non sourcé',
      explanation: 'Aucune source n’est donnée pour ce chiffre.',
      confidence: 0.9,
    },
  ],
};

describe('a claim the article sources is never reported as unsourced', () => {
  let bodies: string[];

  beforeEach(async () => {
    bodies = [];
    const store: Record<string, unknown> = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in store) out[k] = store[k];
            return out;
          },
          set: async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          },
        },
      },
    });
    await new SecureKeyStorage().saveProviderConfig({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-test',
    });
  });

  it('hands the audit the article’s own source and refuses the unsourced verdict', async () => {
    // The model is asked to research first. It declines to search and answers
    // from memory, which must never license a factual verdict.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(init.body);
        const isAudit = init.body.includes('GRILLE D');
        const payload = isAudit
          ? JSON.stringify(AUDIT)
          : JSON.stringify({
              claims: [
                {
                  blockId: 'b1',
                  quote: 'Le déficit public a atteint 5,5 % du PIB en 2023',
                  claim: 'Le déficit public français valait 5,5 % du PIB en 2023',
                },
              ],
            });
        return {
          ok: true,
          status: 200,
          body: sseStream(payload),
          json: async () => ({ content: [{ type: 'text', text: payload }] }),
          text: async () => payload,
        };
      })
    );

    const client = new AnthropicClient({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-ant-test',
    });
    const report = await new AnalysisPipeline({ client }).analyze({
      text: ARTICLE_BLOCKS[0].text,
      title: 'Le déficit public en 2023',
      blocks: ARTICLE_BLOCKS,
      citedSources: CITED,
    });

    // The audit prompt was shown the source the article already cites.
    const auditPrompt = bodies.find((b) => b.includes('GRILLE D'));
    expect(auditPrompt).toBeDefined();
    expect(auditPrompt).toContain('insee.fr');

    // And the unsourced verdict did not survive: the article does cite a source
    // for that passage, so the finding is re-framed rather than published as-is.
    const finding = report.findings[0];
    expect(finding.category).not.toBe('source-absente');
    expect(finding.verification).toBe('unverified');
    expect(finding.sources?.[0]).toMatchObject({
      url: 'https://www.insee.fr/fr/statistiques/deficit-2023',
      origin: 'article',
    });

    // Nothing was actually retrieved, so no claim may read as checked.
    for (const claim of report.claims) {
      expect(claim.verification).toBe('unverified');
    }
  });
});
