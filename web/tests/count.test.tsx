/** The audience counters: what is sent, and how a visit's origin is reduced before it leaves the page. */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUDIENCE_METRIC_NAMES } from '@squiggle/shared/src/hosted/audience';

import { App } from '../src/App';
import { campaignOf, count, entryOf, installClick, viewOf } from '../src/count';
import { CHROME_URL, FIREFOX_URL } from '../src/install';
import { Enseignants } from '../src/pages/Enseignants';
import { installFetch } from './helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const counted = (calls: Array<{ url: string; body: unknown }>) =>
  calls.filter((call) => call.url.endsWith('/web/count')).map((call) => (call.body as { name: string }).name);

describe('count', () => {
  it('sends the name alone, without the cookie, and survives the request failing', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('offline');
    });
    vi.stubGlobal('fetch', fetchMock);
    count('view_tarifs');
    expect(fetchMock).toHaveBeenCalledWith('/web/count', {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'view_tarifs' }),
    });
  });
});

describe('entryOf', () => {
  const entry = (referrer: string, search = '') => entryOf(referrer, 'squiggle.fr', search);

  it('reduces the referring address to a kind of site', () => {
    expect(entry('')).toBe('entry_direct');
    expect(entry('https://www.google.fr/')).toBe('entry_search');
    expect(entry('https://www.qwant.com/?q=squiggle')).toBe('entry_search');
    expect(entry('https://addons.mozilla.org/fr/firefox/addon/squiggle-analysis/')).toBe('entry_store');
    expect(entry('https://chromewebstore.google.com/detail/x')).toBe('entry_store');
    expect(entry('https://www.ac-versailles.fr/')).toBe('entry_edu');
    expect(entry('https://eduscol.education.gouv.fr/')).toBe('entry_edu');
    expect(entry('https://www.clemi.fr/')).toBe('entry_edu');
    expect(entry('https://mastodon.social/@someone')).toBe('entry_social');
    expect(entry('https://www.linkedin.com/feed/')).toBe('entry_social');
    expect(entry('https://linuxfr.org/news/x')).toBe('entry_other');
    // A look-alike host is not the site it imitates.
    expect(entry('https://google.fr.example.net/')).toBe('entry_other');
    expect(entry('https://notclemi.fr/')).toBe('entry_other');
  });

  it('does not count a move inside the site or a return from our own flows', () => {
    expect(entry('https://squiggle.fr/tarifs')).toBeNull();
    expect(entry('https://checkout.stripe.com/c/pay/x')).toBeNull();
    expect(entry('https://accounts.google.com/')).toBeNull();
    expect(entry('', '?code=ABCD-EFGH')).toBeNull();
  });
});

describe('campaignOf', () => {
  it('knows the campaigns on the list and nothing else', () => {
    expect(campaignOf('?ref=clemi')).toBe('ref_clemi');
    expect(campaignOf('?ref=linuxfr&x=1')).toBe('ref_linuxfr');
    expect(campaignOf('?ref=inconnu')).toBeNull();
    expect(campaignOf('?ref=')).toBeNull();
    expect(campaignOf('')).toBeNull();
  });
});

describe('viewOf', () => {
  it('names a page by its route, and only from the list the server accepts', () => {
    expect(viewOf('/')).toBe('view_accueil');
    expect(viewOf('/tarifs')).toBe('view_tarifs');
    expect(viewOf('/cgv')).toBe('view_legal');
    expect(viewOf('/legal')).toBeNull();
    expect(viewOf('/nulle-part')).toBe('view_introuvable');
    expect(viewOf('/classe/tableau')).toBe('view_classe');
    expect(viewOf('/enseignants/grille-lecture')).toBe('view_kit');
    expect(viewOf('/glossaire')).toBe('view_glossaire');
    expect(viewOf('/glossaire/faux-dilemme')).toBe('view_glossaire');
    expect(viewOf('/glossaire/nulle-part')).toBe('view_introuvable');
    for (const route of ['/', '/analyser', '/enseignants', '/connexion', '/compte', '/transparence', '/pont', '/x']) {
      expect(AUDIENCE_METRIC_NAMES).toContain(viewOf(route));
    }
    expect(installClick(FIREFOX_URL)).toBe('click_install_firefox');
    expect(installClick(CHROME_URL)).toBe('click_install_chrome');
  });

  it('is counted by the app on every page it shows', async () => {
    const { calls } = installFetch(() => undefined);
    window.history.pushState({}, '', '/enseignants');
    render(<App />);
    expect(counted(calls)).toEqual(['view_enseignants']);
  });
});

describe('clicks', () => {
  it('counts the teacher access request', async () => {
    const { calls } = installFetch(() => undefined);
    render(<Enseignants />);
    const [request] = screen.getAllByRole('link', { name: 'Activer l’accès enseignant' });
    request.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(request);
    expect(counted(calls)).toEqual(['click_teacher_access']);
  });
});
