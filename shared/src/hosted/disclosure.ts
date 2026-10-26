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
   * preferences of every hosted request. Nebius, headquartered in the
   * Netherlands, is the only European host of this model on OpenRouter, so it
   * comes first; the American hosts behind it take over when it cannot serve.
   * None is headquartered in China. `slug` is OpenRouter's provider slug.
   */
  inferenceHosts: [
    { slug: 'nebius', name: 'Nebius' },
    { slug: 'deepinfra', name: 'DeepInfra' },
    { slug: 'coreweave', name: 'CoreWeave' },
    { slug: 'together', name: 'Together AI' },
  ],
} as const;
