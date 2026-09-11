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
