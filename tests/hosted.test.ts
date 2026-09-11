import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecureKeyStorage } from '../src/crypto/storage';
import {
  beginHostedSignIn,
  completeChromiumAuth,
  describeHostedAccount,
  fetchHostedAccount,
  redeemHostedCode,
  sameP256Jwk,
  signOutHosted,
  type HostedAccount,
} from '../src/hosted/session';
import { HostedRunner } from '../src/hosted/runner';
import type { AnalysisReport } from '@squiggle/shared';

function localStorageMock() {
  const map: Record<string, string> = {};
  return {
    getItem: (k: string) => map[k] ?? null,
    setItem: (k: string, v: string) => {
      map[k] = v;
    },
    removeItem: (k: string) => {
      delete map[k];
    },
    clear: () => {
      for (const k of Object.keys(map)) delete map[k];
    },
    _map: map,
  };
}

let store: ReturnType<typeof localStorageMock>;

beforeEach(() => {
  store = localStorageMock();
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const REPORT = {
  schemaVersion: 1,
  score: 70,
  scoreBand: 'perfectible',
  summary: 'Résumé',
  categories: [],
  findings: [],
  claims: [],
  research: { performed: true, queries: [], withdrawn: [] },
  meta: { model: 'google/gemini-2.5-flash', promptVersion: 'v3', analyzedAt: '', durationMs: 1 },
} as unknown as AnalysisReport;

describe('SecureKeyStorage — hosted credentials', () => {
  it('defaults to BYOK and switches mode', async () => {
    const storage = new SecureKeyStorage('passphrase');
    expect(await storage.getMode()).toBe('byok');
    await storage.setMode('hosted');
    expect(await storage.getMode()).toBe('hosted');
    await storage.setMode('byok');
    expect(await storage.getMode()).toBe('byok');
  });

  it('generates the keypair once, keeps it encrypted, and signs out the token', async () => {
    const storage = new SecureKeyStorage('passphrase');
    const first = await storage.getOrCreateHostedKeyPair();
    const second = await storage.getOrCreateHostedKeyPair();
    expect(second.publicKeyJwk.x).toBe(first.publicKeyJwk.x);

    const raw = store.getItem('squiggle_byok_config') ?? '';
    expect(raw).not.toContain(first.publicKeyJwk.x);

    await storage.saveHostedSession({ token: 'tok-secret-value', keyId: 'key-1' });
    const persisted = store.getItem('squiggle_byok_config') ?? '';
    expect(persisted).not.toContain('tok-secret-value');

    const session = await storage.getHostedSession();
    expect(session?.token).toBe('tok-secret-value');
    expect(session?.keyId).toBe('key-1');
    expect((session?.privateKey as CryptoKey).type).toBe('private');

    await signOutHosted(storage);
    expect(await storage.getHostedSession()).toBeNull();
    expect(store.getItem('squiggle_byok_config') ?? '').not.toContain('tok-secret-value');
  });
});

describe('Chromium bridge landing', () => {
  it('stores the token when pub matches the generated key', async () => {
    const storage = new SecureKeyStorage('passphrase');
    const { publicKeyJwk } = await storage.getOrCreateHostedKeyPair();
    await completeChromiumAuth(storage, {
      token: 'tok',
      keyId: 'kid',
      pub: JSON.stringify(publicKeyJwk),
    });
    const session = await storage.getHostedSession();
    expect(session?.token).toBe('tok');
    expect(session?.keyId).toBe('kid');
  });

  it('refuses a pub that is not this install’s key and stores nothing', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();
    const other = { kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'BBBB' };
    await expect(
      completeChromiumAuth(storage, { token: 'tok', keyId: 'kid', pub: JSON.stringify(other) })
    ).rejects.toThrow();
    expect(await storage.getHostedSession()).toBeNull();
  });

  it('compares JWKs by their coordinates, ignoring member order', () => {
    expect(
      sameP256Jwk(
        { kty: 'EC', crv: 'P-256', x: 'x1', y: 'y1' },
        JSON.stringify({ y: 'y1', x: 'x1', crv: 'P-256', kty: 'EC' })
      )
    ).toBe(true);
    expect(sameP256Jwk({ kty: 'EC', crv: 'P-256', x: 'x1', y: 'y1' }, { x: 'x1', y: 'other' })).toBe(
      false
    );
  });
});

describe('Firefox code redeem', () => {
  it('stores the returned token when publicKeyJwk matches', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();

    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).endsWith('/auth/bridge/redeem')) {
        return jsonResponse({
          ok: true,
          token: 'tok2',
          keyId: 'kid2',
          userId: 'u1',
          publicKeyJwk: (await storage.getOrCreateHostedKeyPair()).publicKeyJwk,
        });
      }
      return jsonResponse({ ok: false, error: 'internal' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    await redeemHostedCode(storage, 'abcd-2345');
    const session = await storage.getHostedSession();
    expect(session?.token).toBe('tok2');
    expect(session?.keyId).toBe('kid2');

    const redeemCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/bridge/redeem'));
    expect(redeemCall?.[1]).toMatchObject({ method: 'POST' });
    // The extension sends no cookie; the code is the credential.
    expect((redeemCall?.[1] as RequestInit | undefined)?.credentials).toBeUndefined();
  });

  it('maps the contract’s error codes to French and stores nothing', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: false, error: 'expired_link', message: 'expired' }, 410))
    );

    await expect(redeemHostedCode(storage, 'ABCD2345')).rejects.toMatchObject({
      code: 'expired_link',
    });
    await expect(redeemHostedCode(storage, 'ABCD2345')).rejects.toThrow(/expir/i);
    expect(await storage.getHostedSession()).toBeNull();
  });

  it('refuses a returned key that is not this install’s', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          ok: true,
          token: 'tok',
          keyId: 'kid',
          userId: 'u1',
          publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'other', y: 'other' },
        })
      )
    );
    await expect(redeemHostedCode(storage, 'ABCD2345')).rejects.toMatchObject({
      code: 'key_mismatch',
    });
    expect(await storage.getHostedSession()).toBeNull();
  });
});

