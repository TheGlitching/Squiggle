/**
 * The public pages name the model from `HOSTED_ANALYSIS`; the deployment
 * names it in `wrangler.jsonc`. If the two ever differ, the transparency page
 * is describing a service that does not exist, so this pins them together.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HOSTED_ANALYSIS } from '@squiggle/shared';
import { createHostedLlm } from '../src/index';
import { parseJsonc } from '../scripts/config.mjs';

describe('hosted disclosure', () => {
  it('is the model the server defaults to', () => {
    expect(createHostedLlm({ OPENROUTER_API_KEY: 'k' })?.getModel()).toBe(HOSTED_ANALYSIS.model);
  });

  it('is the model wrangler.jsonc deploys, in every environment', () => {
    const config = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    for (const env of ['staging', 'production']) {
      expect(config.env[env].vars.LLM_PROVIDER, env).toBe('openrouter');
      expect(config.env[env].vars.OPENROUTER_MODEL, env).toBe(HOSTED_ANALYSIS.model);
    }
  });
});
