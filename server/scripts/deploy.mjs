// Deploys the Worker, which also uploads web/dist as its static assets.
// Run through `npm run deploy:staging` / `npm run deploy:production` from the
// repository root, which build the web app first.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { missingSecrets, pendingVars } from './config.mjs';

const env = process.argv[2];
if (env !== 'staging' && env !== 'production') {
  console.error('usage: deploy.mjs <staging|production>');
  process.exit(2);
}

if (!existsSync(new URL('../../web/dist/index.html', import.meta.url))) {
  console.error('web/dist is missing. Run `npm run build:web` first.');
  process.exit(1);
}

const pending = pendingVars(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), env);
if (pending.length > 0) {
  const list = pending.join(', ');
  // Staging may run with some values undecided (its extension origins match
  // nothing yet); production may not, since a placeholder there is a live bug.
  if (env === 'production') {
    console.error(`Refusing to deploy production: still PENDING in wrangler.jsonc: ${list}`);
    process.exit(1);
  }
  console.warn(`staging still has PENDING values: ${list}`);
}

// Staging may also run without its secrets while it is not deployed; a
// production deploy that cannot even list them is refused rather than guessed.
const listing = spawnSync('npx', ['wrangler', 'secret', 'list', '--env', env, '--format', 'json'], {
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'inherit'],
});
let missing;
try {
  missing = listing.status === 0 ? missingSecrets(listing.stdout) : null;
} catch {
  missing = null;
}
if (missing === null || missing.length > 0) {
  const problem =
    missing === null ? 'could not list its secrets (see above)' : `secret not set: ${missing.join(', ')}`;
  if (env === 'production') {
    console.error(`Refusing to deploy production: ${problem}. See docs/DEPLOYING.md.`);
    process.exit(1);
  }
  console.warn(`staging ${problem}`);
}

const result = spawnSync('npx', ['wrangler', 'deploy', '--env', env], { stdio: 'inherit' });
process.exit(result.status ?? 1);
