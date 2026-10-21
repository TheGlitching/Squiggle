/**
 * The transparency page is the product's credibility, so what it says about
 * the model is pinned to the one shared constant the server also defaults to:
 * a page that names a provider the deployment no longer uses fails here.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HOSTED_ANALYSIS } from '../../shared/src/hosted/disclosure';
import { Transparence } from '../src/pages/Transparence';

afterEach(cleanup);

describe('Transparence', () => {
  it('shows OpenRouter and the deployed model in the data flow, never Gemini', () => {
    const { container } = render(<Transparence />);
    const text = container.textContent ?? '';
    expect(text).toContain('OpenRouter');
    expect(text).toContain(HOSTED_ANALYSIS.modelLabel);
    expect(text).not.toMatch(/Gemini/);
  });

  it('lists OpenRouter and the inference hosts as subprocessors', () => {
    render(<Transparence />);
    expect(screen.getAllByRole('cell', { name: 'OpenRouter' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Hébergeurs d’inférence/)).toBeInTheDocument();
  });

  it('says the model is open-weight, the data public, and no reader identity is sent', () => {
    const { container } = render(<Transparence />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/poids ouverts/);
    expect(text).toMatch(/articles publics/);
    expect(text).toMatch(/aucune identité de lecteur/);
    expect(text).toMatch(/pas envoyer le\s+texte vers des serveurs en Chine/);
  });

  it('declares that a report holds excerpts, not an index of the address', () => {
    const { container } = render(<Transparence />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/contient des extraits de l’article/);
    expect(text).not.toMatch(/index de l’adresse/);
  });

  it('carries the Limited Use statement and no em dash', () => {
    const { container } = render(<Transparence />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Limited Use/);
    expect(text).not.toContain('—');
  });
});
