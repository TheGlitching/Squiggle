/** The build's entry for writing each public page as HTML (see `prerender` in `vite.config.ts`). */
import { renderToString } from 'react-dom/server';

import { App } from './App';

export { PUBLIC_PAGES, headFor, sitemap } from './seo';

// Node 25 has a `localStorage` of its own, which warns when read without a file to keep it
// in. The build is not a reader's browser: a page reading it here must find none.
delete (globalThis as { localStorage?: Storage }).localStorage;

export function render(path: string): string {
  return renderToString(<App path={path} />);
}
