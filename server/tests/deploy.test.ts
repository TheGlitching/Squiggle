/**
 * The deployment topology is configuration, so it can drift from the code it
 * describes without any test noticing. These checks read `wrangler.jsonc`, the
 * Worker's routes and the web app's routes and fail when they disagree.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as entry from '../src/index';
import { DAILY_CRON } from '../src/usage/limits';
import { missingSecrets, parseJsonc, pendingVars } from '../scripts/config.mjs';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const wranglerText = read('../wrangler.jsonc');
const wrangler = parseJsonc(wranglerText);
const patterns: string[] = wrangler.assets.run_worker_first;

/** Does a `run_worker_first` pattern send this path to the Worker? */
function routedToWorker(path: string): boolean {
  return patterns.some((p) => (p.endsWith('/*') ? path.startsWith(p.slice(0, -1)) : path === p));
}

describe('the Worker entry module', () => {
  // workerd reads every named export of the entry as an entrypoint and refuses
  // to start on one that is not a function, which a deploy only finds out late.
  it('exports nothing but functions besides the default handler', () => {
    for (const [name, value] of Object.entries(entry)) {
      if (name !== 'default') expect(typeof value, name).toBe('function');
    }
  });
});

describe('static assets', () => {
  it('serve the built web app with a single-page fallback', () => {
    expect(wrangler.assets.directory).toBe('../web/dist');
    expect(wrangler.assets.not_found_handling).toBe('single-page-application');
  });

  it('let the Worker answer every API path before a file or the fallback can', () => {
    const source = read('../src/index.ts');
    const served = [
      ...source.matchAll(/path === '(\/[^']*)'/g),
      ...source.matchAll(/path\.startsWith\('(\/[^']*)'\)/g),
    ].map((m) => m[1]);
    expect(served).toContain('/health');
    expect(served).toContain('/admin/migrate');
    for (const path of served) expect(routedToWorker(path), path).toBe(true);
  });

  it('keep the installed app’s service worker off every Worker path', () => {
    const worker = read('../../web/sw.js');
    const declared = /const SERVER_PATHS = (\[[^\]]*\]);/.exec(worker)?.[1];
    expect(declared && JSON.parse(declared.replace(/'/g, '"'))).toEqual(patterns);
  });

  it('leave every web route to the static assets', () => {
    const routes = [...read('../../web/src/App.tsx').matchAll(/case '(\/[^']*)'/g)].map((m) => m[1]);
    expect(routes).toContain('/compte');
    for (const path of routes) expect(routedToWorker(path), path).toBe(false);
  });
});

describe('environments', () => {
  const envs = wrangler.env as Record<string, any>;

  it('are staging and production, and nothing is deployed from the bare config', () => {
    expect(Object.keys(envs).sort()).toEqual(['production', 'staging']);
    expect(wrangler.vars).toBeUndefined();
    expect(wrangler.triggers).toBeUndefined();
  });

  it('carry the same vars, since wrangler does not inherit them', () => {
    expect(Object.keys(envs.staging.vars).sort()).toEqual(Object.keys(envs.production.vars).sort());
    for (const name of [
      'WEB_APP_ORIGIN',
      'BREVO_FROM_ADDRESS',
      'LLM_PROVIDER',
      'OPENROUTER_MODEL',
      'STRIPE_PRICE_ID',
      'STRIPE_TEACHER_COUPON_ID',
    ]) {
      expect(envs.production.vars, name).toHaveProperty(name);
    }
  });

  it('keep every secret out of the file', () => {
    for (const env of Object.values(envs)) {
      for (const name of Object.keys(env.vars)) expect(name).not.toMatch(/KEY|SECRET|TOKEN|DATABASE_URL/);
    }
  });

  it('keep every extension origin out of the file, so no real id lands in the repo', () => {
    for (const env of Object.values(envs)) {
      for (const value of Object.values(env.vars)) expect(String(value)).not.toMatch(/-extension:\/\//);
    }
  });

  it('run the retention sweeps', () => {
    for (const env of Object.values(envs)) expect(env.triggers.crons).toEqual(['0 * * * *', DAILY_CRON]);
  });

  it('serve production from the origin the app and the emailed links use', () => {
    const [route] = envs.production.routes;
    expect(route.custom_domain).toBe(true);
    expect(envs.production.vars.WEB_APP_ORIGIN).toBe(`https://${route.pattern}`);
  });
});

describe('the PENDING guard', () => {
  it('reads the placeholders of one environment, ignoring URLs and comments', () => {
    const text = `{
      // PENDING_IN_A_COMMENT
      "env": { "production": { "vars": { "A": "https://x.test", "B": "PENDING_B" } },
               "staging": { "vars": { "A": "ok" } } }
    }`;
    expect(pendingVars(text, 'production')).toEqual(['B']);
    expect(pendingVars(text, 'staging')).toEqual([]);
  });

  it('leaves production with nothing pending', () => {
    expect(pendingVars(wranglerText, 'production')).toEqual([]);
  });
});

describe('the secret guard', () => {
  it('names the required secrets missing from `wrangler secret list`', () => {
    expect(missingSecrets('[{"name":"DATABASE_URL","type":"secret_text"}]')).toEqual(['EXTENSION_CHROME_ORIGIN']);
    expect(missingSecrets('[{"name":"EXTENSION_CHROME_ORIGIN","type":"secret_text"}]')).toEqual([]);
  });
});
