/**
 * The pricing surface, in French. The two claims the whole funnel rests on
 * are the free allowance and the subscription allowance, so both are pinned.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Accueil } from '../src/pages/Accueil';

afterEach(cleanup);

describe('Accueil / Tarifs', () => {
  it('offers three free analyses and a five-a-day subscription', () => {
    render(<Accueil />);
    expect(screen.getByText('3 analyses')).toBeInTheDocument();
    expect(screen.getByText('5 analyses / jour')).toBeInTheDocument();
    expect(screen.getByText(/3 analyses offertes/)).toBeInTheDocument();
  });

  it('gives the reader a clear primary call to action', () => {
    render(<Accueil />);
    expect(screen.getAllByRole('link', { name: /commencer|créer un compte|s’abonner/i }).length).toBeGreaterThan(0);
  });
});
