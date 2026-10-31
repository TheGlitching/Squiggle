/**
 * A recording in parts of fifteen minutes, and its transcription as the text
 * field takes it: timed lines that the transcript reader reads back with
 * each passage at its time in the whole recording.
 */
import { describe, expect, it } from 'vitest';

import { readTranscript } from '../../shared/src/extract/transcript';
import { isMedia, partSpan, partsOf, PART_SECONDS, transcriptText } from '../src/media';

describe('media', () => {
  it('cuts a recording into parts of one analysis each', () => {
    expect(PART_SECONDS).toBe(900);
    expect([1, 900, 901, 2000].map(partsOf)).toEqual([1, 1, 2, 3]);
    expect(partSpan(2, 2000)).toBe('30:00 à 33:20');
    expect(partSpan(0, 4000)).toBe('0:00 à 15:00');
  });

  it('writes the segments at their time in the whole recording, as a transcript', () => {
    const segments = [
      { start: 0, text: 'Bonjour à tous.' },
      { start: 4.6, text: 'Le chômage a baissé de moitié.' },
      { start: 9, text: 'C’est historique.' },
    ];
    const text = transcriptText('ignoré', segments, 1);
    expect(text.split('\n')).toEqual(['15:00 Bonjour à tous.', '15:04 Le chômage a baissé de moitié.', '15:09 C’est historique.']);
    expect(readTranscript(text)?.[0]).toMatchObject({ at: 900, text: 'Bonjour à tous. Le chômage a baissé de moitié. C’est historique.' });
    expect(transcriptText('Le texte seul.', [], 0)).toBe('Le texte seul.');
  });

  it('takes sounds and videos only', () => {
    expect(['audio/ogg', 'video/mp4', 'image/png', ''].map((type) => isMedia(new Blob([], { type })))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
