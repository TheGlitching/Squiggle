/**
 * A YouTube video, as the extension and the server both recognise it.
 *
 * A video reaches the analysis as the text of its captions, read by the
 * extension in the reader's own tab: the server never fetches the video, its
 * audio or its captions. What the two halves share is only this: the address
 * that names a video, and the fact that a text filed under such an address is
 * a spoken transcript rather than a written article. The server reads it from
 * the address it already canonicalises, so no client-declared flag can change
 * which instructions a cached report was produced under.
 */

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
/** The short link the YouTube app shares: `https://youtu.be/<id>?si=…`. */
const SHORT_LINK_HOST = 'youtu.be';
const VIDEO_ID = /^[\w-]{11}$/;

/** The video a YouTube watch, Shorts or live page, or a shared short link, shows; null for any other address. */
export function youtubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (host === SHORT_LINK_HOST) {
    const short = /^\/([\w-]{11})\/?$/.exec(url.pathname);
    return short ? short[1] : null;
  }
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? '';
    return VIDEO_ID.test(id) ? id : null;
  }
  const match = /^\/(?:shorts|live)\/([\w-]{11})\/?$/.exec(url.pathname);
  return match ? match[1] : null;
}

/**
 * The one address a video is analysed under, whichever page it was opened
 * from: a Short, a playlist entry and a link with `&t=90s` are the same video,
 * hence the same cache entry.
 */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Whether a text filed under this address is a video's transcript. */
export function isVideoTranscriptUrl(rawUrl: string): boolean {
  return youtubeVideoId(rawUrl) !== null;
}
