/**
 * The public pages name the model from `HOSTED_ANALYSIS`; the deployment
 * names it in `wrangler.jsonc`. If the two ever differ, the transparency page
 * is describing a service that does not exist, so this pins them together.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HOSTED_ANALYSIS } from '@squiggle/shared';
import { DEFAULT_OPENROUTER_MODEL } from '../src/index';

describe('hosted disclosure', () => {
  it('is the model the server defaults to', () => {
    expect(DEFAULT_OPENROUTER_MODEL).toBe(HOSTED_ANALYSIS.model);
  });

  it('is the model wrangler.jsonc deploys', () => {
    const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    expect(config).toMatch(/"LLM_PROVIDER":\s*"openrouter"/);
    expect(config).toContain(`"OPENROUTER_MODEL": "${HOSTED_ANALYSIS.model}"`);
  });
});
