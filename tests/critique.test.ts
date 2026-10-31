/**
 * The critique after the audit: it withdraws or recalibrates findings, adds
 * only what it can quote from the text, and can never cost the reader the
 * audit it was given.
 */
import { describe, it, expect } from 'vitest';
import {
  BaseLLMClient,
  CRITIQUE_SYSTEM_PROMPT,
  critiqueReport,
  parseAndValidateLlmOutput,
  type AnalysisInput,
  type CompletionOptions,
  type CompletionResponse,
} from '@squiggle/shared';

class ScriptedClient extends BaseLLMClient {
  calls: CompletionOptions[] = [];
  constructor(private readonly reply: string | Error) {
    super({ provider: 'openrouter', apiKey: 'test-key-not-a-secret', model: 'stub' });
  }
  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    this.calls.push(options);
    if (this.reply instanceof Error) throw this.reply;
    return { content: this.reply, model: 'stub', provider: 'openrouter' };
  }
  async stream(): Promise<CompletionResponse> {
    throw new Error('not used');
  }
}

const PARAGRAPH =
  'La mairie a annoncé dans un communiqué la fermeture de la piscine pendant six mois. ' +
  'Ces technocrates méprisent les familles et veulent tuer la vie de quartier. ' +
  'Selon nos informations, 40 % des usagers renonceront définitivement au sport. ';

const ARTICLE: AnalysisInput = {
  url: 'https://example.org/piscine',
  title: 'La piscine ferme',
  language: 'fr',
  // Long enough to be read as an article, not as a short message.
  blocks: [
    { id: 'b1', type: 'paragraph', text: PARAGRAPH.repeat(6), charStart: 0 },
  ],
};

const AUDIT = JSON.stringify({
  summary: 'Un texte militant.',
  scores: [
    { domain: 'robustesse_factuelle', score: 30 },
    { domain: 'solidite_logique', score: 20 },
    { domain: 'cadrage_manipulation', score: 20 },
    { domain: 'deontologie', score: 8 },
    { domain: 'orthographe_grammaire', score: 5 },
  ],
  findings: [
    { id: 'f1', blockId: 'b1', quote: 'La mairie a annoncé dans un communiqué', category: 'source-absente', severity: 2, label: 'Source floue', explanation: 'Pas de lien vers le communiqué.' },
    { id: 'f2', blockId: 'b1', quote: 'Ces technocrates méprisent les familles', category: 'sophisme', severity: 1, label: 'Attaque ad hominem', explanation: 'Les décideurs sont disqualifiés plutôt que leurs raisons.' },
    { id: 'f3', blockId: 'b1', quote: 'veulent tuer la vie de quartier', category: 'cadrage', severity: 2, label: "Procès d'intention", explanation: 'Une intention prêtée sans preuve.' },
    { id: 'f4', blockId: 'b1', quote: 'fermeture de la piscine pendant six mois', category: 'point-fort', severity: 1, label: 'Fait daté', explanation: 'La durée est donnée.' },
  ],
});

const audited = () => parseAndValidateLlmOutput(AUDIT, ARTICLE);

describe('the critique after the audit', () => {
  it('withdraws, recalibrates and keeps, always keeps a strength, and rescores', async () => {
    const report = audited();
    const client = new ScriptedClient(
      JSON.stringify({
        decisions: [
          { n: 1, action: 'retirer', raison: 'communiqué de la mairie : source identifiable' },
          { n: 2, action: 'ajuster', severity: 3 },
          { n: 3, action: 'garder' },
          { n: 4, action: 'retirer' },
        ],
        ajouts: [],
      })
    );

    const out = await critiqueReport({ client, input: ARTICLE, report });

    expect(out.findings.map((f) => [f.id, f.severity])).toEqual([
      ['f2', 3],
      ['f3', 2],
      ['f4', 1],
    ]);
    expect(out.score).not.toBe(report.score);
    expect(client.calls[0].systemPrompt).toBe(CRITIQUE_SYSTEM_PROMPT);
    expect(client.calls[0].messages[0].content).toContain('1. [b1] [source-absente, sévérité 2] « La mairie a annoncé dans un communiqué »');
  });

  it('publishes an added finding only when its quote is in the text, with the text’s own characters', async () => {
    const client = new ScriptedClient(
      JSON.stringify({
        decisions: [],
        ajouts: [
          { blockId: 'b1', quote: 'selon nos informations, 40 % des usagers', category: 'affirmation-non-etayee', severity: 3, label: 'Chiffre sans origine', explanation: "D'où vient ce chiffre ?", checkableClaim: '' },
          { blockId: 'b1', quote: 'une phrase que le texte ne contient pas', category: 'cadrage', severity: 2, label: 'Inventé', explanation: 'Absent du texte.' },
        ],
      })
    );

    const out = await critiqueReport({ client, input: ARTICLE, report: audited() });

    const added = out.findings.slice(4);
    expect(added).toHaveLength(1);
    expect(added[0].quote).toBe('Selon nos informations, 40 % des usagers');
    expect(typeof added[0].charStart).toBe('number');
  });

  it('leaves the audit as it was when the critique fails or answers something unreadable', async () => {
    const report = audited();
    for (const reply of [new Error('provider down'), 'pas du JSON', JSON.stringify({ verdict: 'ok' })]) {
      const out = await critiqueReport({ client: new ScriptedClient(reply), input: ARTICLE, report });
      expect(out).toBe(report);
    }
  });

  it('is not run on a short message, nor on a report with nothing negative', async () => {
    const message: AnalysisInput = { ...ARTICLE, blocks: [{ id: 'b1', type: 'paragraph', text: PARAGRAPH, charStart: 0 }] };
    const client = new ScriptedClient(JSON.stringify({ decisions: [{ n: 1, action: 'retirer' }], ajouts: [] }));

    const onMessage = parseAndValidateLlmOutput(AUDIT, message);
    expect(await critiqueReport({ client, input: message, report: onMessage })).toBe(onMessage);

    const strengthsOnly = { ...audited(), findings: audited().findings.filter((f) => f.category === 'point-fort') };
    expect(await critiqueReport({ client, input: ARTICLE, report: strengthsOnly })).toBe(strengthsOnly);

    expect(client.calls).toHaveLength(0);
  });

  it('keeps the devices of an opinion piece, as the audit’s own rule 5 does', () => {
    expect(CRITIQUE_SYSTEM_PROMPT).not.toContain('une opinion assumée dans une tribune signée');
    for (const device of ['faux dilemme', 'homme de paille', 'attaque ad hominem', "procès d'intention", 'appel à la peur', 'vocabulaire chargé']) {
      expect(CRITIQUE_SYSTEM_PROMPT).toContain(device);
    }
  });
});
