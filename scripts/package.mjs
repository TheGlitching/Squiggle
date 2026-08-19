/**
 * Zip each built target into the artefact a store actually accepts.
 *
 * Both stores want the extension's contents at the root of the archive, not a
 * wrapping directory, so this zips from inside each dist directory. It refuses
 * rather than producing an archive a store would reject on upload, because that
 * failure otherwise surfaces halfway through a release with the version already
 * consumed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'packages');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

const targets = ['chrome', 'firefox'];

mkdirSync(outDir, { recursive: true });

for (const target of targets) {
  const dist = join(root, 'dist', target);

  if (!existsSync(join(dist, 'manifest.json'))) {
    throw new Error(`dist/${target} has no manifest.json - run "npm run build:all" first`);
  }

  // Chrome refuses to load an unpacked tree containing a name reserved by the
  // browser, and the store refuses the packed equivalent. The packaging tests
  // assert this too; checking here keeps a manual `npm run package` honest.
  const reserved = [];
  const walk = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_') && entry.name !== '_locales') {
        reserved.push(join(rel, entry.name));
      }
      if (entry.isDirectory()) walk(join(dir, entry.name), join(rel, entry.name));
    }
  };
  walk(dist);
  if (reserved.length > 0) {
    throw new Error(`dist/${target} contains names reserved by the browser: ${reserved.join(', ')}`);
  }

  const archive = join(outDir, `squiggle-${target}-${version}.zip`);
  rmSync(archive, { force: true });

  // -r recurse, -q quiet, -X drop the extra filesystem attributes that make the
  // archive differ between machines for no functional reason.
  execFileSync('zip', ['-rqX', archive, '.'], { cwd: dist, stdio: 'inherit' });

  console.log(`packaged ${archive.replace(`${root}/`, '')}`);
}
