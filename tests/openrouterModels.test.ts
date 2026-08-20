import { describe, expect, it } from 'vitest';
import { listOpenRouterModels } from '../src/client/openrouter';
import { groupOpenRouterModels } from '../src/ui/components/ByokSettingsModal';

/**
 * OpenRouter's model ids are not predictable from the model name: the "latest"
 * alias for DeepSeek V4 Flash exists only as `~deepseek/deepseek-v4-flash-latest`,
 * tilde and all, and the API rejects a request for the bare form with
 * "[BYOK - openrouter] deepseek/deepseek-v4-flash-latest is not a valid model
 * ID". The picker therefore offers the live catalogue, and these tests pin
 * that the exact ids survive the fetch, untrimmed.
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

describe('groupOpenRouterModels', () => {
  it('groups by author and sorts ids within a group', () => {
    const groups = groupOpenRouterModels([
      { id: 'openai/gpt-4o', name: 'GPT-4o', author: 'openai' },
      { id: '~deepseek/deepseek-v4-flash-latest', name: 'DeepSeek V4 Flash Latest', author: 'deepseek' },
      { id: 'deepseek/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash 0731', author: 'deepseek' }
    ]);

    const deepseek = groups.find((g) => g.author === 'deepseek')!;
    expect(deepseek.models.map((m) => m.id)).toEqual([
      'deepseek/deepseek-v4-flash-0731',
      '~deepseek/deepseek-v4-flash-latest'
    ]);
    expect(groups.map((g) => g.author)).toEqual(['deepseek', 'openai']);
  });
});