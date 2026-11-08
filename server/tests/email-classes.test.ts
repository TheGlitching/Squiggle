/**
 * Which e-mails exist, and which need an accord. A commercial e-mail to a
 * private person needs prior accord: `mail/commercial.ts` is its only door, and
 * a new sender anywhere else fails here until it says which kind it is.
 */
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sendCommercial } from '../src/mail/commercial';
import { magicLogin, makeTestEnv, type TestEnv } from './helpers';

const COMMERCIAL = { subject: 'Exercice', html: '<p>Exercice</p>', text: 'Exercice' };

const send = (env: TestEnv, userId: string) =>
  sendCommercial({ db: env.db, email: env.email, webAppOrigin: env.webAppOrigin }, userId, COMMERCIAL);

function post(env: TestEnv, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return env.handler(
    new Request(`${env.webAppOrigin}${path}`, {
      method: 'POST',
      headers: { origin: env.webAppOrigin, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

async function signedIn(env: TestEnv, email: string, consent: boolean) {
  const { sessionCookie } = await magicLogin(env, email);
  const user = await env.db.getUserByEmail(email);
  if (consent) await post(env, '/web/account/marketing', { consent: true }, { cookie: sessionCookie });
  return { sessionCookie, id: user!.id };
}

describe('the e-mails the server sends', () => {
  it('are the known service messages, and the commercial door', () => {
    const root = new URL('../src/', import.meta.url);
    const senders = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /\bemail\.send\(/.test(readFileSync(new URL(file, root), 'utf8')))
      .sort();
    expect(senders).toEqual(['account/manage.ts', 'auth/magicLink.ts', 'mail/commercial.ts', 'mail/inbound.ts']);
  });
});

describe('the accord for commercial e-mail', () => {
  it('starts absent, so a commercial message does not leave', async () => {
    const env = makeTestEnv();
    const { sessionCookie, id } = await signedIn(env, 'marie@example.com', false);
    const account = await env.handler(
      new Request(`${env.webAppOrigin}/web/account`, { headers: { origin: env.webAppOrigin, cookie: sessionCookie } }),
    );
    expect(((await account.json()) as { marketingConsentAt: unknown }).marketingConsentAt).toBeNull();

    const before = env.email.sent.length;
    expect(await send(env, id)).toBe(false);
    expect(env.email.sent.length).toBe(before);
  });

  it('is dated, keeps its first date, and can be taken back from the account', async () => {
    const env = makeTestEnv();
    const { sessionCookie, id } = await signedIn(env, 'marie@example.com', false);
    const change = async (consent: unknown) => post(env, '/web/account/marketing', { consent }, { cookie: sessionCookie });

    const first = env.clock.now();
    expect(await (await change(true)).json()).toEqual({ ok: true, marketingConsentAt: first });
    env.clock.advance(1000);
    expect(await (await change(true)).json()).toEqual({ ok: true, marketingConsentAt: first });
    expect(await send(env, id)).toBe(true);

    expect(await (await change(false)).json()).toEqual({ ok: true, marketingConsentAt: null });
    expect(await send(env, id)).toBe(false);
    // What shows that the earlier message was allowed survives the withdrawal.
    expect(await env.db.getUserById(id)).toMatchObject({ marketingConsentAt: first, marketingWithdrawnAt: env.clock.now() });

    expect((await change('yes')).status).toBe(400);
  });

  it('needs a session to change', async () => {
    const env = makeTestEnv();
    expect((await post(env, '/web/account/marketing', { consent: true })).status).toBe(401);
  });

  it('comes from a ticked box only once the mailbox has signed in, and says so in the code e-mail', async () => {
    const env = makeTestEnv();
    await post(env, '/auth/magic-link', { email: 'marie@example.com', marketing: true });
    const mail = env.email.sent.at(-1)!;
    expect(mail.html).toContain('La case pour recevoir');
    expect(await env.db.getUserByEmail('marie@example.com')).toBeNull();

    const code = /<strong>(\w+)<\/strong>/.exec(mail.html)![1];
    expect((await post(env, '/auth/magic-link/verify', { code })).status).toBe(200);
    expect((await env.db.getUserByEmail('marie@example.com'))?.marketingConsentAt).toBe(env.clock.now());
  });

  it('is not given by an unticked box, or by anything but a real true', async () => {
    const env = makeTestEnv();
    for (const [email, marketing] of [['a@example.com', undefined], ['b@example.com', 'true']] as const) {
      await post(env, '/auth/magic-link', { email, marketing });
      const mail = env.email.sent.at(-1)!;
      expect(mail.html).not.toContain('La case pour recevoir');
      await post(env, '/auth/magic-link/verify', { code: /<strong>(\w+)<\/strong>/.exec(mail.html)![1] });
      expect((await env.db.getUserByEmail(email))?.marketingConsentAt).toBeNull();
    }
  });
});

describe('the box at Google sign-in', () => {
  const start = (env: TestEnv, query: string, fetchSite: string) =>
    env.handler(
      new Request(`${env.webAppOrigin}/auth/google?${query}`, { headers: { 'sec-fetch-site': fetchSite } }),
    );
  const stateOf = (res: Response) => new URL(res.headers.get('location')!).searchParams.get('state')!;

  it('counts from our own sign-in page, not from a link on another site', async () => {
    const env = makeTestEnv();
    const ours = await env.db.findOAuthPending(stateOf(await start(env, 'marketing=1', 'same-origin')));
    expect(ours?.marketingConsent).toBe(true);
    const theirs = await env.db.findOAuthPending(stateOf(await start(env, 'marketing=1', 'cross-site')));
    expect(theirs?.marketingConsent).toBe(false);
    const unticked = await env.db.findOAuthPending(stateOf(await start(env, 'next=/compte', 'same-origin')));
    expect(unticked?.marketingConsent).toBe(false);
  });
});

describe('a commercial message', () => {
  it('carries the unsubscribe link and the one-click headers', async () => {
    const env = makeTestEnv();
    const { id } = await signedIn(env, 'marie@example.com', true);
    expect(await send(env, id)).toBe(true);

    const token = (await env.db.getUserById(id))!.marketingUnsubToken!;
    const mail = env.email.sent.at(-1)!;
    expect(mail.html).toContain(`${env.webAppOrigin}/desinscription?t=${token}`);
    expect(mail.text).toContain(`${env.webAppOrigin}/desinscription?t=${token}`);
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<${env.webAppOrigin}/web/unsubscribe?t=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('is not sent to an address nobody has proved', async () => {
    const env = makeTestEnv();
    const user = await env.db.createUser({ email: 'x@example.com', emailVerified: false }, env.clock.now());
    await env.db.setMarketingConsent(user.id, true, env.clock.now());
    expect(await send(env, user.id)).toBe(false);
  });
});

describe('POST /web/unsubscribe', () => {
  const oneClick = (env: TestEnv, token: string, headers: Record<string, string> = {}) =>
    env.handler(
      new Request(`${env.webAppOrigin}/web/unsubscribe?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
        body: 'List-Unsubscribe=One-Click',
      }),
    );

  it('withdraws with the token alone, as a mailbox provider posts it, from any origin', async () => {
    const env = makeTestEnv();
    const { id } = await signedIn(env, 'marie@example.com', true);
    const token = (await env.db.getUserById(id))!.marketingUnsubToken!;

    expect((await oneClick(env, token, { origin: 'https://mail.example' })).status).toBe(200);
    expect(await send(env, id)).toBe(false);
    // The same link again, and the same token after a new accord, keep working.
    expect((await oneClick(env, token)).status).toBe(200);
    await env.db.setMarketingConsent(id, true, env.clock.now());
    expect((await env.db.getUserById(id))!.marketingUnsubToken).toBe(token);
    await oneClick(env, token);
    expect(await send(env, id)).toBe(false);
  });

  it('says nothing about a token it does not know, and refuses a malformed one', async () => {
    const env = makeTestEnv();
    const { id } = await signedIn(env, 'marie@example.com', true);
    expect((await oneClick(env, 'AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(200);
    expect(await send(env, id)).toBe(true);
    expect((await oneClick(env, '')).status).toBe(400);
  });

  it('does not open the origin of any other route', async () => {
    const env = makeTestEnv();
    const res = await post(env, '/web/count', { name: 'ref_demo' }, { origin: 'https://mail.example' });
    expect(res.status).toBe(403);
  });
});
