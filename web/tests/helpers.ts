/**
 * A fetch stub for the web tests. Every API call the app makes goes through
 * `window.fetch`, so intercepting that one global is enough to drive the pages
 * without a server.
 */
import { vi } from 'vitest';

import type { Account } from '../src/api';

export interface Call {
  url: string;
  method: string;
  body: unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function installFetch(
  route: (call: Call) => Response | undefined,
): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      let body: unknown;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const call: Call = { url, method, body };
      calls.push(call);
      return route(call) ?? jsonResponse({ ok: false, error: 'not_found' }, 404);
    }),
  );
  return { calls };
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'u1',
    email: 'marie@example.com',
    plan: 'trial',
    planExpiresAt: null,
    usage: { used: 0, limit: 3, remaining: 3, resetsAt: null },
    ...overrides,
  };
}

/** An in-memory `Storage`: the test environment's own `localStorage` is Node's, and not usable. */
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** Phone and tablet user agents: Android Chrome (phone and tablet), Android Firefox, iPhone Safari, iPad Chrome. */
export const MOBILE = [
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
];
