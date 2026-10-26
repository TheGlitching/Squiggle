/**
 * The analysed article: the site's example text set as a publisher's page, and
 * highlighted by the extension's own content script (`ContentScriptController`),
 * exactly as it is when the background sends it a finished report.
 *
 * Query: `active=<finding id>` focuses that finding, as a click in the panel does;
 * `clean` leaves the page unhighlighted, as it is before any analysis.
 */
import { ContentScriptController } from '../../src/content/contentScript';
import { findingsToHighlightTargets } from '../../src/adapters/findingAdapters';
import { ARTICLE_PARAGRAPHS, ARTICLE_TITLE, FINDINGS } from './fixture';

const params = new URLSearchParams(location.search);

const article = document.querySelector('article')!;
const title = document.createElement('h1');
title.textContent = ARTICLE_TITLE;
article.querySelector('.kicker')!.after(title);
for (const text of ARTICLE_PARAGRAPHS) {
  const p = document.createElement('p');
  p.textContent = text;
  article.append(p);
}

async function main() {
  await document.fonts.ready;
  if (!params.has('clean')) {
    const controller = new ContentScriptController(document, location.href);
    controller.applyHighlights(findingsToHighlightTargets(FINDINGS));
    const active = params.get('active');
    if (active) controller.setActiveFinding(active);
  }
  await new Promise((frame) => requestAnimationFrame(() => requestAnimationFrame(frame)));
  document.documentElement.dataset.ready = 'true';
}

main().catch((err) => {
  document.documentElement.dataset.ready = 'error';
  console.error(err);
});
