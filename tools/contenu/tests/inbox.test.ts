import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

import type { Ctx } from '../src/context';
import { readOwnerMail } from '../src/inbox';

// The routine's database is Node's own SQLite (22.13 and later, the VPS runs 24).
const sqlite = await import('node:sqlite').then(
  () => true,
  () => false,
);
const { Db } = sqlite ? await import('../src/db') : ({} as typeof import('../src/db'));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** A daily run reading one reply, with Cloudflare, Postiz and the model answered in process. */
async function read(reply: string, launchWaiting: boolean) {
  const db = Db.memory();
  if (launchWaiting)
    db.run(
      "INSERT INTO posts (id, week, network, slot_at, pillar, angle, source_id, text, status, created_at, num) VALUES ('p1', '2026-11-02', 'x', '2026-11-03T11:15:00.000Z', 'notion', 'exemple', 'n', 'Texte', 'en_attente', '2026-10-31T08:00:00.000Z', 1)",
    );
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/keys?')) return json({ result: [{ name: 'reponse:1:a' }] });
    if (url.includes('/values/')) return json({ receivedAt: '2026-10-31T09:00:00.000Z', from: 'owner', subject: 'Re: lancement', text: reply });
    if (url.endsWith('/integrations')) return json([]);
    if (url.endsWith('/key')) return json({ data: { usage: 0, limit: null } });
    if (url.endsWith('/chat/completions')) return json({ choices: [{ message: { content: '{"categorie": "autre"}' }, finish_reason: 'stop' }] });
    throw new Error(`unexpected request: ${url}`);
  }) as typeof globalThis.fetch;
  const ctx = {
    db,
    secrets: { cfRepliesNamespace: 'ns', cfAccount: 'acct', cfToken: 't', postizUrl: 'https://postiz.test', postizKey: 'k', openrouterKey: 'k' },
    paths: { data: '', repo: fileURLToPath(new URL('../../..', import.meta.url)) },
    dry: true,
    noMail: true,
    now: new Date('2026-10-31T10:00:00.000Z'),
    runId: 1,
    steps: [],
    fetch,
    log: () => {},
  } as unknown as Ctx;
  await readOwnerMail(ctx);
  return db.get<{ category: string; outcome: string }>('SELECT category, outcome FROM owner_mail')!;
}

describe.skipIf(!sqlite)('the owner’s reply, read by the daily run', () => {
  it('takes « ok tout part » as the launch’s approval', async () => {
    const mail = await read('ok tout part', true);
    expect(mail.category).toBe('reponse_courte');
    expect(mail.outcome).toMatch(/^lancement : \(à blanc\) 1 publications auraient été programmées/);
  });

  it('says a reply was not understood while the launch waits, never files it in silence', async () => {
    const unclear = await read('ok mais pas celle de jeudi', true);
    expect(unclear.outcome).toContain('« ok mais pas celle de jeudi » pas compris, rien n’est appliqué : merci de répondre « ok » ou « ok sauf N »');
    expect(unclear.outcome).not.toContain('lancement :');
    const other = await read('Je regarde ça ce soir.', true);
    expect(other.outcome).toBe('le lancement attend toujours votre accord : merci de répondre « ok » ou « ok sauf N »');
  });
});
