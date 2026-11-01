/**
 * "Sur quoi s'appuie le texte" in the panel: the sources the text cites,
 * grouped by nature, and a wrong nature reported only in hosted mode, as one
 * counter holding the nature and nothing of the text.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SourcingEntry } from '@squiggle/shared';

import { SourcingSection } from '../src/ui/components/SourcingSection';
import { reportSourceNature } from '../src/hosted/flag';
import { COUNT_URL } from '../src/hosted/config';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SOURCING: SourcingEntry[] = [
  { blockId: 'b1', quote: 'La fréquentation a doublé', charStart: 0, charEnd: 25, nature: 'aucune' },
  { blockId: 'b2', quote: 'Selon l’Insee', charStart: 40, charEnd: 53, nature: 'statistique-publique' },
  { blockId: 'b3', quote: 'Un proche du dossier', charStart: 90, charEnd: 110, nature: 'temoignage-anonyme' },
  { blockId: 'b4', quote: 'selon la Drees', charStart: 130, charEnd: 144, nature: 'statistique-publique' },
];

let root: Root | null = null;
let container: HTMLDivElement;

function mount(props: Partial<React.ComponentProps<typeof SourcingSection>>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<SourcingSection sourcing={SOURCING} {...props} />));
}

const flags = () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Signaler');

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('SourcingSection', () => {
  it('groups the sources by nature, in the typology’s order, nothing at all last', () => {
    mount({});
    const groups = [...container.querySelectorAll('section > ul > li')];
    expect(groups.map((g) => g.firstElementChild?.firstElementChild?.textContent)).toEqual([
      'Statistique publique',
      'Témoignage anonyme',
      'Aucune source',
    ]);
    expect(groups[0].textContent).toContain('« Selon l’Insee »');
    expect(groups[0].textContent).toContain('« selon la Drees »');
    expect(container.textContent).toContain('sans juger de leur fiabilité');
  });

  it('offers no report without a handler: BYOK mode sends nothing to our server', () => {
    mount({});
    expect(flags()).toHaveLength(0);
  });

  it('reports a nature once, from its group, and thanks the reader', () => {
    const onReport = vi.fn();
    mount({ onReport });
    expect(flags()).toHaveLength(3);
    expect(flags()[1].getAttribute('aria-label')).toBe('Signaler une erreur : ce n’est pas « Témoignage anonyme »');
    act(() => flags()[1].click());
    expect(onReport).toHaveBeenCalledWith('temoignage-anonyme');
    expect(flags()).toHaveLength(2);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Merci, c’est noté.');
  });

  it('is absent when the text cites nothing', () => {
    mount({ sourcing: [] });
    expect(container.textContent).toBe('');
  });
});

describe('reportSourceNature', () => {
  it('sends one counter, without credentials, holding the nature alone', () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    reportSourceNature('personne-nommee', fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(COUNT_URL, expect.objectContaining({ credentials: 'omit' }));
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ name: 'flag_source_personne_nommee' });
  });
});
