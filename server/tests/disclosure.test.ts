/**
 * The public pages name the model from `HOSTED_ANALYSIS`; the deployment
 * names it in `wrangler.jsonc`. If the two ever differ, the transparency page
 * is describing a service that does not exist, so this pins them together,
 * and pins the hosts the pages name to the ones every request is routed to.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { HOSTED_ANALYSIS, OPENROUTER_WEB_SEARCH } from '@squiggle/shared';
import { createHostedLlm } from '../src/index';
import { parseJsonc } from '../scripts/config.mjs';

describe('hosted disclosure', () => {
  it('is the model the server defaults to', () => {
    expect(createHostedLlm({ OPENROUTER_API_KEY: 'k' })?.getModel()).toBe(HOSTED_ANALYSIS.model);
  });

  it('names exactly the hosts every hosted request is pinned to, in the order they are tried', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    }));
    try {
      await createHostedLlm({ OPENROUTER_API_KEY: 'k' })!.complete({ messages: [{ role: 'user', content: 'q' }] });
    } finally {
      vi.unstubAllGlobals();
    }

    const slugs = HOSTED_ANALYSIS.inferenceHosts.map((host) => host.slug);
    expect(bodies[0].provider).toEqual({
      order: slugs,
      only: slugs,
      // No host outside the list, no host that keeps or trains on the text.
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: 'deny',
      zdr: true,
    });
    expect(slugs).toEqual(['nebius']);
  });

  it('names only European hosts, so the pages can say the model runs in Europe', () => {
    const european = ['Pays-Bas', 'France', 'Allemagne', 'Finlande', 'Suède', 'Irlande', 'Espagne', 'Italie', 'Belgique'];
    for (const host of HOSTED_ANALYSIS.inferenceHosts) expect(european, host.name).toContain(host.country);
  });

  it('names the web search engine the research stage actually calls', () => {
    expect(HOSTED_ANALYSIS.webSearch.engine).toBe(OPENROUTER_WEB_SEARCH.engine);
  });

  it('is the model wrangler.jsonc deploys, in every environment', () => {
    const config = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
    for (const env of ['staging', 'production']) {
      expect(config.env[env].vars.LLM_PROVIDER, env).toBe('openrouter');
      expect(config.env[env].vars.OPENROUTER_MODEL, env).toBe(HOSTED_ANALYSIS.model);
    }
  });
});
