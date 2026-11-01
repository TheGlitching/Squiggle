import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { detectSocialPlatform, isSocialHost } from '../shared/src/extract/socialPlatform';
import { SocialExtractor } from '../shared/src/extract/socialExtractor';
import { ContentScriptController } from '../src/content/contentScript';

/**
 * Public posts as the bookmark copies them (`web/src/favori/lecture.ts`), signed
 * out, in Android's web view, on 2026-11-01: the head's preview metadata kept
 * whole, the body cut down to the post's own text (no one else's comment).
 */
function page(name: string): Document {
  const html = readFileSync(join(__dirname, 'fixtures', 'social', `${name}.html`), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

function read(name: string, url: string) {
  const { hostname, pathname } = new URL(url);
  const match = detectSocialPlatform(hostname, pathname);
  if (!match) throw new Error(`${url} is not a post`);
  return new SocialExtractor(page(name), match.platform, url).extract();
}

describe('the address of one post', () => {
  it.each([
    ['https://x.com/NASA/status/2116263878807998722?s=46', 'x'],
    ['https://www.threads.net/@nasa/post/DfKe2cBEYvb?xmt=abc', 'threads'],
    ['https://www.threads.com/@nasa/post/DfKe2cBEYvb', 'threads'],
    ['https://www.instagram.com/p/DcqkO2BljsL/?igsh=xyz', 'instagram'],
    ['https://www.instagram.com/reel/ABC123/', 'instagram'],
    ['https://www.instagram.com/nasa/p/DcqkO2BljsL/', 'instagram'],
    ['https://www.tiktok.com/@nasa/video/7679483952507276558', 'tiktok'],
    ['https://vm.tiktok.com/ZSabc123/', 'tiktok'],
    ['https://www.facebook.com/story.php?story_fbid=1672153010946735&id=100044561550831', 'facebook'],
    ['https://www.facebook.com/NASA/posts/max-power/1672153010946735/', 'facebook'],
    ['https://m.facebook.com/share/p/1AbCdEf/', 'facebook'],
    ['https://fb.watch/abc123/', 'facebook'],
  ])('%s is a %s post', (url, platform) => {
    const { hostname, pathname } = new URL(url);
    expect(detectSocialPlatform(hostname, pathname)?.platform).toBe(platform);
  });

  it.each([
    'https://www.facebook.com/NASA',
    'https://www.facebook.com/cookie/consent',
    'https://www.instagram.com/nasa/',
    'https://www.tiktok.com/@nasa',
    'https://www.threads.com/@nasa',
    'https://x.com/home',
  ])('%s is a social page but not a post', (url) => {
    const { hostname, pathname } = new URL(url);
    expect(detectSocialPlatform(hostname, pathname)).toBeNull();
    expect(isSocialHost(hostname)).toBe(true);
  });

  it('leaves the press alone', () => {
    expect(isSocialHost('www.lemonde.fr')).toBe(false);
    expect(isSocialHost('notx.com')).toBe(false);
    expect(detectSocialPlatform('www.lemonde.fr', '/posts/123456')).toBeNull();
  });
});

describe('a post read off its page, signed out', () => {
  it('X: the whole post, from the metadata, when the layout has no test ids', () => {
    const post = read('x-signed-out-meta', 'https://x.com/NASA/status/2116263878807998722?s=46');
    expect(post?.metadata.title).toBe('Publication X de NASA (@NASA)');
    expect(post?.metadata.siteName).toBe('X');
    expect(post?.cleanText).toMatch(/^MAX POWER, America’s newest aerospace expo/);
    expect(post?.cleanText).toContain('Here\'s what you can expect: https://t.co/MdH9aY5LJ2');
    expect(post?.truncated).toBeUndefined();
  });

  it('Threads: the whole post, not the replies', () => {
    const post = read('threads-signed-out-post', 'https://www.threads.com/@nasa/post/DfKe2cBEYvb');
    expect(post?.metadata.title).toBe('Publication Threads de NASA (@nasa)');
    expect(post?.blocks.map((b) => b.text)).toEqual([
      'Publication Threads de NASA (@nasa)',
      'Watch live as four volunteers exit their simulated Mars habitat after one year. The information gathered from this simulation will help us better prepare for future long-duration space missions.',
      'Tune in today, Oct. 31, at 3 p.m. EDT (1900 UTC).',
    ]);
  });

  it('Instagram: the whole caption the page cuts after one line', () => {
    const post = read('instagram-signed-out-post', 'https://www.instagram.com/p/DcqkO2BljsL/');
    expect(post?.metadata.title).toBe('Publication Instagram de NASA');
    expect(post?.blocks[1].text).toBe('Ad astra ⭐');
    expect(post?.cleanText).toContain('Nancy Grace Roman Space Telescope');
    expect(post?.cleanText).toMatch(/#NASA #Roman #Launch$/);
    // The likes and the date are the page's, not the post's.
    expect(post?.cleanText).not.toContain('likes');
    expect(post?.metadata.canonicalUrl).toBe('https://www.instagram.com/p/DcqkO2BljsL/');
  });

  it('TikTok: the caption, without the counters or a line of interface', () => {
    const post = read('tiktok-signed-out-video', 'https://www.tiktok.com/@nasa/video/7679483952507276558');
    expect(post?.metadata.title).toBe('Publication TikTok de NASA');
    expect(post?.cleanText).toBe('A pretty historic day here at NASA 🏅💫');
  });

  it('Facebook: the start of the post, said to be cut', () => {
    const post = read(
      'facebook-signed-out-post',
      'https://www.facebook.com/story.php?story_fbid=1672153010946735&id=100044561550831',
    );
    expect(post?.truncated).toBe(true);
    expect(post?.metadata.title).toBe('Publication Facebook de NASA - National Aeronautics and Space Administration');
    expect(post?.cleanText).toMatch(/^MAX POWER, America’s newest aerospace expo/);
    expect(post?.cleanText).not.toMatch(/Voir plus|\.\.\.$/);
    expect(post?.cleanText).not.toContain('Publications récentes');
  });

  it('Facebook, signed in: the whole post when the page shows it whole', () => {
    const doc = page('facebook-signed-out-post');
    const cut = Array.from(doc.querySelectorAll('span')).find((s) => s.textContent?.includes('Voir plus'));
    const text = cut?.previousElementSibling;
    if (!cut || !text) throw new Error('the fixture lost its post');
    text.textContent =
      'MAX POWER, America’s newest aerospace expo and air show, is just a week away! This showcase will be packed with events—from aircraft flyovers to a chance to meet NASA astronauts and experts. Here\'s what you can expect, and the whole of it.';
    cut.remove();
    const post = new SocialExtractor(doc, 'facebook', 'https://www.facebook.com/story.php?story_fbid=1672153010946735').extract();
    expect(post?.truncated).toBeUndefined();
    expect(post?.cleanText).toMatch(/the whole of it\.$/);
  });

  it('never reads the metadata of another post than the address names', () => {
    // An in-app navigation can leave the previous post's tags in the head.
    const post = new SocialExtractor(
      page('threads-signed-out-post'),
      'threads',
      'https://www.threads.com/@nasa/post/OtherPost9',
    ).extract();
    expect(post).toBeNull();
  });

  it('a post with no text reads as nothing', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><meta property="og:title" content="TikTok · NASA"><title>TikTok - Make Your Day</title></head><body></body></html>',
      'text/html',
    );
    expect(new SocialExtractor(doc, 'tiktok', 'https://www.tiktok.com/@nasa/video/1234567').extract()).toBeNull();
  });
});

describe('the extension on a post', () => {
  it('reads an Instagram caption as the post', () => {
    const ctl = new ContentScriptController(page('instagram-signed-out-post'), 'https://www.instagram.com/p/DcqkO2BljsL/');
    const article = ctl.detectAndExtract();
    expect(article.detectionMethod).toBe('social-thread');
    expect(article.cleanText).toContain('Nancy Grace Roman Space Telescope');
  });

  it('leaves a cut Facebook post to the page, as before', () => {
    const ctl = new ContentScriptController(
      page('facebook-signed-out-post'),
      'https://www.facebook.com/story.php?story_fbid=1672153010946735&id=100044561550831',
    );
    expect(ctl.detectAndExtract().truncated).toBeUndefined();
  });
});
