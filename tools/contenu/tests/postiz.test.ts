import { describe, expect, it } from 'vitest';

import { MAX_LENGTH } from '../src/filter';
import { postizLength, postizText } from '../src/postiz';

// Three Bluesky posts of the week of 16 November, approved, then refused by Postiz: « post is too long ».
const REFUSED = [
  'Dans l’agence visitée, trois salariés sur quatre ne viennent plus qu’une fois par semaine. Les Français ont tourné le dos au bureau. Quatre personnes, et voilà « les Français » : il faudrait un échantillon large et représentatif. https://squiggle.fr/glossaire/generalisation-hative?ref=bluesky',
  'Un passage de « ici » ou « chez eux » à « les Français », « tout le monde » : la conclusion porte sur un groupe bien plus large que celui observé. Mots à surveiller : « tous », « toujours », « plus personne ». https://squiggle.fr/glossaire/generalisation-hative?ref=bluesky',
  '« La lecture recule chez les adolescents, et le constat inquiète. Selon une étude, 78 % des Français seraient concernés. » En classe, on peut marquer les phrases fragiles, puis révéler l’analyse constat par constat. Gratuit avec une adresse académique. https://squiggle.fr/enseignants?ref=bluesky',
];

const graphemes = (text: string) => [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(text)].length;

describe('the text sent to Postiz', () => {
  it('was counted with each no-break space as « &nbsp; », over Bluesky’s 300', () => {
    const asPostizCounted = (text: string) => text.replace(/ /g, '&nbsp;').length;
    expect(REFUSED.map(graphemes)).toEqual([293, 273, 296]);
    expect(REFUSED.map(asPostizCounted)).toEqual([308, 353, 306]);
  });

  it('keeps the spacing unbroken with the narrow no-break space, which Postiz counts as one', () => {
    for (const text of REFUSED) {
      const sent = postizText(text);
      expect(sent).not.toMatch(/ |&nbsp;/);
      expect(sent.replace(/ /g, ' ')).toBe(text);
      expect(postizLength('bluesky', text)).toBe(graphemes(text));
      expect(postizLength('bluesky', text)).toBeLessThanOrEqual(MAX_LENGTH.bluesky);
    }
  });

  it('counts what Postiz escapes, and bytes on Threads', () => {
    expect(postizLength('mastodon', 'Q&A <ici>')).toBe('Q&amp;A &lt;ici&gt;'.length);
    expect(postizLength('threads', 'Été ?')).toBe(new TextEncoder().encode('Été ?').length);
    expect(postizLength('x', 'Oui ?')).toBe(6);
  });
});
