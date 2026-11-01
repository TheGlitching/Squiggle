/**
 * The daily check, at 7:00 Paris time. The check itself calls no model: it
 * reads Postiz, the queue, the spending and the site, and sends an e-mail only
 * when an alert fires (plan, section 7). Two follow-ups do use the model, and
 * only when there is something to follow up: a reply from the owner that is
 * not a plain « stop », and a piece of substance that has just gone online.
 */
import { CAPS, MAX_OPEN_CONTENT_PRS, MAX_REMOVALS_PER_WEEK, NETWORKS, RESERVE_ALERT_DAYS, type Network } from './config';
import { addDays, paused, step, type Ctx } from './context';
import { xReadsThisMonth } from './collect';
import { collectMetrics } from './collect/metrics';
import { followDeep, freshSource } from './deep';
import { GitHub } from './github';
import { readOwnerMail } from './inbox';
import { monthlySpend } from './llm';
import { alert, sendMail } from './mail';
import { Postiz } from './postiz';
import { declineFresh, reconcile, reserve, sitePaths } from './posts';
import { buildNotice, parisDate, reserveDays } from './report';

/** Notifications that mean a post did not go out, or a network needs reconnecting. */
const FAILED = /fail|error|échou|erreur|could not|impossible/i;
const DISCONNECTED = /disconnect|reconnect|refresh|expired|expir|token|déconnect/i;

export async function spendThisMonth(ctx: Ctx): Promise<{ openrouter: number; x: number }> {
  const openrouter = await monthlySpend(ctx).then((s) => s.used).catch(() => NaN);
  const month = ctx.now.toISOString().slice(0, 7);
  const x = ctx.db.get<{ usd: number | null }>("SELECT SUM(usd) AS usd FROM spend WHERE service = 'x' AND at LIKE ?", `${month}%`)?.usd ?? 0;
  return { openrouter, x };
}

