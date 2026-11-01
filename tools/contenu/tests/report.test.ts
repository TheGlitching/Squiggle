import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseCommands } from '../src/inbox';
import type { PostRow } from '../src/posts';
import { buildLaunch, buildReplies, buildReport, plainReason, type ReportInput } from '../src/report';
import type { CommentRow } from '../src/replies';
import type { Facts } from '../src/strategy';
import { checkSummary, jargon } from '../src/summary';

function post(num: number, network: PostRow['network'], slot: string, text: string, extra: Partial<PostRow> = {}): PostRow {
  return {
    id: `p${num}`,
    week: '2026-11-23',
    network,
    slot_at: slot,
    pillar: 'notion',
    angle: 'exemple',
    source_id: 'glossaire/faux-dilemme',
    source_title: 'Faux dilemme',
    text,
    image_url: network === 'instagram' ? 'https://squiggle.fr/og/social/faux-dilemme/1.png https://squiggle.fr/og/social/faux-dilemme/2.png' : null,
    alt: null,
    status: 'propose',
    reason: null,
    postiz_id: null,
    created_at: '2026-11-02T05:00:00Z',
    num,
    ...extra,
  };
}

const facts = {
  week: '2026-11-02',
  google: { impressions: 18, clicks: 0, position: 13.8, impressionsVs4: null, clicksVs4: null },
  networks: {
    bluesky: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
    mastodon: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
    threads: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
    facebook: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
    instagram: { visits: 3, posts: 0, visitsPerPost4w: null, followers: null },
    x: { visits: 0, posts: 0, visitsPerPost4w: null, followers: null },
  },
  networkVisits: { week: 3, previous: null },
  accounts: { week: 3, previous: null },
  tests: [],
  weeksOfData: 1,
} as unknown as Facts;

function input(extra: Partial<ReportInput> = {}): ReportInput {
  return {
    facts,
    strategy: null,
    deep: { subject: { rule: 'brouillon', kind: 'brouillon', slug: 'sondage', reason: '', queries: [] }, production: { label: 'l’article « Un sondage dans un article »' } as never, pr: null, why: 'un article déjà rédigé attendait d’être publié' },
    entering: [
      post(1, 'x', '2026-11-23T11:00:00.000Z', 'Écrans : il faut choisir. Soit on interdit le téléphone, soit on sacrifie une génération.'),
      post(2, 'instagram', '2026-11-25T18:00:00.000Z', 'Deux options, et le reste disparaît. Lien dans la bio.'),
      post(3, 'bluesky', '2026-11-26T17:30:00.000Z', 'Trop long', { status: 'refuse', reason: 'filtre : trop long pour bluesky : 302 sur 300', num: null }),
    ],
    comments: [],
    toRead: {},
    lessons: [],
    mail: [],
    health: { reserve: { bluesky: null, mastodon: null, threads: null, facebook: null, instagram: null, x: null }, failed: [], disconnected: [], spend: { openrouter: 0.03, x: 0 }, paused: false, draftMode: false },
    steps: [],
    now: new Date('2026-11-02T05:00:00Z'),
    dry: true,
    ...extra,
  };
}

describe('the weekly report', () => {
  const report = buildReport(input(), { essentiel: ['Une semaine calme.', 'Deux publications entrent dans la file.'], lecture: 'Instagram apporte les seules visites.' });
  // `RENDU=<file>` keeps the rendering, to look at it in a browser.
  if (process.env.RENDU) writeFileSync(process.env.RENDU, report.html);

  it('says once that it is a dry run, then the essential, then what is expected', () => {
    expect(report.subject).toContain('du 26 octobre au 1er novembre');
    expect(report.html.match(/Version d’essai : rien n’a été publié/g)).toHaveLength(1);
    expect(report.text.indexOf('Une semaine calme.')).toBeLessThan(report.text.indexOf('LES CHIFFRES'));
    expect(report.text).toContain('> 2 publications attendent votre accord : répondez « ok » pour les programmer, ou « ok sauf 1 » pour en écarter une. Sans réponse, rien ne part. Une décision vous attend, juste en dessous.');
    expect(report.subject).toContain('2 publications à valider, 1 décision à prendre');
  });

  it('numbers each post entering the queue, groups them by day, and shows its image as a thumbnail', () => {
    expect(report.text).toContain('[1] X, 12 h');
    expect(report.text).toContain('--- Lundi 23 novembre ---');
    expect(report.html).toContain('<img src="https://squiggle.fr/og/social/faux-dilemme/1.png" width="88"');
    expect(report.html).toContain('+1 image');
    expect(report.text).toContain('« retire 1 »');
  });

  it('says a refused post plainly, at the bottom', () => {
    expect(report.text).toContain('Bluesky jeudi 26 novembre, refusée par le contrôle : trop longue pour ce réseau');
    expect(plainReason('relecture : relecture impossible : réponse coupée')).toBe('la relecture n’a pas pu se faire');
  });

  it('keeps empty sections to one line, and says too little data once', () => {
    expect(report.text).toContain('RÉPONSES À FAIRE\n\nRien cette semaine.');
    expect(report.text.match(/trop peu de semaines/g)).toHaveLength(1);
    expect(report.text).toContain('Santé : tout va bien.');
  });

  it('carries no internal word', () => {
    // Postiz and GitHub are the owner's own apps, named where they are used.
    const visible = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/Postiz|GitHub/g, ' ');
    expect(jargon(visible(report.text))).toBeNull();
    expect(jargon(visible(report.html.replace(/<style>[\s\S]*<\/style>/, '')))).toBeNull();
  });
});