describe('Signed account read', () => {
  it('clears a dead token so the panel falls back to sign-in', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();
    await storage.saveHostedSession({ token: 'revoked', keyId: 'kid' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: false, error: 'invalid_token' }, 401))
    );
    await expect(fetchHostedAccount(storage)).rejects.toMatchObject({ code: 'expired' });
    expect(await storage.getHostedSession()).toBeNull();
  });

  it('signs the request with the install key', async () => {
    const storage = new SecureKeyStorage('passphrase');
    await storage.getOrCreateHostedKeyPair();
    await storage.saveHostedSession({ token: 'tok', keyId: 'kid' });

    const account: HostedAccount = {
      id: 'u1',
      email: 'a@b.fr',
      plan: 'trial',
      planExpiresAt: null,
      usage: { used: 1, limit: 3, remaining: 2, resetsAt: null },
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ok: true, ...account }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchHostedAccount(storage)).toMatchObject({ plan: 'trial' });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer tok');
    expect(headers['x-squiggle-sig']).toBeTruthy();
    expect(headers['x-squiggle-nonce']).toBeTruthy();
  });
});

describe('HostedRunner', () => {
  it('walks the hosted stages and returns the final report', async () => {
    const storage = new SecureKeyStorage('passphrase');
    const { privateKey } = await storage.getOrCreateHostedKeyPair();

    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/v1/analyze/check')) return jsonResponse({ ok: true, hit: false });
      if (target.includes('/v1/analyze/audit')) {
        return jsonResponse({ ok: true, runId: 'r1', report: REPORT, researchable: [] });
      }
      if (target.includes('/v1/analyze/finalize')) {
        return jsonResponse({ ok: true, report: REPORT });
      }
      return jsonResponse({ ok: false, error: 'internal' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    const events: string[] = [];
    const runner = new HostedRunner({ token: 'tok', privateKey }, (e) => events.push(e.stage));
    const result = await runner.analyze({ text: 'Un article', title: 'T' });

    expect(result.score).toBe(70);
    expect(events).toContain('success');
    const auditCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/v1/analyze/audit'));
    const body = JSON.parse((auditCall?.[1] as RequestInit).body as string);
    expect(body.url).toBe('https://current-tab.local');
    expect(body.blocks[0].text).toBe('Un article');
  });
});

describe('Hosted account presentation', () => {
  const base = { id: 'u', email: null, planExpiresAt: null } as const;
  it('names each entitlement state', () => {
    expect(
      describeHostedAccount({ ...base, plan: 'trial', usage: { used: 0, limit: 3, remaining: 3, resetsAt: null } })
        .state
    ).toBe('trial');
    expect(
      describeHostedAccount({ ...base, plan: 'trial', usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } })
        .state
    ).toBe('trial_exhausted');
    expect(
      describeHostedAccount({ ...base, plan: 'active', usage: { used: 1, limit: 5, remaining: 4, resetsAt: 1 } })
        .state
    ).toBe('active');
    expect(
      describeHostedAccount({ ...base, plan: 'active', usage: { used: 5, limit: 5, remaining: 0, resetsAt: 1 } })
        .state
    ).toBe('quota_exhausted');
    expect(
      describeHostedAccount({ ...base, plan: 'none', usage: { used: 0, limit: 0, remaining: 0, resetsAt: null } })
        .state
    ).toBe('lapsed');
  });
});

describe('beginHostedSignIn', () => {
  it('opens the bridge URL carrying the install’s public key', async () => {
    const storage = new SecureKeyStorage('passphrase');
    const created: string[] = [];
    vi.stubGlobal('chrome', {
      runtime: { id: 'ext-123' },
      tabs: { create: (opts: { url: string }) => created.push(opts.url) },
    });

    await beginHostedSignIn(storage);
    expect(created).toHaveLength(1);
    const url = new URL(created[0]);
    expect(url.origin + url.pathname).toBe('https://squiggle.example/pont');
    expect(url.searchParams.get('ext')).toBe('ext-123');
    const pub = url.searchParams.get('pub') ?? '';
    const { publicKeyJwk } = await storage.getOrCreateHostedKeyPair();
    expect(JSON.parse(pub).x).toBe(publicKeyJwk.x);
  });
});