export async function daily(ctx: Ctx): Promise<void> {
  await step(ctx, 'réponses du propriétaire', () => readOwnerMail(ctx), (n) => `${n} nouvelle${n > 1 ? 's' : ''}`);
  const isPaused = paused(ctx);
  const postiz = new Postiz(ctx);

  const rec = await step(ctx, 'état de la file', () => reconcile(ctx));
  if (rec) {
    for (const p of rec.failed) {
      await alert(ctx, `echec:${p.id}`, `publication échouée sur ${p.network}`, `La publication du ${parisDate(p.slot_at)} sur ${p.network} n’est pas partie.\nMotif donné par le réseau : ${p.reason}\n\nTexte :\n${p.text}\n\nSouvent, rien à faire. Sinon, la reprogrammer dans Postiz.`);
    }
    const removedThisWeek = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM posts WHERE status = 'retire' AND checked_at >= ?", addDays(ctx.now, -7).toISOString())?.n ?? 0;
    if (removedThisWeek > MAX_REMOVALS_PER_WEEK && ctx.db.getKv<boolean>('mode_brouillon') !== true) {
      if (!ctx.dry) ctx.db.setKv('mode_brouillon', true);
      await alert(ctx, 'mode-brouillon', 'passage en mode brouillon', `${removedThisWeek} publications retirées cette semaine. Les prochaines entreront dans Postiz en brouillon, à passer vous-même en « programmé ».\nPour revenir au mode normal : \`contenu liberer\` sur le serveur.`);
    }
  }

  await step(ctx, 'notifications Postiz', async () => {
    const since = ctx.db.getKv<string>('notifications_vues') ?? addDays(ctx.now, -1).toISOString();
    const fresh = (await postiz.notifications()).filter((n) => n.createdAt > since);
    for (const n of fresh) {
      if (DISCONNECTED.test(n.content)) await alert(ctx, `deconnecte:${n.id}`, 'réseau à reconnecter', `Postiz signale : « ${n.content} »\n\nÀ faire : reconnecter ce réseau dans Postiz (social.squiggle.fr, Ajouter un canal).`);
      else if (FAILED.test(n.content)) await alert(ctx, `notif:${n.id}`, 'publication échouée', `Postiz signale : « ${n.content} »\n\nLire le motif dans Postiz ; souvent, rien à faire.`);
    }
    if (fresh.length && !ctx.dry) ctx.db.setKv('notifications_vues', fresh.map((n) => n.createdAt).sort().pop());
    return fresh.length;
  });

  await step(ctx, 'réserve', async () => {
    const enabled = new Set((await postiz.integrations()).filter((i) => !i.disabled).map((i) => i.identifier));
    const days = reserveDays(await reserve(ctx), ctx.now);
    const thin = NETWORKS.filter((n: Network) => enabled.has(n) && days[n] < RESERVE_ALERT_DAYS);
    // Until the first queue is in place, a thin reserve is the expected state, not an alert.
    const started = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM posts WHERE status IN ('programme', 'publie')")?.n ?? 0;
    if (thin.length && started > 0) {
      await alert(ctx, 'reserve', `réserve sous ${RESERVE_ALERT_DAYS} jours`, `Réserve : ${thin.map((n) => `${n} ${days[n]} jours`).join(', ')}.\n${isPaused ? 'La routine est suspendue : répondre « reprendre » pour qu’elle remplisse la file lundi.' : 'Rien à faire si la routine tourne lundi ; sinon la relancer : `contenu hebdo`.'}`);
    }
    return thin.join(', ') || 'au moins 14 jours partout';
  });

  await step(ctx, 'dépenses', async () => {
    const spend = await spendThisMonth(ctx);
    if (spend.openrouter >= CAPS.openrouterMonthly * 0.8) await alert(ctx, 'depense-openrouter', 'dépenses OpenRouter à 80 %', `${spend.openrouter.toFixed(2)} $ sur ${CAPS.openrouterMonthly} $ ce mois-ci. La routine s’arrête seule à 100 %. Vérifier qu’aucune boucle ne tourne.`);
    if (spend.x >= CAPS.xMonthly * 0.8 || xReadsThisMonth(ctx) >= CAPS.xReadsMonthly) await alert(ctx, 'depense-x', 'dépenses X', `X : ${spend.x.toFixed(2)} $ ce mois-ci, dont ${xReadsThisMonth(ctx).toFixed(2)} $ de lectures. Les lectures s’arrêtent à ${CAPS.xReadsMonthly} $.`);
    return `OpenRouter ${spend.openrouter.toFixed(2)} $, X ${spend.x.toFixed(2)} $`;
  });

  await step(ctx, 'lundi manqué', async () => {
    const last = ctx.db.get<{ started: string }>("SELECT started FROM runs WHERE kind = 'hebdo' AND ok = 1 ORDER BY id DESC LIMIT 1");
    const first = ctx.db.get<{ started: string }>('SELECT started FROM runs ORDER BY id LIMIT 1');
    const lastOk = last?.started ?? first?.started;
    if (lastOk && Date.parse(lastOk) < addDays(ctx.now, -8).getTime()) await alert(ctx, 'lundi-manque', 'le lundi n’a pas tourné', `Dernier passage complet le ${parisDate(lastOk)}. La réserve couvre une absence ponctuelle ; sinon relancer : \`contenu hebdo\`.`);
    return lastOk ?? 'aucun';
  });

  await step(ctx, 'visites ?ref=', async () => {
    const out = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM posts WHERE status = 'publie' AND slot_at >= ? AND text LIKE '%?ref=%'", addDays(ctx.now, -14).toISOString())?.n ?? 0;
    if (out === 0) return 'aucune publication avec lien en 14 jours';
    const metrics = await collectMetrics(ctx, 2);
    const visits = NETWORKS.reduce((s, n) => s + (metrics.audience.campaigns[n] ?? 0), 0);
    if (visits === 0) await alert(ctx, 'ref-zero', 'aucune visite ?ref= en 14 jours', `${out} publications avec lien sont parties en 14 jours, et le site ne compte aucune visite venue d’un réseau. Le comptage est sans doute cassé : vérifier /tableau.`);
    return `${visits} visites`;
  });

  await step(ctx, 'contenus à relire', async () => {
    const open = await new GitHub(ctx).contentPulls('open');
    const old = open.filter((p) => Date.parse(p.created_at) < addDays(ctx.now, -14).getTime());
    if (old.length >= MAX_OPEN_CONTENT_PRS) await alert(ctx, 'pr-anciennes', `${old.length} pull requests de contenu en attente`, `Elles attendent depuis plus de 14 jours, et la routine n’en ouvre plus d’ici là :\n${old.map((p) => p.html_url).join('\n')}\n\nÀ relire, ou à fermer.`);
    return `${open.length} ouverte${open.length > 1 ? 's' : ''}`;
  });

  await step(ctx, 'nouvelles pages', async () => {
    const paths = [...(await sitePaths(ctx))].sort();
    const before = ctx.db.getKv<string[]>('sitemap') ?? paths;
    const added = paths.filter((p) => !before.includes(p));
    ctx.db.setKv('sitemap', paths);
    return added.join(', ') || 'aucune';
  });

  const live = await step(ctx, 'contenus publiés', () => followDeep(ctx), (l) => l.map((x) => `${x.slug} ${x.status}`).join(', ') || 'rien de nouveau');
  for (const item of (live ?? []).filter((x) => x.status === 'en_ligne')) {
    if (isPaused) continue;
    const source = freshSource(item.slug, item.kind);
    if (!source) {
      ctx.log(`  ${item.slug} en ligne, mais pas encore dans le clone : déclinaisons au prochain passage`);
      ctx.db.run("UPDATE deep SET status = 'fusionne' WHERE slug = ? AND status = 'en_ligne'", item.slug);
      continue;
    }
    const rows = await step(ctx, `déclinaisons de ${item.slug}`, () => declineFresh(ctx, source), (r) => `${r.filter((p) => p.status !== 'refuse').length} programmées`);
    const accepted = (rows ?? []).filter((p) => p.status !== 'refuse');
    if (accepted.length) {
      const notice = buildNotice(source.title, source.path, accepted, ctx.dry);
      await sendMail(ctx, notice.subject, notice.text, notice.html);
    }
  }
}
