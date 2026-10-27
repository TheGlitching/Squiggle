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
    expect(slugs[0]).toBe('nebius');
  });

  it('caps how hard the model thinks on every hosted request, so the answer keeps its room', async () => {
    // DeepSeek V4.1 Flash reasons at `high` effort unless told otherwise, out
    // of the same output ceiling as the answer: left at that default, the
    // audit could stop mid-report, and the reader was told it was unreadable.
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{' }, finish_reason: 'length' }] }), { status: 200 });
    }));
    let answer;
    try {
      const client = createHostedLlm({ OPENROUTER_API_KEY: 'k' })!;
      answer = await client.complete({ messages: [{ role: 'user', content: 'q' }] });
      await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(bodies).toHaveLength(2);
    for (const body of bodies) expect(body.reasoning).toEqual({ effort: 'low' });
    // A cut-short answer is reported as such, not only as bad JSON.
    expect(answer.finishReason).toBe('length');
  });

  it('tries every European host before any other, and names none in China', () => {
    const european = ['Pays-Bas', 'France', 'Allemagne', 'Finlande', 'Suède', 'Irlande', 'Espagne', 'Italie', 'Belgique'];
    const countries = HOSTED_ANALYSIS.inferenceHosts.map((host) => host.country);
    const firstOutside = countries.findIndex((country) => !european.includes(country));
    expect(firstOutside).toBeGreaterThan(0);
    expect(countries.slice(firstOutside).some((country) => european.includes(country))).toBe(false);
    expect(countries).not.toContain('Chine');
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
