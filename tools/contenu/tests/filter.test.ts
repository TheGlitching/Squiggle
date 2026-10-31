import { describe, expect, it } from 'vitest';

import { filterPost, hook, typography, type FilterInput } from '../src/filter';
import { NOTION_SOURCES } from '../src/sources';

const fauxDilemme = NOTION_SOURCES.find((s) => s.id === 'glossaire/faux-dilemme')!;
const PATHS = new Set(['/glossaire/faux-dilemme', '/analyser', '/blog/conclusion-hative']);

function input(text: string, extra: Partial<FilterInput> = {}): FilterInput {
  return {
    network: 'bluesky',
    text,
    source: fauxDilemme.text,
    sitePaths: PATHS,
    others: [],
    day: '2026-11-30',
    sourceId: fauxDilemme.id,
    ...extra,
  };
}

const GOOD =
  'Un article inventé : « Soit on interdit le téléphone avant quinze ans, soit on accepte de sacrifier une génération. » Entre les deux, tout un éventail a disparu. Comment le repérer : squiggle.fr/glossaire/faux-dilemme?ref=bluesky';

describe('filterPost', () => {
  it('accepts a post drawn from its notion, with its tracked link', () => {
    expect(filterPost(input(GOOD)).reasons).toEqual([]);
  });

  it('refuses a number the source does not contain', () => {
    const r = filterPost(input(GOOD.replace('Entre les deux', 'Dans 72 % des cas, entre les deux')));
    expect(r.reasons).toContain('chiffre absent de la source : 72 %');
  });

  it('keeps a number the source does contain', () => {
    const source = `${fauxDilemme.text}\nUne étude de 2019 sur 1 200 lecteurs.`;
    expect(filterPost(input(GOOD.replace('Entre les deux', 'En 2019, 1 200 lecteurs, et entre les deux'), { source })).reasons).toEqual([]);
  });

  it('only lets through squiggle.fr with the right ?ref= and the repository', () => {
    expect(filterPost(input(GOOD.replace('?ref=bluesky', '?ref=x'))).reasons).toContain(
      'le lien doit finir par ?ref=bluesky : squiggle.fr/glossaire/faux-dilemme?ref=x',
    );
    expect(filterPost(input(`${GOOD} https://example.com/a`)).reasons).toContain('lien hors de squiggle.fr et du dépôt : https://example.com/a');
    expect(filterPost(input(GOOD.replace('faux-dilemme?', 'n-existe-pas?'))).reasons).toContain('lien vers une page qui n’existe pas : /glossaire/n-existe-pas');
    expect(filterPost(input(`${GOOD} github.com/TheGlitching/Squiggle`)).reasons).toEqual([]);
  });

  it('requires one link where the link is the point, and none at all on X', () => {
    expect(filterPost(input(GOOD.replace(/ Comment.*$/, ''))).reasons).toContain('un lien vers squiggle.fr exactement, il y en a 0');
    expect(filterPost(input(GOOD.replace('?ref=bluesky', '?ref=x'), { network: 'x' })).reasons.some((r) => r.startsWith('aucun lien sur x'))).toBe(true);
    // Even the bare domain: X turns it into a link, and bills it as one.
    expect(filterPost(input(GOOD.replace(/squiggle\.fr\S+/, 'squiggle.fr'), { network: 'x' })).reasons.some((r) => r.startsWith('aucun lien sur x'))).toBe(true);
    expect(filterPost(input(GOOD.replace(/squiggle\.fr\S+/, 'squiggle.fr, lien dans la bio'), { network: 'instagram' })).reasons).toEqual([]);
  });

  it('refuses an outlet, a party, a public figure, an acronym or an @mention', () => {
    const add = (s: string) => filterPost(input(GOOD.replace('Entre les deux', `${s}. Entre les deux`))).reasons;
    expect(add('Comme dans Le Monde')).toContain('nom de média, de parti ou de personnalité : Le Monde');
    expect(add('Vu sur BFMTV')).toEqual(expect.arrayContaining([expect.stringMatching(/^nom de média/)]));
    expect(add('Selon Bardella')).toEqual(expect.arrayContaining([expect.stringMatching(/^nom de média/)]));
    expect(add('Le RN le dit')).toContain('sigle : RN');
    expect(add('Merci @quelquun.bsky.social')).toContain('mention d’un compte : @quelquun.bsky.social');
    // An ordinary phrase that happens to be a title is not a title.
    expect(add('Tout le monde fait le point')).toEqual([]);
  });

  it('refuses a mark, a ranking, the first person, the owner and the em dash', () => {
    const add = (s: string) => filterPost(input(GOOD.replace('Entre les deux', `${s}. Entre les deux`))).reasons;
    expect(add('Une tribune quinze sur vingt, 15/20')).toEqual(expect.arrayContaining([expect.stringMatching(/^note ou classement/)]));
    expect(add('Le pire article de la semaine')).toContain('note ou classement : Le pire');
    expect(add('Je trouve cela fragile')).toContain('« je » : Squiggle parle sans première personne');
    expect(add('J\'ai lu cela')).toContain('« je » : Squiggle parle sans première personne');
    expect(add('Une idée — fragile')).toContain('tiret cadratin');
  });

  it('counts Bluesky in graphemes, link included', () => {
    const long = `${'Un exemple inventé, un passage fragile. '.repeat(7)}squiggle.fr/glossaire/faux-dilemme?ref=bluesky`;
    expect(filterPost(input(long)).reasons.some((r) => r.startsWith('trop long pour bluesky'))).toBe(true);
    expect(filterPost(input(long, { network: 'threads', text: long.replace('?ref=bluesky', '?ref=threads') })).reasons).toEqual([]);
  });

  it('refuses the same opening twice and the same source twice a day on a network', () => {
    const others = [{ network: 'threads' as const, text: GOOD.replace('bluesky', 'threads'), day: '2026-11-29', sourceId: 'glossaire/autre' }];
    expect(filterPost(input(GOOD, { others })).reasons).toContain('même accroche qu’une autre publication');
    const sameDay = [{ network: 'bluesky' as const, text: 'Autre chose entièrement.', day: '2026-11-30', sourceId: fauxDilemme.id }];
    expect(filterPost(input(GOOD, { others: sameDay })).reasons).toContain('déjà une publication sur cette source ce jour-là sur ce réseau');
  });
});

describe('typography', () => {
  it('sets the site’s typography and leaves links alone', () => {
    expect(typography('C\'est "faux" ? Oui: squiggle.fr/analyser?ref=x')).toBe('C’est «\u00a0faux\u00a0»\u00a0? Oui\u00a0: squiggle.fr/analyser?ref=x');
  });

  it('reads the opening sentence for repeats, whatever its accents or case', () => {
    expect(hook('Un rayon VIDE, un mercredi. Suite')).toBe(hook('un rayon vide un mercredi ! autre'));
  });
});
