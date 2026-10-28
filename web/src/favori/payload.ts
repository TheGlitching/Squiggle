/**
 * What the bookmark "Analyser avec Squiggle" hands to /analyser.
 *
 * It travels in the address's fragment, after `#`, in the iPhone shortcut's
 * own form (`#title=…&text=…&url=…`, read by `sharedParams` in `paste.ts`): a
 * browser never sends the fragment to any server, so the article goes from the
 * reader's page to the reader's /analyser without passing through ours, exactly
 * as a paste does. `via=favori` tells the page to start the analysis at once.
 */
export const FAVORI_PARAM = 'via';
export const FAVORI_VALUE = 'favori';

export interface FavoriPayload {
  title: string;
  /** The article's address, a label and a cache key as with a paste: nothing fetches it. */
  url: string;
  /** One block of the article per line, as a paste has them. */
  text: string;
}

/** The fragment that carries the article, `#` included. */
export function favoriFragment(article: FavoriPayload): string {
  return `#${new URLSearchParams({ ...article, [FAVORI_PARAM]: FAVORI_VALUE })}`;
}
