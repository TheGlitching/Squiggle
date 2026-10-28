/**
 * Screenshots stitched back into an article, on lines laid out as the OCR
 * returns them. What is pinned: the phone's and the app's chrome goes, an
 * overlap is kept once and never mistaken for chrome, nothing is kept twice or
 * lost where two screenshots meet, and a transcript keeps a timestamp at the
 * start of each passage. `captures-ocr.test.ts` runs the same on real screenshots.
 */
import { describe, expect, it } from 'vitest';

import { normalise, stitchCaptures, type CaptureLine } from '../src/captures';

/** A screenshot: each string a line, 60px apart, a blank line (`''`) a paragraph gap. */
function shot(...rows: string[]): CaptureLine[] {
  const lines: CaptureLine[] = [];
  let top = 10;
  for (const row of rows) {
    if (row) lines.push({ text: row, confidence: 95, top, bottom: top + 40 });
    top += row ? 60 : 40;
  }
  return lines;
}

const cut = (line: CaptureLine): CaptureLine => ({ ...line, confidence: 20 });

describe('stitchCaptures', () => {
  it('drops the chrome repeated at the same edge, though the clock and the battery change', () => {
    const text = stitchCaptures([
      shot('10:41 4G 86%', 'Le Quotidien', 'Le premier paragraphe se termine ici.', 'Abonnez-vous pour 1 €', 'Accueil Rubriques Profil'),
      shot('10:42 4G 85%', 'Le Quotidien', 'Un second paragraphe, sans rapport.', 'Abonnez-vous pour 1 €', 'Accueil Rubriques Profil'),
      shot('10:43 4G 84%', 'Le Quotidien', 'Un troisième, toujours sans rapport.', 'Abonnez-vous pour 1 €', 'Accueil Rubriques Profil'),
    ]);
    expect(text).toBe(
      'Le premier paragraphe se termine ici.\nUn second paragraphe, sans rapport.\nUn troisième, toujours sans rapport.',
    );
  });

  it('keeps an overlap once, with only two screenshots to tell it from chrome', () => {
    const text = stitchCaptures([
      shot('10:41', 'Le gouvernement a annoncé mardi une hausse', 'de dix pour cent du budget de la santé,', 'une mesure attendue depuis des mois par', 'Accueil Profil'),
      shot('10:42', 'de dix pour cent du budget de la santé,', 'une mesure attendue depuis des mois par', 'les syndicats du secteur hospitalier.', 'Accueil Profil'),
    ]);
    expect(text).toBe(
      'Le gouvernement a annoncé mardi une hausse de dix pour cent du budget de la santé, une mesure attendue depuis des mois par les syndicats du secteur hospitalier.',
    );
  });

  it('recognises an overlap read slightly differently on each screenshot', () => {
    const text = stitchCaptures([
      shot('Les chiffres publiés par l’Insee montrent', 'une baisse du chômage de 0,3 point au', 'troisième trimestre, la plus forte depuis'),
      shot('troisieme trimestre, Ia plus forte depuis', 'deux ans selon les économistes interrogés.'),
    ]);
    expect(text).toBe(
      'Les chiffres publiés par l’Insee montrent une baisse du chômage de 0,3 point au troisième trimestre, la plus forte depuis deux ans selon les économistes interrogés.',
    );
  });

  it('drops the line a screenshot’s edge cuts in half, above the overlap and below it', () => {
    const first = shot('Le maire a présenté lundi son plan pour', 'les transports en commun de la ville,', 'qui prévoit trois nouvelles lignes de');
    const second = shot(
      'qui prévoit trois nouvelles lignes de',
      'tramway d’ici à la fin de la décennie.',
      '',
      'L’opposition dénonce un calendrier',
      'irréaliste et un budget sous-estimé.',
    );
    first.push(cut({ text: 'tramwav d’iri A la fin', confidence: 0, top: 200, bottom: 230 }));
    second.unshift(cut({ text: 'Ies transports en cnmmun', confidence: 0, top: 0, bottom: 5 }));
    expect(stitchCaptures([first, second])).toBe(
      'Le maire a présenté lundi son plan pour les transports en commun de la ville, qui prévoit trois nouvelles lignes de tramway d’ici à la fin de la décennie.\nL’opposition dénonce un calendrier irréaliste et un budget sous-estimé.',
    );
  });

  it('continues a sentence across screenshots that touch without overlapping', () => {
    const text = stitchCaptures([
      shot('Le rapport de la Cour des comptes, publié', 'ce matin, critique sévèrement la gestion'),
      shot('du programme, jugée « opaque et coûteuse ».', '', 'Le ministère n’a pas encore réagi.'),
    ]);
    expect(text).toBe(
      'Le rapport de la Cour des comptes, publié ce matin, critique sévèrement la gestion du programme, jugée « opaque et coûteuse ».\nLe ministère n’a pas encore réagi.',
    );
  });

  it('starts a paragraph after a wider gap, at a bullet, and joins a word cut by a hyphen', () => {
    const text = stitchCaptures([
      shot('Un titre', '', 'Le texte qui suit le titre parle d’infor-', 'mation et de désinformation.', 'e Premier point de la liste.', 'e Second point de la liste.'),
    ]);
    expect(text).toBe(
      'Un titre\nLe texte qui suit le titre parle d’information et de désinformation.\nPremier point de la liste.\nSecond point de la liste.',
    );
  });

  it('starts a passage at each timestamp of a transcript, which repeat without being chrome', () => {
    const text = stitchCaptures([
      shot('Transcription', '0:12 bonjour à tous et bienvenue', 'dans cette nouvelle vidéo', '0:15 aujourd’hui on parle du prix', 'de l’électricité qui aurait doublé'),
      shot('Transcription', '0:15 aujourd’hui on parle du prix', 'de l’électricité qui aurait doublé', '0:19 en un an selon certains', '0:22 alors est-ce vrai'),
    ]);
    expect(text).toBe(
      '0:12 bonjour à tous et bienvenue dans cette nouvelle vidéo\n0:15 aujourd’hui on parle du prix de l’électricité qui aurait doublé\n0:19 en un an selon certains\n0:22 alors est-ce vrai',
    );
  });

  it('reads nothing from screenshots with no text', () => {
    expect(stitchCaptures([])).toBe('');
    expect(stitchCaptures([[], []])).toBe('');
  });
});

describe('normalise', () => {
  it('sets aside case, accents and punctuation', () => {
    expect(normalise('  « L’Été », dit-il…  ')).toBe('l ete dit il');
  });
});
