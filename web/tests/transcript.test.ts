/**
 * A pasted video transcript: what is pinned is that no time reaches the text
 * the analysis reads, that each passage keeps the time it starts at, and that
 * an article which merely mentions hours stays an article. The fixtures in
 * `transcripts/` are the layouts a reader actually pastes: YouTube's
 * "Afficher la transcription" panel (with and without the spoken timestamp a
 * screen reader gets), a time at the start of each line, bracketed times past
 * the hour, and SRT and WebVTT subtitle files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pastedChars, pasteProblem, readPaste } from '../src/paste';
import { readTranscript, timeAt, videoTime } from '../src/transcript';

const fixture = (name: string) => readFileSync(join(__dirname, 'transcripts', name), 'utf8');

/** Anything that reads as a time, spelled out or not. */
const LEFTOVER_TIME = /\d:\d\d|-->|\bsecondes?\b|\bWEBVTT\b|^\d+$/m;

describe('readTranscript', () => {
  it.each([
    ['youtube-panel.txt', 0, 72],
    ['youtube-panel-plain.txt', 0, 24],
    ['inline.txt', 0, 24],
    ['long-debate.txt', 3588, 3618],
    ['subtitles.srt', 0, 11],
    ['subtitles.vtt', 0, 10],
  ])('reads %s as speech, without a time left in it', (name, first, last) => {
    const passages = readTranscript(fixture(name));
    expect(passages).not.toBeNull();
    for (const passage of passages!) expect(passage.text).not.toMatch(LEFTOVER_TIME);
    expect(passages![0].at).toBe(first);
    // Short passages are joined into paragraphs, each timed by its first.
    expect(passages!.at(-1)!.at).toBeLessThanOrEqual(last);
  });

  it('keeps every word of the speech, in order', () => {
    const speech = readTranscript(fixture('youtube-panel.txt'))!
      .map((p) => p.text)
      .join(' ');
    expect(speech).toBe(
      'Introduction bonjour à tous et bienvenue dans cette nouvelle vidéo aujourd\'hui on va parler du prix de ' +
        'l\'électricité qui selon certains aurait doublé en un an alors est-ce que c\'est vrai on va regarder les ' +
        'chiffres ensemble Les chiffres d\'après la commission de régulation le tarif réglementé a augmenté de 10 % en ' +
        'février et pas de 100 % comme on l\'entend partout sur les réseaux',
    );
    // A cue spread over two lines is one passage.
    expect(readTranscript(fixture('subtitles.srt'))!.map((p) => p.text).join(' ')).toContain(
      'a perdu près de 30 % de sa capacité à absorber le carbone.',
    );
  });

  it('starts a new paragraph, with its own time, after a sentence and never inside one', () => {
    // A sentence over two segments, then another: the cut falls between the sentences.
    const lines = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? `${videoTime(i * 5)}\nla phrase numéro ${i} commence ici` : `${videoTime(i * 5)}\net elle finit là.`,
    );
    const passages = readTranscript(lines.join('\n'))!;
    expect(passages.length).toBeGreaterThan(1);
    for (const passage of passages) {
      expect(passage.text).toMatch(/^la phrase numéro \d+ commence ici/);
      expect(passage.text.endsWith('et elle finit là.')).toBe(true);
      expect(passage.at % 10).toBe(0);
    }
  });

  it('cuts unpunctuated automatic captions once a paragraph runs long', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `${videoTime(i * 3)}\nsans la moindre ponctuation ${i}`);
    const passages = readTranscript(lines.join('\n'))!;
    expect(passages.length).toBeGreaterThan(3);
    for (const passage of passages) expect(passage.text.length).toBeLessThan(1_300);
  });

  it('leaves an article that mentions hours as an article', () => {
    const agenda = [
      'La manifestation partira à 14:00 de la place de la République.',
      'Les organisateurs attendent plusieurs milliers de personnes, selon la préfecture.',
      'Un second rassemblement est prévu à 18:30 devant la mairie.',
      'Le trafic sera perturbé toute la journée, prévient la RATP, qui conseille d’éviter le secteur.',
      'À 20:00, une réunion publique se tiendra au gymnase municipal.',
      'Les élus de l’opposition ont annoncé qu’ils y participeraient.',
      'La mairie n’a pas souhaité réagir.',
    ].join('\n');
    expect(readTranscript(agenda)).toBeNull();
  });

  it('leaves a live blog, newest post first, as an article', () => {
    const live = ['12:45 Le ministre quitte la salle.', '12:30 Début de la séance.', '12:15 Les députés arrivent.'].join('\n');
    expect(readTranscript(live)).toBeNull();
  });
});

describe('videoTime', () => {
  it('writes a time as the player does', () => {
    expect([videoTime(0), videoTime(72), videoTime(603), videoTime(3723)]).toEqual(['0:00', '1:12', '10:03', '1:02:03']);
  });
});

describe('a transcript pasted on /analyser', () => {
  it('sends only the speech, and keeps each paragraph’s time beside its block', () => {
    const { blocks, times } = readPaste({ title: 'Prix de l’électricité', text: fixture('youtube-panel.txt') });
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Prix de l’électricité' });
    for (const block of blocks) expect(block.text).not.toMatch(LEFTOVER_TIME);
    expect(times).not.toBeNull();
    // The title has no time; every paragraph has one.
    expect(times![blocks[0].id]).toBeUndefined();
    expect(blocks.slice(1).map((b) => times![b.id][0].at)).toEqual(
      readTranscript(fixture('youtube-panel.txt'))!.map((p) => p.at),
    );
  });

  it('times a passage inside a paragraph by the segment it was spoken in', () => {
    const { blocks, times } = readPaste({ title: '', text: fixture('youtube-panel.txt') });
    const block = blocks.find((b) => b.text.includes('tarif réglementé'))!;
    const starts = times![block.id];
    expect(timeAt(starts, block.text.indexOf('tarif réglementé'))).toBe(65);
    expect(timeAt(starts, block.text.indexOf('regarder les chiffres'))).toBe(14);
    for (const start of starts) expect(block.text[start.offset]).not.toBe(' ');
  });

  it('keeps the times of a paragraph too long for one block in each of its parts', () => {
    const words = 'une parole sans fin '.repeat(1_500);
    const { blocks, times } = readPaste({ title: '', text: `0:00 début\n0:05 ${words}\n0:10 suite\n0:15 fin` });
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) expect(block.text.length).toBeLessThanOrEqual(20_000);
    // The long speech is cut in two blocks, the second opening inside the passage at 0:05.
    expect(blocks.map((b) => times![b.id][0].at)).toEqual([0, 5, 10]);
    const last = blocks.at(-1)!;
    expect(timeAt(times![last.id], last.text.indexOf('fin', last.text.length - 4))).toBe(15);
  });

  it('gives an article no times', () => {
    expect(readPaste({ title: '', text: 'Un article.\nSur deux lignes.' }).times).toBeNull();
  });

  it('counts the speech, not the timestamps, toward the minimum length', () => {
    // Over 200 characters as pasted, under 200 once the times are gone.
    const short = Array.from({ length: 12 }, (_, i) => `0:${String(i).padStart(2, '0')}\n${i} secondes\noui`).join('\n');
    expect(short.length).toBeGreaterThan(200);
    expect(pastedChars(short)).toBeLessThan(200);
    expect(pasteProblem({ title: '', source: '', text: short })).toBe('too_short');
    expect(pasteProblem({ title: '', source: '', text: fixture('youtube-panel.txt') })).toBeNull();
  });
});
