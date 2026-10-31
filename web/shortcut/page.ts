/**
 * The script the iPhone shortcut runs in Safari, in the page the reader has
 * open ("Exécuter du JavaScript sur la page web"): it reads the article as the
 * reader sees it, signed in or not, with the extension's own extractor, and
 * hands back the address of /analyser with the article after the `#`. Nothing
 * here fetches anything; the fragment never reaches a server.
 *
 * `build.mjs` bundles this file into the shortcut. Shortcuts gives it the
 * global `completion`, and stops it if that is not called within its time limit.
 */
import { ArticleExtractor } from '../../shared/src/extract/extractor';
import { FAVORI_PARAM, SHORTCUT_VALUE } from '../src/favori/payload';

declare const completion: (result: string) => void;

const ORIGIN = 'https://squiggle.fr';

const article = new ArticleExtractor(document).extract();
const title = article.metadata.title.trim();
// The heading is sent as the title; the site puts it back at the top of the text.
const blocks = article.blocks.map((block) => block.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
if (blocks[0]?.trim() === title) blocks.shift();
const fields = {
  title,
  text: blocks.join('\n'),
  url: article.metadata.canonicalUrl || location.href,
  // The whole article is here: /analyser starts at once, as for the bookmark.
  [FAVORI_PARAM]: SHORTCUT_VALUE,
};

completion(
  `${ORIGIN}/analyser#${Object.entries(fields)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')}`,
);
