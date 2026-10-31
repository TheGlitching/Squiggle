import { describe, expect, it } from 'vitest';

import { ownText, receive, type Env } from '../src/index';

function kv() {
  const store = new Map<string, string>();
  return { store, env: { REPONSES: { put: async (k: string, v: string) => void store.set(k, v) } } as unknown as Env };
}

function mail(opts: { from: string; auth?: string; body?: string; extra?: string }): { from: string; raw: string; rawSize: number } {
  const raw = [
    ...(opts.auth === undefined ? [`Authentication-Results: mx.cloudflare.net; dkim=pass header.d=gmail.com; dmarc=pass header.from=gmail.com; spf=pass smtp.mailfrom=${opts.from}`] : opts.auth ? [`Authentication-Results: ${opts.auth}`] : []),
    `From: Someone <${opts.from}>`,
    'To: routine@squiggle.fr',
    'Subject: Re: Squiggle, semaine du 2 novembre',
    ...(opts.extra ? [opts.extra] : []),
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.body ?? 'stop\n\nLe lun. 2 nov. 2026 à 07:30, Squiggle <no-reply@squiggle.fr> a écrit :\n> 1. En une phrase\n> ...',
  ].join('\r\n');
  return { from: opts.from, raw, rawSize: raw.length };
}

describe('the reply Worker', () => {
  it('keeps what the owner wrote, without the quoted report', async () => {
    const { store, env } = kv();
    expect(await receive(mail({ from: 'denfonteneau@gmail.com' }), env, new Date('2026-11-02T08:00:00Z'))).toBe('kept');
    const [[key, value]] = [...store];
    expect(key.startsWith('reponse:2026-11-02T08:00:00.000Z:')).toBe(true);
    expect(JSON.parse(value)).toMatchObject({ from: 'denfonteneau@gmail.com', text: 'stop' });
  });

  it('drops a stranger, even an authenticated one', async () => {
    const { store, env } = kv();
    const auth = 'mx.cloudflare.net; dkim=pass header.d=example.org; dmarc=pass header.from=example.org';
    expect(await receive(mail({ from: 'someone@example.org', auth }), env)).toBe('not_owner');
    expect(store.size).toBe(0);
  });

  it('drops the owner’s address when Cloudflare did not authenticate it', async () => {
    const { store, env } = kv();
    expect(await receive(mail({ from: 'denfonteneau@gmail.com', auth: '' }), env)).toBe('unauthenticated');
    // A header the sender wrote is not Cloudflare's.
    expect(await receive(mail({ from: 'denfonteneau@gmail.com', auth: 'relay.example; dmarc=pass header.from=gmail.com' }), env)).toBe('unauthenticated');
    expect(await receive(mail({ from: 'denfonteneau@gmail.com', auth: 'mx.cloudflare.net; dkim=pass header.d=spam.example; dmarc=fail' }), env)).toBe('unauthenticated');
    expect(store.size).toBe(0);
  });

  it('drops automatic replies, empty replies and oversized messages', async () => {
    const { store, env } = kv();
    expect(await receive(mail({ from: 'denfonteneau@gmail.com', extra: 'Auto-Submitted: auto-replied' }), env)).toBe('automatic');
    expect(await receive(mail({ from: 'denfonteneau@gmail.com', body: '> only the quote' }), env)).toBe('empty');
    expect(await receive({ ...mail({ from: 'denfonteneau@gmail.com' }), rawSize: 10 * 1024 * 1024 }, env)).toBe('too_large');
    expect(store.size).toBe(0);
  });
});

describe('ownText', () => {
  it('stops at the quote, whatever the client writes above it', () => {
    expect(ownText('Retirez celle de jeudi sur X.\n\nOn Mon, Nov 2, 2026 at 7:30 AM Squiggle wrote:\n> texte')).toBe('Retirez celle de jeudi sur X.');
    expect(ownText('Moins de Threads\r\n-----Original Message-----\r\nFrom: x')).toBe('Moins de Threads');
  });
});
