import { describe, expect, it } from 'vitest';
import {
  auditSystemPrompt,
  buildFourchesCaudinesUserPrompt,
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  getScoreBandLabel,
  isShortMessage,
  MAX_MESSAGE_CHARS,
  MESSAGE_SYSTEM_PROMPT,
  reportSubject,
  type AnalysisInput,
} from '@squiggle/shared';
import { selectedMessage } from '../src/content/selection';

const RUMOUR =
  'URGENT ⚠️ à partir du 1er novembre la CAF supprime les APL pour les retraités propriétaires. Transférez à tous vos contacts !';

const input = (text: string, url = 'https://www.facebook.com/groups/1/posts/2'): AnalysisInput => ({
  url,
  title: '',
  language: 'fr',
  blocks: [{ id: 'b1', type: 'paragraph', text, charStart: 0 }],
});

describe('a short message', () => {
  it('is read from the length of the text alone, up to the message ceiling', () => {
    expect(isShortMessage(input(RUMOUR))).toBe(true);
    expect(isShortMessage(input('x'.repeat(MAX_MESSAGE_CHARS)))).toBe(true);
    expect(isShortMessage(input('x'.repeat(MAX_MESSAGE_CHARS + 1)))).toBe(false);
  });

  it('never turns a video transcript into a message, however short', () => {
    expect(isShortMessage(input(RUMOUR, 'https://www.youtube.com/watch?v=k1KPNO-1vJc'))).toBe(false);
  });

  it('gets the message instructions, an article the article ones', () => {
    expect(auditSystemPrompt(input(RUMOUR))).toBe(MESSAGE_SYSTEM_PROMPT);
    expect(auditSystemPrompt(input('Une phrase. '.repeat(200)))).toBe(FOURCHES_CAUDINES_SYSTEM_PROMPT);

    const prompt = buildFourchesCaudinesUserPrompt(input(RUMOUR), { now: new Date('2026-10-31T12:00:00Z') });
    expect(prompt).toContain(RUMOUR);
    for (const line of ['De quoi parle-t-on :', 'Qui l\'affirme :', 'Ce qu\'on en sait :', 'Ce qui manque :']) {
      expect(prompt).toContain(line);
    }
    // The audit hands the main claim to research instead of judging it from memory.
    expect(MESSAGE_SYSTEM_PROMPT).toMatch(/Tu n'inventes AUCUN fait/);
    expect(prompt).toMatch(/affirmation principale[\s\S]*'affirmation-non-etayee'[\s\S]*checkableClaim/);
    // The language of a message typed on a phone is not judged.
    expect(prompt).toMatch(/"orthographe_grammaire"[^\n]*donne toujours 5/);
    expect(prompt).not.toMatch(/fourches|caudines/i);
  });

  it('is named a message in its band, from the length the report records', () => {
    expect(reportSubject({ meta: { textLengthChars: RUMOUR.length } })).toBe('message');
    expect(reportSubject({ meta: { textLengthChars: 5_000 } })).toBe('article');
    expect(reportSubject({ meta: {} })).toBe('article');
    expect(reportSubject({ meta: { textLengthChars: 300 } }, true)).toBe('video');
    expect(getScoreBandLabel('problematique', 'message').title).toBe('Message problématique');
  });
});

describe('a passage the reader selected in the page', () => {
  const url = 'https://www.facebook.com/groups/1/posts/2';

  it('is read as a message, one block per line, with the page as its address', () => {
    const article = selectedMessage(`  ${RUMOUR}\n\n  Partagez !  \n`, url)!;
    expect(article.detectionMethod).toBe('selection');
    expect(article.blocks.map((b) => b.text)).toEqual([RUMOUR, 'Partagez !']);
    expect(article.blocks[1].charStart).toBe(RUMOUR.length + 2);
    expect(article.metadata.canonicalUrl).toBe(url);
    expect(isShortMessage({ url, blocks: article.blocks })).toBe(true);
  });

  it('is ignored when it is too short to claim anything, or longer than a message', () => {
    expect(selectedMessage('', url)).toBeNull();
    expect(selectedMessage('Merci !', url)).toBeNull();
    // A long selection is most likely the article itself: the page is read as usual.
    expect(selectedMessage('Une phrase de l’article. '.repeat(100), url)).toBeNull();
  });
});
