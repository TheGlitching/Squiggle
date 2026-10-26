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
   * The inference hosts OpenRouter may run this model on, and no other: the
   * server sends this list as the provider preferences of every hosted
   * request, with no fallback. Only European hosts are listed. Nebius,
   * headquartered in the Netherlands, is the only European host of this model
   * on OpenRouter; when it cannot serve, the analysis fails and the reader is
   * told to retry rather than the text leaving for a host outside Europe.
   * `slug` is OpenRouter's provider slug.
   */
  inferenceHosts: [{ slug: 'nebius', name: 'Nebius', country: 'Pays-Bas' }],
  /**
   * Who runs the web searches of the research stage. OpenRouter's search
   * engines all run in the United States, and none is offered on its European
   * endpoint, so this one is named as a processor outside Europe. It receives
   * the search queries the model writes, never the article, never a reader.
   * The server test pins it to `OPENROUTER_WEB_SEARCH.engine`.
   */
  webSearch: { engine: 'parallel', name: 'Parallel Web Systems', country: 'États-Unis' },
} as const;
