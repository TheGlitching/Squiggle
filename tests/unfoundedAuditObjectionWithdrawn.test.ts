import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureKeyStorage } from '../src/crypto/storage';
import { AnalysisPipeline } from '../src/engine/pipeline';
import { AnthropicClient } from '../src/client/anthropic';

/**
 * The reported defect, reproduced end to end: the audit asserted from memory
 * that a true, hyperlinked fact was wrong ("Éric Ciotti n'est pas maire de
 * Nice, c'est Christian Estrosi"), and nothing checked that objection before
 * it was published. Research now runs on the audit's own finding, confirms
 * the article was right, and the objection must never reach the reader as a
 * fault - it is withdrawn instead, with the evidence that cleared it kept on
 * the record.
 */

const ARTICLE_BLOCKS = [
  {
    id: 'b1',
    type: 'paragraph' as const,
    text: 'Éric Ciotti est maire de Nice depuis juin 2024, après la démission de Christian Estrosi.',
    charStart: 0,
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
  summary: 'Audit portant sur l’article transmis.',
  scores: [{ domain: 'robustesse_factuelle', score: 10, strengths: [], weaknesses: [] }],
  findings: [
    {
      blockId: 'b1',
      quote: 'Éric Ciotti est maire de Nice depuis juin 2024',
      category: 'affirmation-non-etayee',
      severity: 3,
      label: 'Erreur factuelle sur le maire de Nice',
      explanation: "Éric Ciotti n'est pas maire de Nice, c'est Christian Estrosi qui occupe cette fonction.",
      confidence: 0.9,
    },
  ],
};

const CONFIRMING_SOURCE_URL = 'https://www.nice.fr/fr/actualites/eric-ciotti-maire-de-nice';

const JUDGEMENT_CONFIRMING_THE_ARTICLE = {
  verification: 'verifiee',
  sources: [
    {
      title: 'Ville de Nice - actualités',
      url: CONFIRMING_SOURCE_URL,
      quote: 'Éric Ciotti a été élu maire de Nice en juin 2024.',
      origin: 'search',
    },
  ],
  rationale: "L'article est exact : Éric Ciotti est bien maire de Nice depuis juin 2024.",
};

describe('an audit objection the evidence confirms is withdrawn, not published as a fault', () => {
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

  it('withdraws the audit\'s factual objection once research confirms the article, and records it in research.withdrawn with its sources', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(init.body);
        const isAudit = init.body.includes('GRILLE D');

        // The audit answers first, from memory alone - no evidence has been
        // gathered yet. Its own factual finding is then researched, and the
        // provider reports it actually read a page that confirms the article.
        const content = isAudit
          ? [{ type: 'text', text: JSON.stringify(AUDIT) }]
          : [
              {
                type: 'text',
                text: JSON.stringify(JUDGEMENT_CONFIRMING_THE_ARTICLE),
                citations: [{ url: CONFIRMING_SOURCE_URL, title: 'Ville de Nice - actualités' }],
              },
            ];
        const payload = JSON.stringify(isAudit ? AUDIT : JUDGEMENT_CONFIRMING_THE_ARTICLE);

        return {
          ok: true,
          status: 200,
          body: sseStream(payload),
          json: async () => ({ content }),
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
      title: 'Le nouveau maire de Nice',
      blocks: ARTICLE_BLOCKS,
      citedSources: [],
    });

    // The audit really did raise the objection, from memory, before research ran.
    const auditPrompt = bodies.find((b) => b.includes('GRILLE D'));
    expect(auditPrompt).toBeDefined();

    // But the finished report never shows it to the reader as a fault: the
    // article's statement was confirmed, so the objection was unfounded.
    expect(report.findings).toHaveLength(0);
    expect(
      report.findings.some((f) => f.explanation.includes('Christian Estrosi'))
    ).toBe(false);

    // The disagreement is not silently erased - it is on the record, with the
    // evidence that settled it.
    expect(report.research.withdrawn).toHaveLength(1);
    const [withdrawn] = report.research.withdrawn;
    expect(withdrawn.blockId).toBe('b1');
    expect(withdrawn.quote).toBe('Éric Ciotti est maire de Nice depuis juin 2024');
    expect(withdrawn.reason).toBeTruthy();
    expect(withdrawn.sources).toEqual([
      expect.objectContaining({ url: CONFIRMING_SOURCE_URL, origin: 'search' }),
    ]);

    // The researched claim itself is on the record too, confirmed with its source.
    expect(report.claims).toHaveLength(1);
    expect(report.claims[0].verification).toBe('verifiee');
    expect(report.claims[0].sources[0].url).toBe(CONFIRMING_SOURCE_URL);

    // The withdrawn objection must not keep costing the article. The audit-time
    // score used to penalize every objection the model raised, then research
    // refuted some and removed them from the findings - but the number was
    // frozen at parse time, so a report could show a weak score with all its
    // objections dismissed. The pipeline now recomputes the composite score
    // from the model's raw marks against the findings that actually reach the
    // reader: a refuted objection no longer reduces its domain. The domain
    // that carried the objection therefore holds its full awarded mark, and
    // the report can never again show a note that contradicts the constats it
    // publishes.
    expect(report.findings).toHaveLength(0);
    const robustesse = report.categories.find((c) => c.domain === 'robustesse_factuelle');
    // 10 was the model's raw mark, and nothing survived to reduce it.
    expect(robustesse?.score).toBe(10);
  });
});
