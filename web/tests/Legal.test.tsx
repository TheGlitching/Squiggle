/**
 * The legal pages are what a store reviewer, Google's OAuth review and a
 * consumer read: each lives at its stable URL, names the publisher, and shows
 * nothing for a value not decided yet: no placeholder, no guess.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App';
import { LEGAL_PAGES } from '../src/offer';
import { RETENTION } from '../src/pages/Transparence';

afterEach(cleanup);

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('legal pages', () => {
  it.each(LEGAL_PAGES)('%s renders %s, with no em dash and nothing left provisional', (path, label) => {
    const { container } = renderAt(path);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(label === 'Confidentialité' ? /confidentialité/i : label);
    const text = container.textContent ?? '';
    expect(text).not.toContain('—');
    expect(text).not.toMatch(/à compléter|provisoire|brouillon/);
  });

  it('names the publisher and the host', () => {
    const { container } = renderAt('/mentions-legales');
    const text = container.textContent ?? '';
    expect(text).toContain('Denis Fonteneau');
    expect(text).toContain('830 369 922 00042');
    expect(text).toContain('Directeur de la publication : Denis Fonteneau');
    expect(text).toContain('Cloudflare, Inc., 101 Townsend Street');
    expect(text).toContain('contact@squiggle.fr');
  });

  it('states a net price with the VAT exemption, and no placeholder for an undecided mediator', () => {
    const { container } = renderAt('/cgv');
    const text = container.textContent ?? '';
    expect(text).toContain('4,99 € par mois');
    expect(text).toContain('TVA non applicable, art. 293 B du CGI');
    expect(text).toContain('14 jours');
    expect(text).not.toMatch(/PENDING|médiateur de la consommation/);
    expect(text).toContain('nous répondons sous 30 jours.');
  });

  it('shows no undecided value anywhere on the legal pages', () => {
    for (const [path] of LEGAL_PAGES) {
      const { container } = renderAt(path);
      expect(container.textContent ?? '', path).not.toMatch(/PENDING/);
      cleanup();
    }
    // The publisher's phone row appears only once a number is set.
    renderAt('/mentions-legales');
    expect(screen.queryByText('Téléphone', { selector: 'dt' })).toBeNull();
  });

  it('publishes the same retention table as the transparency page, plus the CNIL', () => {
    const { container } = renderAt('/confidentialite');
    for (const [data] of RETENTION) expect(screen.getAllByText(data).length).toBeGreaterThan(0);
    expect(container.textContent).toContain('CNIL');
    expect(container.textContent).toContain('Data Privacy Framework');
  });

  it('says a report is not a verdict and gives publishers a way to contest it', () => {
    const { container } = renderAt('/conditions');
    const text = container.textContent ?? '';
    expect(text).toMatch(/pas un verdict sur une personne/);
    expect(text).toMatch(/contester/);
  });

  it('sends the first /legal address to the privacy policy', () => {
    renderAt('/legal');
    expect(window.location.pathname).toBe('/confidentialite');
  });
});
