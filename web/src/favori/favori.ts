/**
 * The bookmark "Analyser avec Squiggle": the one script that runs in an
 * article's page, when the reader touches it.
 *
 * `vite.config.ts` bundles this file into a single `javascript:` address
 * (`virtual:favori`), which /favori gives the reader to save as a bookmark.
 * It reads the article (`lecture.ts`), then opens /analyser with it in the
 * fragment (`payload.ts`): no request leaves the page, and nothing is loaded
 * into it, so a site's content policy has nothing to refuse.
 */
import { readPage } from './lecture';
import { favoriFragment } from './payload';

/** The site that gave the bookmark: /favori writes its own origin in here. */
declare const SQUIGGLE_ORIGIN: string;

const banner = document.createElement('div');
banner.setAttribute('role', 'status');
banner.textContent = 'Squiggle lit l’article…';
banner.style.cssText =
  'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 18px;border-radius:10px;background:#0a0a0b;color:#f4f4f5;font:600 16px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)';
document.body.append(banner);

readPage().then(
  (article) => {
    location.href = `${SQUIGGLE_ORIGIN}/analyser${favoriFragment(article)}`;
  },
  () => {
    banner.textContent = 'Squiggle n’a pas pu lire cette page. Copiez le texte, puis collez-le sur squiggle.fr.';
    setTimeout(() => banner.remove(), 6000);
  },
);
