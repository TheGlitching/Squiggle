import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ByokSettingsModal,
  PROVIDER_PRESETS,
  resolveModelSelection,
} from '../src/ui/components/ByokSettingsModal';

/**
 * Choosing a model was a text input with a `datalist`. It looked like a dropdown
 * and behaved like neither: the platform draws no usable affordance, so the list
 * only surfaced if you already knew a model id and started typing it.
 *
 * Replacing it with a real select introduces a quieter hazard, which is what most
 * of these tests are about: a select cannot display a value it has no option for,
 * so a model saved by an earlier build would be swapped for whichever option comes
 * first, and the reader would analyse with a model they never picked.
 */

const gemini = PROVIDER_PRESETS.find((p) => p.id === 'gemini')!;

describe('the model a reader has chosen', () => {
  it('offers the provider catalogue as a real dropdown, not a text field', () => {
    const markup = renderToStaticMarkup(
      <ByokSettingsModal isOpen onClose={() => {}} onSaved={() => {}} />,
    );

    expect(markup).toContain('<select');
    // The escape hatch belongs in the same control, otherwise the list is closed.
    expect(markup).toContain('Autre modèle');
    // The old affordance must be gone, not merely supplemented.
    expect(markup).not.toContain('datalist');
  });

  it('lists every model the selected provider declares', () => {
    const markup = renderToStaticMarkup(
      <ByokSettingsModal isOpen onClose={() => {}} onSaved={() => {}} />,
    );
    const anthropic = PROVIDER_PRESETS.find((p) => p.id === 'anthropic')!;

    for (const model of anthropic.models) {
      expect(markup).toContain(model);
    }
  });

  it('keeps a known model in the dropdown', () => {
    expect(resolveModelSelection(gemini, 'gemini-2.5-pro')).toEqual({
      model: 'gemini-2.5-pro',
      usesCustomModel: false,
    });
  });

  it('keeps a model this build no longer lists rather than substituting one', () => {
    const retired = 'gemini-1.0-ultra';
    expect(gemini.models).not.toContain(retired);

    const selection = resolveModelSelection(gemini, retired);

    expect(selection.model).toBe(retired);
    expect(selection.usesCustomModel).toBe(true);
  });

  it('falls back to the provider default when nothing is stored', () => {
    expect(resolveModelSelection(gemini, undefined)).toEqual({
      model: gemini.defaultModel,
      usesCustomModel: false,
    });
    expect(resolveModelSelection(gemini, '')).toEqual({
      model: gemini.defaultModel,
      usesCustomModel: false,
    });
  });

  it('does not treat an unknown provider as a custom model choice', () => {
    // No preset means no catalogue to contradict, and an empty model is not a
    // choice the reader made - offering the free-text field here would be noise.
    expect(resolveModelSelection(undefined, undefined)).toEqual({
      model: '',
      usesCustomModel: false,
    });
  });

  it('declares a default that its own catalogue contains, for every provider', () => {
    // Otherwise the dropdown opens on a value it cannot show, which is the same
    // silent substitution by another route.
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.models, `${preset.id} default is not in its own list`).toContain(
        preset.defaultModel,
      );
    }
  });
});
