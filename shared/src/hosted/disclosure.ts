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
   * The inference hosts OpenRouter is allowed to route this model to. Empty
   * until the closed list is pinned in the provider preferences of every
   * request; the pages then say, truthfully, that the hosts are chosen by
   * OpenRouter, and name them here the moment they are pinned.
   */
  inferenceHosts: [] as readonly string[],
} as const;