describe('the launch e-mail', () => {
  it('shows every held post with its number, the story among them, and asks for « ok » before anything goes out', () => {
    const held = [
      post(1, 'x', '2026-11-03T11:00:00.000Z', 'Écrans : il faut choisir.', { status: 'en_attente' }),
      post(2, 'instagram', '2026-11-04T18:00:00.000Z', 'Deux options. Lien dans la bio.', { status: 'en_attente' }),
      post(3, 'instagram', '2026-11-04T20:00:00.000Z', 'Faux dilemme. Lisez ceci.', { status: 'en_attente', angle: 'story', image_url: 'https://squiggle.fr/og/social/faux-dilemme/story.png' }),
    ];
    const launch = buildLaunch(held, false);
    expect(launch.text).toContain('Répondez « ok » pour tout programmer, ou « ok sauf 1 »');
    expect(launch.text).toContain('[3] Instagram story');
    expect(launch.html).toContain('Story, l’image seule');
    expect(launch.html).toContain('story.png');
  });
});

describe('a video post', () => {
  it('shows its poster, not the video, and says it is one', () => {
    const video = 'https://squiggle.fr/og/social/faux-dilemme/video.mp4';
    const launch = buildLaunch([post(1, 'bluesky', '2026-11-03T11:15:00.000Z', 'Deux options, vraiment ?', { status: 'en_attente', angle: 'video', image_url: video })], false);
    expect(launch.text).toContain('[1] Bluesky vidéo');
    expect(launch.html).toContain('Bluesky vidéo');
    expect(launch.html).toContain('src="https://squiggle.fr/og/social/faux-dilemme/video.jpg"');
    expect(launch.html).toContain(`href="${video}"`);
    const spoken = buildLaunch([post(1, 'bluesky', '2026-11-03T11:15:00.000Z', 'Deux options, vraiment ?', { status: 'en_attente', angle: 'video', image_url: video.replace('video.mp4', 'video-voix.mp4') })], false);
    expect(spoken.text).toContain('[1] Bluesky vidéo parlée');
    expect(spoken.html).toContain('src="https://squiggle.fr/og/social/faux-dilemme/video.jpg"');
  });
});

describe('the weekly report, with posts still waiting from last week', () => {
  it('shows every post the « ok » would schedule, and says which were already shown', () => {
    const entering = input().entering;
    const old = post(9, 'threads', '2026-11-20T17:30:00.000Z', 'Une question qui attend.', { status: 'en_attente' });
    const report = buildReport(input({ waiting: [old, ...entering.filter((x) => x.num !== null)], expired: 1 }), null);
    expect(report.text).toContain('3 publications attendent votre accord, du 20 novembre au 25 novembre, dont 1 déjà montrée et toujours sans réponse.');
    expect(report.text).toContain('[9] Threads');
    expect(report.text).toContain('1 publication est arrivée à son heure sans votre accord');
  });
});

describe('the daily e-mail of comments', () => {
  const comment = (extra: Partial<CommentRow>): CommentRow => ({
    id: 'c1',
    network: 'mastodon',
    post_ref: 'https://mastodon.social/@squigglefr/1',
    author: 'lectrice@piaille.fr',
    text: 'Ça marche sur téléphone ?',
    created_at: '2026-11-02T08:00:00Z',
    category: 'question',
    draft: 'Oui, sur Android avec Firefox : squiggle.fr/telephone?ref=mastodon',
    draft_status: 'propose',
    actual_reply: null,
    link: 'https://piaille.fr/@lectrice/2',
    ...extra,
  });

  it('gives each message with its link and the reply to post by hand, and the Meta posts to open', () => {
    const mail = buildReplies(
      [comment({}), comment({ id: 'c2', network: 'bluesky', category: 'hostile', draft: null, text: 'Encore de la propagande.', link: 'https://bsky.app/profile/a/post/3' })],
      [{ network: 'threads', url: 'https://www.threads.net/@squiggle/post/x', publishedAt: '2026-10-30T17:30:00Z', added: 2 }],
      3,
      false,
    );
    expect(mail.subject).toBe('Squiggle, réponses à faire : 1 brouillon');
    expect(mail.text).toContain('4 nouveaux messages');
    expect(mail.text).toContain('Réponse proposée : « Oui, sur Android avec Firefox');
    expect(mail.text).toContain('https://piaille.fr/@lectrice/2');
    expect(mail.text).toContain('Pas de réponse : ne pas entrer dans l’échange.');
    expect(mail.text).toContain('Threads : 2 nouveaux commentaires sous la publication du vendredi 30 octobre');
    expect(mail.text).toContain('3 publications attendent toujours votre accord');
    expect(mail.html).toContain('href="https://bsky.app/profile/a/post/3"');
  });
});

