/**
 * `contenu <command> [--a-blanc]`, run by the systemd timers on the VPS
 * (`systemd/`) or by hand through `bin/contenu`.
 *
 *   quotidien       the daily check (7:00)
 *   hebdo           Monday's run (5:00)
 *   pause           write the PAUSE file: nothing more is added, the queue keeps going out
 *   reprendre       remove it
 *   vider-la-file   pause, and delete every future post the routine scheduled
 *   lancement       prepare the first posts and send them for approval (nothing is scheduled)
 *   lancement-ok    schedule them, as the owner's « ok » does; `lancement-ok sauf 3 5` sets some aside
 *   liberer         leave draft mode (D2 b) after too many removals
 *   lecon-retirer N stop applying lesson N
 *   etat            what the routine holds, without calling anything
 *
 * `--a-blanc` runs for real (collection, model, filter, review, e-mail) but
 * writes nothing to Postiz or GitHub, on a database of its own. `--sans-courriel`
 * prints the e-mails instead of sending them.
 */
import { closeSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { paths, secrets } from './config';
import { pauseFile, paused, type Ctx } from './context';
import { daily } from './daily';
import { Db } from './db';
import { approveLaunch, prepareLaunch } from './launch';
import { emptyQueue } from './posts';
import { weekly } from './weekly';

const COMMANDS = ['quotidien', 'hebdo', 'lancement', 'lancement-ok', 'pause', 'reprendre', 'vider-la-file', 'liberer', 'lecon-retirer', 'etat'] as const;

function lock(dir: string): () => void {
  const file = join(dir, 'contenu.lock');
  try {
    closeSync(openSync(file, 'wx'));
  } catch {
    throw new Error(`une autre exécution tourne (${file}) ; si ce n’est pas le cas, supprimer ce fichier`);
  }
  return () => rmSync(file, { force: true });
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dry = args.includes('--a-blanc');
  const noMail = args.includes('--sans-courriel');
  const command = args.find((a) => !a.startsWith('--')) as (typeof COMMANDS)[number] | undefined;
  if (!command || !COMMANDS.includes(command)) {
    console.error(`usage : contenu <${COMMANDS.join('|')}> [--a-blanc] [--sans-courriel]`);
    return 2;
  }
  const p = paths();
  const db = Db.open(p.data, dry);

  if (command === 'pause' || command === 'reprendre' || command === 'liberer' || command === 'lecon-retirer' || command === 'etat') {
    const ctx = { paths: p };
    if (command === 'pause') writeFileSync(pauseFile(ctx), `Suspendu à la main le ${new Date().toISOString()}\n`);
    if (command === 'reprendre') rmSync(pauseFile(ctx), { force: true });
    if (command === 'liberer') db.setKv('mode_brouillon', false);
    if (command === 'lecon-retirer') db.run("UPDATE lessons SET status = 'retiree' WHERE id = ?", Number(args[1]));
    const posts = db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM posts GROUP BY status');
    const lessons = db.all<{ id: number; status: string; text: string }>("SELECT id, status, text FROM lessons WHERE status != 'retiree' ORDER BY id");
    console.log(JSON.stringify({ suspendu: paused(ctx), modeBrouillon: db.getKv('mode_brouillon') === true, publications: posts, lecons: lessons }, null, 2));
    return 0;
  }

  let unlock: () => void;
  try {
    unlock = lock(p.data);
  } catch (error) {
    // Monday's run can still be going at 7:00: the daily check simply waits for tomorrow.
    console.error((error as Error).message);
    return command === 'quotidien' ? 0 : 1;
  }
  const started = new Date();
  const runId = db.run('INSERT INTO runs (kind, started) VALUES (?, ?)', dry ? `${command}-a-blanc` : command, started.toISOString());
  const ctx: Ctx = { db, secrets: secrets(), paths: p, dry, noMail, now: started, runId, steps: [], fetch: globalThis.fetch, log: (line) => console.log(line) };
  console.log(`contenu ${command}${dry ? ' (à blanc)' : ''}, ${started.toISOString()}`);
  try {
    if (command === 'quotidien') await daily(ctx);
    if (command === 'hebdo') await weekly(ctx);
    if (command === 'lancement') console.log(`${(await prepareLaunch(ctx)).filter((p) => p.status === 'en_attente').length} publications en attente d’accord`);
    if (command === 'lancement-ok') console.log(await approveLaunch(ctx, args.slice(args.indexOf('sauf') + 1).filter((a) => args.includes('sauf') && /^\d+$/.test(a)).map(Number)));
    if (command === 'vider-la-file') {
      writeFileSync(pauseFile(ctx), `Suspendu et vidé à la main le ${started.toISOString()}\n`);
      console.log(`${await emptyQueue(ctx)} publications supprimées de Postiz`);
    }
    const ok = ctx.steps.every((s) => s.ok);
    const cost = db.get<{ usd: number | null }>("SELECT SUM(usd) AS usd FROM spend WHERE service = 'openrouter' AND run_id = ?", runId)?.usd ?? 0;
    db.run('UPDATE runs SET finished = ?, ok = ?, steps = ?, cost_usd = ? WHERE id = ?', new Date().toISOString(), ok ? 1 : 0, JSON.stringify(ctx.steps), cost, runId);
    console.log(`terminé : ${ctx.steps.filter((s) => !s.ok).length} étape(s) en échec, ${cost.toFixed(4)} $ de modèle`);
    return 0;
  } catch (error) {
    db.run('UPDATE runs SET finished = ?, ok = 0, steps = ? WHERE id = ?', new Date().toISOString(), JSON.stringify(ctx.steps), runId);
    console.error(`arrêt : ${(error as Error).stack ?? error}`);
    return 1;
  } finally {
    unlock();
  }
}

process.exitCode = await main();
