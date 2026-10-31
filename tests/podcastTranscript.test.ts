/**
 * A podcast episode's own transcript: found from its page, through its feed,
 * and read whatever format the podcast publishes it in.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { probePodcastPage, transcriptCues, transcriptInFeed, type PodcastPage } from '../src/podcast/transcript';

const PAGE: PodcastPage = {
  url: 'https://www.exemple-podcast.fr/episodes/la-reforme-des-retraites/',
  title: 'La réforme des retraites, expliquée | Le Podcast',
  feeds: ['https://feeds.exemple.fr/podcast.xml'],
  audio: ['https://cdn.exemple.fr/ep42.mp3?ref=page'],
};

const item = (inner: string) => `<item>${inner}</item>`;
const feed = (...items: string[]) =>
  `<?xml version="1.0"?><rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Le Podcast</title>${items.join('')}</channel></rss>`;

describe('transcriptInFeed', () => {
  it('finds the episode by its link, and prefers a transcript with times', () => {
    const xml = feed(
      item('<title>Autre épisode</title><link>https://www.exemple-podcast.fr/episodes/autre/</link><podcast:transcript url="https://t.exemple.fr/autre.vtt" type="text/vtt"/>'),
      item(
        '<title><![CDATA[La réforme des retraites, expliquée]]></title><link>https://exemple-podcast.fr/episodes/la-reforme-des-retraites</link>' +
          '<podcast:transcript url="https://t.exemple.fr/42.html" type="text/html" />' +
          '<podcast:transcript url="https://t.exemple.fr/42.srt?a=1&amp;b=2" type="application/x-subrip" />',
      ),
    );
    expect(transcriptInFeed(xml, PAGE)).toEqual({
      url: 'https://t.exemple.fr/42.srt?a=1&b=2',
      type: 'application/x-subrip',
      title: 'La réforme des retraites, expliquée',
    });
  });

  it('finds it by the sound the page plays, then by its title', () => {
    const byAudio = feed(
      item('<title>Ép. 42</title><enclosure url="https://cdn.exemple.fr/ep42.mp3" type="audio/mpeg"/><podcast:transcript url="https://t.exemple.fr/a.json" type="application/json"/>'),
    );
    expect(transcriptInFeed(byAudio, PAGE)?.url).toBe('https://t.exemple.fr/a.json');
    const byTitle = feed(
      item('<title>La réforme des retraites, expliquée</title><podcast:transcript url="https://t.exemple.fr/b.txt" type="text/plain"/>'),
    );
    expect(transcriptInFeed(byTitle, PAGE)?.url).toBe('https://t.exemple.fr/b.txt');
  });

  it('finds nothing for another episode, a short title, or an episode without a transcript', () => {
    expect(transcriptInFeed(feed(item('<title>Retraites</title><podcast:transcript url="https://t/x.vtt" type="text/vtt"/>')), PAGE)).toBeNull();
    expect(transcriptInFeed(feed(item(`<title>x</title><link>${PAGE.url}</link>`)), PAGE)).toBeNull();
    expect(transcriptInFeed('<html>pas un flux</html>', PAGE)).toBeNull();
  });
});

describe('transcriptCues', () => {
  it('reads a subtitle file with its times', () => {
    const srt = '1\n00:00:01,000 --> 00:00:04,000\nBonjour à tous.\n\n2\n00:00:04,500 --> 00:00:09,000\nAujourd’hui, les retraites.\n\n3\n00:01:02,000 --> 00:01:05,000\nC’est historique.\n';
    const cues = transcriptCues(srt, 'application/x-subrip');
    expect(cues[0].start).toBe(1);
    expect(cues.map((c) => c.text).join(' ')).toBe('Bonjour à tous. Aujourd’hui, les retraites. C’est historique.');
  });

  it('reads the Podcasting 2.0 JSON format', () => {
    const json = JSON.stringify({ version: '1.0.0', segments: [{ startTime: 3.5, body: 'Un.' }, { startTime: 7, body: ' ' }, { startTime: 9, body: 'Deux.' }] });
    expect(transcriptCues(json, 'application/json')).toEqual([
      { start: 3.5, text: 'Un.' },
      { start: 9, text: 'Deux.' },
    ]);
  });

  it('reads an HTML or plain transcript as its paragraphs, without markup', () => {
    const html = '<html><head><style>p{}</style><script>x()</script></head><body><p>Bonjour &amp; bienvenue.</p><p>Le chômage a baissé.</p></body></html>';
    expect(transcriptCues(html, 'text/html').map((c) => c.text)).toEqual(['Bonjour & bienvenue.', 'Le chômage a baissé.']);
    expect(transcriptCues('Ligne une.\n\nLigne deux.', 'text/plain').map((c) => c.text)).toEqual(['Ligne une.', 'Ligne deux.']);
  });
});

describe('probePodcastPage', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('reports an episode page’s feed and sound, and passes over an article that has a feed only', () => {
    document.head.innerHTML = '<link rel="alternate" type="application/rss+xml" href="https://feeds.exemple.fr/podcast.xml">';
    expect(probePodcastPage()).toBeNull();
    document.body.innerHTML = '<audio src="https://cdn.exemple.fr/ep42.mp3"></audio>';
    expect(probePodcastPage()).toMatchObject({
      feeds: ['https://feeds.exemple.fr/podcast.xml'],
      audio: ['https://cdn.exemple.fr/ep42.mp3'],
    });
    document.head.innerHTML = '';
    expect(probePodcastPage()).toBeNull();
  });

  it('finds a feed the page names only in its player’s data, as an Ausha page does', () => {
    document.body.innerHTML =
      '<a href="https://audio.ausha.co/JZk2eIjLZaVG.mp3">Écouter</a>' +
      '<script type="application/json">{"show":{"rss":"https://feed.ausha.co/jnO5XSXR49wn"},"x":"https://www.exemple.fr/wp/comments/feed/"}</script>';
    expect(probePodcastPage()?.feeds).toEqual(['https://feed.ausha.co/jnO5XSXR49wn']);
  });
});
