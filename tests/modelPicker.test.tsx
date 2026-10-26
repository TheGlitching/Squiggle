import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ByokSettingsModal, PROVIDER_PRESETS } from '../src/ui/components/ByokSettingsModal';

/**
 * The model is a free-text field, not a list. A curated list rots faster than
 * this build ships, and the reader knows their provider's catalogue better than
 * a preset written months ago. The provider's expected id shape is shown as a
 * greyed placeholder instead, so the field is still self-explanatory.
 */

function renderModal(): string {
  return renderToStaticMarkup(
    <ByokSettingsModal isOpen onClose={() => {}} onSaved={() => {}} />
  );
}

describe('the model a reader enters', () => {
  it('offers a free-text field with the provider’s example as a placeholder', () => {
    const markup = renderModal();

    expect(markup).toContain('placeholder="claude-sonnet-5-5"');
    // The list affordances must be gone, not merely supplemented.
    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('datalist');
    expect(markup).not.toContain('Autre modèle');
  });

  it('declares a distinct, non-empty placeholder for every provider', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.modelPlaceholder, `${preset.id} has no example`).toBeTruthy();
      expect(preset.keyHint, `${preset.id} has no key hint`).toBeTruthy();
    }
    const placeholders = PROVIDER_PRESETS.map((p) => p.modelPlaceholder);
    expect(new Set(placeholders).size).toBe(placeholders.length);
  });
});

describe('the own-key form', () => {
  it('asks for the provider, the key and the model, in that order, and nothing else', () => {
    const markup = renderModal();
    const byok = markup.slice(markup.indexOf('Gratuit avec votre propre clé'));

    const provider = byok.indexOf('Fournisseur');
    const key = byok.indexOf('Clé API');
    const model = byok.indexOf('Modèle');
    expect(provider).toBeGreaterThan(-1);
    expect(key).toBeGreaterThan(provider);
    expect(model).toBeGreaterThan(key);
    expect(byok.match(/<input/g)).toHaveLength(2);
    expect(byok).not.toContain('Obtenir une clé');
  });
});

describe('the settings sheet order', () => {
  it('puts the hosted sign-in above the collapsed BYOK disclosure', () => {
    const markup = renderModal();

    const hosted = markup.indexOf('Se connecter');
    const byok = markup.indexOf('Gratuit avec votre propre clé');
    expect(hosted).toBeGreaterThan(-1);
    expect(byok).toBeGreaterThan(-1);
    expect(hosted).toBeLessThan(byok);
  });

  it('keeps BYOK collapsed by default', () => {
    const markup = renderModal();

    expect(markup).toContain('<details');
    expect(markup).not.toContain('<details open');
  });

  it('still offers every provider once BYOK is expanded', () => {
    const markup = renderModal();

    for (const preset of PROVIDER_PRESETS) {
      expect(markup).toContain(preset.label);
    }
  });
});