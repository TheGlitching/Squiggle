/** The audience counters: what is sent, and that a page view is never one of them. */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { campaignOf, count, countCampaign, installClick } from '../src/count';
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
    count('click_example');
    expect(fetchMock).toHaveBeenCalledWith('/web/count', {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'click_example' }),
    });
  });
});

describe('campaignOf', () => {
  it('knows the campaigns on the list and nothing else', () => {
    expect(campaignOf('?ref=clemi')).toBe('ref_clemi');
    expect(campaignOf('?ref=linuxfr&x=1')).toBe('ref_linuxfr');
    for (const network of ['bluesky', 'mastodon', 'facebook', 'instagram', 'threads', 'x', 'linkedin']) {
      expect(campaignOf(`?ref=${network}`)).toBe(`ref_${network}`);
    }
    const outreach = ['lel', 'sjowall', 'proches', 'reddit', 'afis', 'presse'];
    for (const ref of [...outreach, ...Array.from({ length: 12 }, (_, i) => `createur${i + 1}`)]) {
      expect(campaignOf(`?ref=${ref}`)).toBe(`ref_${ref}`);
    }
    expect(campaignOf('?ref=createur13')).toBeNull();
    expect(campaignOf('?ref=inconnu')).toBeNull();
    expect(campaignOf('?ref=')).toBeNull();
    expect(campaignOf('')).toBeNull();
  });

  it('counts the campaign a page was opened from, and nothing for a plain visit', () => {
    const { calls } = installFetch(() => undefined);
    window.history.pushState({}, '', '/enseignants?ref=clemi');
    countCampaign();
    window.history.pushState({}, '', '/enseignants');
    countCampaign();
    expect(counted(calls)).toEqual(['ref_clemi']);
  });
});

describe('pages', () => {
  it('counts no page view: visits are read in Cloudflare Web Analytics', () => {
    const { calls } = installFetch(() => undefined);
    window.history.pushState({}, '', '/enseignants');
    render(<App />);
    expect(counted(calls)).toEqual([]);
  });
});

describe('clicks', () => {
  it('names the install button by its store', () => {
    expect(installClick(FIREFOX_URL)).toBe('click_install_firefox');
    expect(installClick(CHROME_URL)).toBe('click_install_chrome');
  });

  it('counts the teacher access request', async () => {
    const { calls } = installFetch(() => undefined);
    render(<Enseignants />);
    const [request] = screen.getAllByRole('link', { name: 'Activer l’accès enseignant' });
    request.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(request);
    expect(counted(calls)).toEqual(['click_teacher_access']);
  });
});
