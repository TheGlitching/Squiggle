/**
 * The classroom mode's model. Pinned: the sentences are numbered as the class
 * and the student sheet call them, a finding belongs to the sentence its
 * passage starts in, the reveal order starts in reading order with strengths
 * last, the keyboard walks the lesson as one line, and a session file is
 * read back exactly, or refused with a sentence when it is not one.
 */
import { describe, expect, it } from 'vitest';

import {
  defaultOrder,
  deckOf,
  fileName,
  layoutOf,
  newSeance,
  parseSeance,
  placeOf,
  questionFor,
  seanceFile,
  SeanceError,
  startState,
  step,
  tally,
  type ClassState,
} from '../src/classe';
import { lesson } from './helpers';

describe('the text, in numbered sentences', () => {
  it('numbers the body sentences across paragraphs, never the title', () => {
    const { blocks, report } = lesson();
    const layout = layoutOf(blocks, report.findings);
    expect(layout.sentences.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(layout.sentences[1].text).toBe('Selon une étude, 78 % des Français seraient concernés.');
    expect(layout.sentences[6].text).toMatch(/^Dans les médiathèques/);
    // The title is laid out, unnumbered.
    expect(layout.blocks[0].runs.every((run) => run.n === null)).toBe(true);
  });

  it('puts each finding in the sentence its passage starts in', () => {
    const { blocks, report } = lesson();
    const layout = layoutOf(blocks, report.findings);
    const place = (id: string) => placeOf(layout, report.findings.find((f) => f.id === id)!);
    expect(place('f1')).toBe('phrase 2');
    expect(place('f2')).toBe('phrase 3');
    expect(place('f4')).toBe('phrase 5');
    expect(place('f6')).toBe('phrase 7');
  });

  it('says where a passage in the title is, and that a missing passage is nowhere', () => {
    const { blocks, report } = lesson();
    const inTitle = { ...report.findings[1], id: 't', blockId: 'b1', quote: 'une génération perdue' };
    const missing = { ...report.findings[1], id: 'x', quote: 'une phrase absente du texte' };
    const layout = layoutOf(blocks, [inTitle, missing]);
    expect(placeOf(layout, inTitle)).toBe('titre');
    expect(placeOf(layout, missing)).toBeNull();
  });

  it('keeps every character of the text, in order', () => {
    const { blocks, report } = lesson();
    const layout = layoutOf(blocks, report.findings);
    for (const { block, runs } of layout.blocks) {
      expect(runs.flatMap((run) => run.parts.map((part) => part.text)).join('')).toBe(block.text);
    }
  });
});

describe('the reveal order', () => {
  it('starts in reading order, the strength last', () => {
    const { blocks, report } = lesson();
    expect(defaultOrder(layoutOf(blocks, report.findings), report.findings)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  });

  it('leaves out the findings the teacher took out', () => {
    const seance = { ...newSeance(lesson()), left: ['f2'] };
    expect(deckOf(seance).map((f) => f.id)).toEqual(['f1', 'f3', 'f4', 'f5', 'f6']);
  });

  it('hides the score by default', () => {
    const seance = newSeance(lesson());
    expect(seance.hideScore).toBe(true);
    expect(startState(seance).showScore).toBe(false);
  });
});

describe('the questions to ask', () => {
  it('comes from the category, and a doubtful claim is not called false', () => {
    const { report } = lesson();
    const byId = (id: string) => report.findings.find((f) => f.id === id)!;
    expect(questionFor(byId('f4'))).toBe('Jugé douteux, pas faux : pourquoi cette nuance ?');
    expect(questionFor(byId('f2'))).toMatch(/contre-exemple/);
    expect(questionFor(byId('f6'))).toMatch(/reste de l’article/);
  });
});

describe('the lesson, one key at a time', () => {
  it('walks reading, marking, each finding, then the review, and back', () => {
    let state: ClassState = startState(newSeance(lesson()));
    const seen: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      state = step(state, 'next', 3);
      seen.push(`${state.phase}:${state.revealed}`);
    }
    expect(seen).toEqual([
      'reperage:0',
      'revelation:0',
      'revelation:1',
      'revelation:2',
      'revelation:3',
      'bilan:3',
      'bilan:3',
      'bilan:3',
      'bilan:3',
      'bilan:3',
    ]);
    state = step(state, 'prev', 3);
    expect(state).toMatchObject({ phase: 'revelation', revealed: 3 });
  });

  it('turns the screen black and back without losing its place', () => {
    const state = { ...startState(newSeance(lesson())), phase: 'revelation' as const, revealed: 2 };
    const black = step(state, 'black', 6);
    expect(black).toMatchObject({ black: true, phase: 'revelation', revealed: 2 });
    expect(step(black, 'black', 6).black).toBe(false);
  });

  it('counts what the class found, missed, and marked of its own', () => {
    const seance = newSeance(lesson());
    const layout = layoutOf(seance.blocks, seance.report.findings);
    // Sentences 2 and 4 hold a finding; sentence 1 holds none.
    const state = { ...startState(seance), marks: { 1: 3, 2: 0, 4: 14 } };
    expect(tally(seance, layout, state)).toMatchObject({ weak: 5, found: 2, extra: 1 });
  });
});

describe('the session file', () => {
  it('reads back what it wrote, marked as opened from a file', async () => {
    const seance = { ...newSeance(lesson()), order: ['f3', 'f1', 'f2', 'f4', 'f5', 'f6'], left: ['f5'], hideScore: false };
    const read = parseSeance(await seanceFile(seance).text());
    expect(read).toEqual({ ...seance, fromFile: true });
  });

  it('has a name a teacher recognises, valid on every system', () => {
    const seance = { ...newSeance(lesson()), title: 'Écrans : « 9/10 » des ados? <oui>' };
    expect(fileName(seance)).toBe('Séance Squiggle - Écrans « 9 10 » des ados oui.squiggle');
    expect(fileName({ ...seance, title: '' })).toBe('Séance Squiggle.squiggle');
  });

  it('refuses a file that is not a session, with a sentence', () => {
    expect(() => parseSeance('pas du JSON')).toThrow(SeanceError);
    expect(() => parseSeance('{"format":"autre"}')).toThrow('Ce fichier n’est pas une séance Squiggle.');
    expect(() => parseSeance(JSON.stringify({ format: 'squiggle-seance', version: 1, title: 'x', blocks: [], report: {} }))).toThrow(
      /incomplet ou abîmé/,
    );
  });

  it('refuses a file from a newer version, and says what to do', () => {
    expect(() => parseSeance(JSON.stringify({ format: 'squiggle-seance', version: 2 }))).toThrow(/version plus récente/);
  });

  it('refuses a finding the pages could not show', async () => {
    const seance = newSeance(lesson());
    const data = JSON.parse(await seanceFile(seance).text());
    data.report.findings[0].severity = 7;
    expect(() => parseSeance(JSON.stringify(data))).toThrow(/incomplet ou abîmé/);
  });

  it('completes an order that lost a finding, and drops ids it does not know', async () => {
    const seance = newSeance(lesson());
    const data = JSON.parse(await seanceFile(seance).text());
    data.order = ['f2', 'inconnu', 'f1'];
    data.left = ['inconnu', 'f1'];
    const read = parseSeance(JSON.stringify(data));
    expect(read.order).toEqual(['f2', 'f1', 'f6', 'f3', 'f4', 'f5']);
    expect(read.left).toEqual(['f1']);
  });
});
