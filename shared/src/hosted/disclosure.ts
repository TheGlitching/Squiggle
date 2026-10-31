/**
 * What hosted analyses run on, as the public pages must state it.
 *
 * The transparency page's data-flow line and subprocessor list are built from
 * this one constant, and the server's default model is this same value, so a
 * page cannot keep naming a provider the deployment has stopped using. A test
 * in the server suite pins it against `wrangler.jsonc`. It has no imports on
 * purpose: the web app reads it by relative path.
 */
export const HOSTED_ANALYSIS = {
  /** The exact OpenRouter catalogue id; the API rejects anything that is not exactly right. */
  model: 'deepseek/deepseek-v4.1-flash',
  modelLabel: 'DeepSeek V4.1 Flash',
  /**
   * The inference hosts OpenRouter may run this model on, in the order it
   * tries them, and no other: the server sends this list as the provider
   * preferences of every hosted request. European hosts come first. Nebius,
   * headquartered in the Netherlands, is the only European host of this model
   * on OpenRouter; the American hosts behind it take over only when it cannot
   * serve. None is headquartered in China. `slug` is OpenRouter's provider slug.
   */
  inferenceHosts: [
    { slug: 'nebius', name: 'Nebius', country: 'Pays-Bas' },
    { slug: 'deepinfra', name: 'DeepInfra', country: 'États-Unis' },
    { slug: 'coreweave', name: 'CoreWeave', country: 'États-Unis' },
    { slug: 'together', name: 'Together AI', country: 'États-Unis' },
  ],
  /**
   * Who runs the web searches of the research stage. OpenRouter's search
   * engines all run in the United States, and none is offered on its European
   * endpoint, so this one is named as a processor outside Europe. It receives
   * the search queries the model writes, never the article, never a reader.
   * The server test pins it to `OPENROUTER_WEB_SEARCH.engine`.
   */
  webSearch: { engine: 'parallel', name: 'Parallel Web Systems', country: 'États-Unis' },
} as const;

/**
 * What the sound of a recording sent from the site is transcribed by, before
 * its text is analysed like a pasted one. The server sends `model` to
 * OpenRouter's speech-to-text endpoint, pinned to `host` alone and to its
 * zero-retention endpoint, and the public pages name the same host; the file
 * is held in memory for that one call and never written anywhere.
 *
 * `maxSeconds` is the most one transcription covers, hence one analysis: a
 * longer recording is analysed fifteen minutes at a time. `usdPerMinute` is
 * OpenRouter's catalogue price for `model` (checked on 31 October 2026), which
 * is what the owner's page multiplies the transcribed minutes by.
 */
export const HOSTED_TRANSCRIPTION = {
  model: 'mistralai/voxtral-mini-transcribe-3-0',
  modelLabel: 'Voxtral Mini Transcribe 3',
  host: { slug: 'mistral', name: 'Mistral AI', country: 'France' },
  usdPerMinute: 0.0035,
  maxSeconds: 15 * 60,
  /** The one sound format the site sends and the server accepts (`wav.ts`): 16-bit PCM, mono, at this rate. */
  sampleRate: 16_000,
} as const;