describe('the summary check', () => {
  it('refuses a number the program did not compute, and an internal word', () => {
    expect(checkSummary({ essentiel: ['3 visites.', 'Rien d’autre.'], lecture: '' }, { visites: 3 })).toBeNull();
    expect(checkSummary({ essentiel: ['12 visites.', 'Rien d’autre.'], lecture: '' }, { visites: 3 })).toBe('chiffres non calculés : 12');
    expect(checkSummary({ essentiel: ['Une pull request est ouverte.', 'Rien d’autre.'], lecture: '' }, {})).toBe('mot interne : pull request');
  });
});

describe('short answers', () => {
  it('reads « retire 4 », several numbers, and « oui B », one a line, leaving the rest', () => {
    expect(parseCommands('retire 4')).toEqual({ launch: null, retire: [4], answers: [], unclear: [], rest: '' });
    const c = parseCommands('Retirez la 4 et 7.\nnon b\nMerci, très bien sinon');
    expect(c.retire).toEqual([4, 7]);
    expect(c.answers).toEqual([{ yes: false, letter: 'B' }]);
    expect(c.rest).toBe('Merci, très bien sinon');
    expect(parseCommands('oui A').answers).toEqual([{ yes: true, letter: 'A' }]);
    expect(parseCommands('Je retirerais bien celle sur la notion de jeudi').retire).toEqual([]);
  });

  it('reads the launch’s « ok », with the posts set aside', () => {
    expect(parseCommands('ok').launch).toEqual({ except: [] });
    expect(parseCommands('OK sauf 3 et 5').launch).toEqual({ except: [3, 5] });
    expect(parseCommands('ok pour le lancement').launch).toEqual({ except: [] });
    expect(parseCommands('oui A').launch).toBeNull();
  });

  it('takes a natural agreement as the launch’s « ok », with « sauf N » anywhere in the line', () => {
    for (const reply of ['ok tout part', 'OK, c’est bon pour moi', 'D’accord, merci !', 'Go', 'Validé.', 'oui', 'Parfait, merci beaucoup', 'top, on y va', 'ok pour moi, tout peut partir'])
      expect(parseCommands(reply), reply).toMatchObject({ launch: { except: [] }, unclear: [], rest: '' });
    expect(parseCommands('ok tout part sauf la 3').launch).toEqual({ except: [3] });
    expect(parseCommands('Parfait, sauf 2 et 5, merci').launch).toEqual({ except: [2, 5] });
  });

  it('never takes an agreement with a reserve or a negation for one, and keeps it to say so', () => {
    for (const reply of ['ok mais pas la 3', 'ok sauf celle de jeudi', 'oui, enfin pas tout de suite', 'ok, attendez lundi', 'go sauf', 'ok pas encore']) {
      const c = parseCommands(reply);
      expect(c.launch, reply).toBeNull();
      expect(c.unclear, reply).toEqual([{ kind: 'launch', line: reply }]);
    }
    expect(parseCommands('Merci, très bien sinon')).toMatchObject({ launch: null, unclear: [] });
  });

  it('reads « retire N » and « oui B » with the same tolerance', () => {
    expect(parseCommands('retirez la 4 et la 7, merci').retire).toEqual([4, 7]);
    expect(parseCommands('Retire 4 svp').retire).toEqual([4]);
    expect(parseCommands('retire 4 mais garde la 5')).toMatchObject({ retire: [], unclear: [{ kind: 'retire', line: 'retire 4 mais garde la 5' }] });
    expect(parseCommands('Oui pour la B, merci').answers).toEqual([{ yes: true, letter: 'B' }]);
    expect(parseCommands('non C, c’est bon').answers).toEqual([{ yes: false, letter: 'C' }]);
    expect(parseCommands('non B, pas maintenant').unclear).toEqual([{ kind: 'answer', line: 'non B, pas maintenant' }]);
    expect(parseCommands('oui B mais plus tard')).toMatchObject({ answers: [], launch: null, unclear: [{ kind: 'answer', line: 'oui B mais plus tard' }] });
  });
});
