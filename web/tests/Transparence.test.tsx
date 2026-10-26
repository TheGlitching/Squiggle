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
  // The model changes over time: the page describes the engine, the privacy policy names its processors.
  it('describes the engine as an AI model and names neither the model nor its gateway', () => {
    const { container } = render(<Transparence />);
    const text = container.textContent ?? '';
    expect(text).not.toContain(HOSTED_ANALYSIS.modelLabel);
    expect(text).not.toMatch(/OpenRouter|DeepSeek|Gemini|poids ouverts/);
    expect(text).toMatch(/modèle d’IA, choisi pour la qualité de son raisonnement/);
    expect(screen.getByRole('cell', { name: 'Fournisseur du modèle d’IA' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute('href', '/confidentialite');
  });

  it('says the data is public and no reader identity is sent', () => {
    const { container } = render(<Transparence />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/articles publics/);
    expect(text).toMatch(/aucune\s+identité de lecteur/);
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
