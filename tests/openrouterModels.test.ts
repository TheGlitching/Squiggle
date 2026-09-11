import { describe, expect, it } from 'vitest';
import { listOpenRouterModels } from '@squiggle/shared';

/**
 * OpenRouter's model ids are not predictable from the model name: the "latest"
 * alias for DeepSeek V4 Flash exists only as `~deepseek/deepseek-v4-flash-latest`,
 * tilde and all, and the API rejects a request for the bare form with
 * "[BYOK - openrouter] deepseek/deepseek-v4-flash-latest is not a valid model
 * ID". The extension no longer builds a picker from this catalogue (the model
 * is a free-text field now), but the helper is still part of the shared
 * package's public surface, so its contract stays pinned here.
 */
describe('listOpenRouterModels', () => {
  function stubResponse(payload: unknown, ok = true): Response {
    return new Response(JSON.stringify(payload), {
      status: ok ? 200 : 404,
      headers: { 'content-type': 'application/json' }
    });
  }

  it('keeps a tilde-prefixed alias id verbatim so the API accepts it', async () => {
    const models = await listOpenRouterModels(async () =>
      stubResponse({
        data: [
          { id: '~deepseek/deepseek-v4-flash-latest', name: 'DeepSeek V4 Flash Latest' },
          { id: 'deepseek/deepseek-v4-flash-0731', name: 'DeepSeek: DeepSeek V4 Flash 0731' }
        ]
      })
    );

    expect(models.map((m) => m.id)).toContain('~deepseek/deepseek-v4-flash-latest');
    expect(models.map((m) => m.id)).toContain('deepseek/deepseek-v4-flash-0731');
    const alias = models.find((m) => m.id.startsWith('~'))!;
    expect(alias.name).toBe('DeepSeek V4 Flash Latest');
    // The tilde is catalog chrome, not part of the author label used for grouping.
    expect(alias.author).toBe('deepseek');
  });

  it('maps the author as the segment before the first slash', async () => {
    const models = await listOpenRouterModels(async () =>
      stubResponse({ data: [{ id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' }] })
    );
    expect(models[0].author).toBe('anthropic');
  });

  it('returns [] when the endpoint fails, so the static preset takes over', async () => {
    expect(await listOpenRouterModels(async () => stubResponse({}, false))).toEqual([]);
    expect(
      await listOpenRouterModels(async () => {
        throw new Error('network down');
      })
    ).toEqual([]);
    expect(
      await listOpenRouterModels(async () => stubResponse({ nope: true }))
    ).toEqual([]);
  });
});