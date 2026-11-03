import { describe, expect, it } from 'vitest';

import type { Ctx } from '../src/context';
import { alertFailures } from '../src/daily';
import type { PostizPost } from '../src/postiz';

// The routine's database is Node's own SQLite (22.13 and later, the VPS runs 24).
const sqlite = await import('node:sqlite').then(
  () => true,
  () => false,
);
const { Db } = sqlite ? await import('../src/db') : ({} as typeof import('../src/db'));

// The two posts of 2 November that Postiz left in error, and the one that went out.
const post = (id: string, network: string, state: PostizPost['state'], error: string | null): PostizPost => ({
  id,
  content: '<p>Un texte <strong>publié</strong></p>',
  publishDate: '2026-11-02T11:00:00.000Z',
  state,
  error,
  integration: { id: `i-${network}`, providerIdentifier: network, name: network },
});
const QUEUE = [
  post('cmvwzp8ja0008o8872hy1mrfm', 'x', 'ERROR', null),
  post('cmvwzp8la0009o8877jck2ae9', 'bluesky', 'ERROR', 'Could not prepare post: Input buffer has corrupt header'),
  post('cmvybpzjj0002p57mm1uxc8sj', 'mastodon', 'PUBLISHED', null),
];

describe.skipIf(!sqlite)('a failed post’s alert', () => {
  const setup = () => {
    const mails: string[] = [];
    const ctx = { db: Db.memory(), now: new Date('2026-11-03T06:00:00.000Z'), dry: false, noMail: true, log: (m: string) => mails.push(m) } as unknown as Ctx;
    return { ctx, mails };
  };

  it('goes once per post, on every later run too', async () => {
    const { ctx, mails } = setup();
    expect(await alertFailures(ctx, QUEUE)).toBe(2);
    expect(mails.join('\n')).toMatch(/publication échouée sur x[\s\S]*Motif donné par Postiz : aucun[\s\S]*Un texte publié/);
    expect(mails.join('\n')).toMatch(/publication échouée sur bluesky[\s\S]*corrupt header/);
    // Past the three days after which an ordinary alert goes again.
    ctx.now = new Date('2026-11-09T06:00:00.000Z');
    expect(await alertFailures(ctx, QUEUE)).toBe(0);
    expect(mails).toHaveLength(2);
  });

  it('keeps the key a post the routine scheduled was already alerted under', async () => {
    const { ctx, mails } = setup();
    ctx.db.run(
      "INSERT INTO posts (id, week, network, slot_at, pillar, angle, source_id, text, status, postiz_id, created_at) VALUES ('b099c2c5', '2026-W45', 'x', '2026-11-02T11:00:00.000Z', 'fond', 'page', 's', 'Le texte de la routine', 'echec', 'cmvwzp8ja0008o8872hy1mrfm', '2026-11-02')",
    );
    ctx.db.run("INSERT INTO alerts (key, sent_at) VALUES ('echec:b099c2c5', '2026-11-03T06:00:00.000Z')");
    expect(await alertFailures(ctx, QUEUE)).toBe(1);
    expect(mails.join('\n')).not.toMatch(/sur x/);
  });
});
