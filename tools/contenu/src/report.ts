/**
 * The Monday report. Every figure in it is computed by the program; the model
 * only wrote the strategy note's sentences, which were checked against the
 * same figures. Visits per network and accounts are two families of counters
 * the site never links, so the report never ties an account to a network.
 */
import { CAPS, NETWORKS, type Network } from './config';
import type { Step } from './context';
import type { DeepResult } from './deep';
import type { Lesson } from './memory';
import type { PostRow } from './posts';
import type { CommentRow } from './replies';
import type { Facts, Note, StrategyResult } from './strategy';

const PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });

export const parisDate = (iso: string) => PARIS.format(new Date(iso));
const shortDay = (ymd: string) => DAY.format(new Date(`${ymd}T12:00:00Z`));
const signed = (n: number | null) => (n === null ? 'sans comparaison' : `${n > 0 ? '+' : ''}${n} %`);
const money = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

export interface Health {
  reserve: Record<Network, string | null>;
  failed: PostRow[];
  disconnected: string[];
  spend: { openrouter: number; x: number };
  paused: boolean;
  draftMode: boolean;
}

export interface ReportInput {
  facts: Facts | null;
  strategy: StrategyResult | null;
  deep: DeepResult | null;
  entering: PostRow[];
  comments: CommentRow[];
  toRead: Record<string, number>;
  lessons: Lesson[];
  mail: Array<{ text: string; outcome: string }>;
  health: Health;
  steps: Step[];
  now: Date;
  dry: boolean;
}

export function reserveDays(reserve: Record<Network, string | null>, now: Date): Record<Network, number> {
  return Object.fromEntries(NETWORKS.map((n) => [n, reserve[n] ? Math.max(0, Math.floor((Date.parse(reserve[n]!) - now.getTime()) / 86_400_000)) : 0])) as Record<Network, number>;
}

function noteLines(note: Note | null, problem: string | null): string[] {
  if (!note) return [`   La note n’a pas été retenue cette semaine${problem ? ` (${problem})` : ''} : seuls les chiffres calculés ci-dessus font foi.`];
  return [
    ...note.marche.map((l) => `   + ${l}`),
    ...note.marche_pas.map((l) => `   - ${l}`),
    ...(note.cette_semaine.length ? ['   Cette semaine :', ...note.cette_semaine.map((l) => `   . ${l}`)] : []),
  ];
}

export function buildReport(input: ReportInput): { subject: string; text: string } {
  const f = input.facts;
  const days = reserveDays(input.health.reserve, input.now);
  const minReserve = Math.min(...Object.values(days));
  const accepted = input.entering.filter((p) => p.status !== 'refuse');
  const refused = input.entering.filter((p) => p.status === 'refuse');
  const visits = f?.contentVisits;
  const subject = `Squiggle, semaine du ${f ? shortDay(f.week) : '?'} : ${visits === null || visits === undefined ? 'visites non collectées' : `${visits} visites venues du contenu`}, réserve ${minReserve} jours`;

  const out: string[] = [];
  if (input.dry) out.push('COMPTE RENDU À BLANC : rien n’a été programmé, publié ni proposé en pull request. Tout le reste est réel.', '');
  if (input.health.paused) out.push('LA ROUTINE EST SUSPENDUE : elle n’ajoute rien à la file. Pour reprendre : répondre « reprendre » à cet e-mail, ou `contenu reprendre` sur le serveur.', '');

  out.push('1. En une phrase', `   ${input.strategy?.note?.une_phrase || 'Pas de note de stratégie cette semaine.'}`, '');

  out.push('2. Les chiffres (semaine, et écart avec la moyenne des 4 précédentes)');
  if (f?.google) out.push(`   Google      impressions ${f.google.impressions} (${signed(f.google.impressionsVs4)}), clics ${f.google.clicks} (${signed(f.google.clicksVs4)}), position moyenne ${f.google.position === null ? '-' : String(f.google.position).replace('.', ',')}`);
  else out.push('   Google      non collecté');
  if (f) {
    out.push(`   Réseaux     visites ?ref= : ${NETWORKS.map((n) => `${n} ${f.networks[n].visits}`).join(', ')}`);
    out.push(`               publications parties : ${NETWORKS.map((n) => `${n} ${f.networks[n].posts}`).join(', ')}`);
    const perPost = NETWORKS.filter((n) => f.networks[n].visitsPerPost4w !== null);
    if (perPost.length) out.push(`               visites par publication sur 4 semaines : ${perPost.map((n) => `${n} ${String(f.networks[n].visitsPerPost4w).replace('.', ',')}`).join(', ')}`);
    if (f.site) {
      out.push(`   Site        analyses lancées depuis le blog ${f.site.analysesFromBlog}, depuis le glossaire ${f.site.analysesFromGlossary}`);
      out.push(`               comptes créés ${f.site.newAccounts}, abonnés payants ${f.site.paying}`);
    }
    out.push(`   Données     ${Object.entries(f.collected).map(([k, v]) => `${k} : ${v}`).join(' ; ')}`);
  }
  out.push('');

  out.push('3. Ce qui marche, ce qui ne marche pas (note de stratégie)', ...noteLines(input.strategy?.note ?? null, input.strategy?.problem ?? null));
  for (const t of f?.tests ?? []) {
    out.push(`   Test ${t.network} (${t.kind} ${t.value}) : ${t.hypothesis}, semaine ${t.week} sur 4${t.verdict ? `, verdict : ${t.verdict}` : ''}`);
  }
  for (const t of input.strategy?.newTests ?? []) out.push(`   Nouveau test ${t.network} (${t.kind} ${t.value}) : ${t.hypothesis}`);
  if (input.strategy?.note?.propositions.length) {
    out.push('   À décider par vous (rien n’est appliqué sans réponse) :', ...input.strategy.note.propositions.map((p) => `   ? ${p}`));
  }
  out.push('');

  out.push('4. Contenu de fond');
  const d = input.deep;
  if (!d) out.push('   Étape non faite (voir 7).');
  else if (!d.subject) out.push(`   Rien cette semaine : ${d.why}.`);
  else {
    out.push(`   ${d.production?.title ?? d.subject.slug}`);
    out.push(`   ${d.pr ? `Pull request ouverte : ${d.pr.url}` : input.dry ? 'Pull request non ouverte (à blanc). Texte proposé :' : 'Pull request non ouverte.'}`);
    out.push(`   Pourquoi : ${d.why}.`);
    if (input.dry && d.production?.preview) out.push(...d.production.preview.split('\n').map((l) => `   | ${l}`));
    if (d.production?.problems.length) out.push(`   À relire : ${d.production.problems.join(' ; ')}`);
  }
  out.push('');

  out.push(`5. Ce qui entre dans la file${accepted.length ? ` (sortie du ${parisDate(accepted[0].slot_at)} au ${parisDate(accepted[accepted.length - 1].slot_at)})` : ''} : à retirer dans Postiz si besoin, ou en répondant à cet e-mail`);
  if (accepted.length === 0) out.push('   Rien cette semaine.');
  for (const p of accepted) {
    out.push('', `   ${parisDate(p.slot_at)}, ${p.network} (${p.pillar}, ${p.source_id})${p.status === 'brouillon_postiz' ? ' [brouillon Postiz]' : ''}`);
    out.push(...p.text.split('\n').map((l) => `   | ${l}`));
    if (p.image_url) out.push(`   image : ${p.image_url.split(' ').join(', ')}`);
  }
  if (refused.length) {
    out.push('', `   Créneaux laissés vides (${refused.length}), jamais réécrits :`);
    for (const p of refused) out.push(`   - ${parisDate(p.slot_at)}, ${p.network} : ${p.reason}`);
  }
  out.push('');

  out.push('6. Réponses à faire (brouillons, à publier vous-même depuis l’appli)');
  const drafts = input.comments.filter((c) => c.draft);
  if (drafts.length === 0) out.push('   Aucun brouillon.');
  for (const c of drafts) out.push(`   ${c.network}, @${c.author} (${c.category}) : « ${c.text.slice(0, 200)} »`, `   → ${c.draft}`, `   ${c.post_ref}`);
  for (const [network, n] of Object.entries(input.toRead)) out.push(`   ${network} : ${n} commentaire${n > 1 ? 's' : ''} à lire dans l’appli`);
  out.push('');

  out.push('7. Ce que la routine a appris cette semaine');
  if (input.lessons.length === 0 && input.mail.length === 0) out.push('   Rien de nouveau.');
  for (const l of input.lessons) out.push(`   ${l.status === 'proposee' ? '? à confirmer' : '+'} ${l.text} (${l.origin})`);
  for (const m of input.mail) out.push(`   Votre réponse « ${m.text.slice(0, 120)} » : ${m.outcome}`);
  out.push('');

  out.push('8. Santé');
  out.push(`   Réserve : ${NETWORKS.map((n) => `${n} ${days[n]} j`).join(', ')}.`);
  out.push(`   Échecs : ${input.health.failed.length}${input.health.failed.length ? ` (${input.health.failed.map((p) => `${p.network} : ${p.reason}`).join(' ; ')})` : ''}. Réseaux déconnectés : ${input.health.disconnected.join(', ') || 'aucun'}.`);
  out.push(`   Dépenses du mois : OpenRouter ${money(input.health.spend.openrouter)} / ${money(CAPS.openrouterMonthly)}, X ${money(input.health.spend.x)} / ${money(CAPS.xMonthly)}.`);
  if (input.health.draftMode) out.push('   Mode brouillon : les publications entrent dans Postiz en brouillon, à passer en « programmé » à la main (`contenu liberer` pour en sortir).');
  const failedSteps = input.steps.filter((s) => !s.ok);
  out.push(`   Étapes : ${failedSteps.length === 0 ? 'toutes faites' : failedSteps.map((s) => `${s.name} en échec (${s.detail})`).join(' ; ')}.`);
  out.push('');

  out.push('9. Arrêter');
  out.push('   Retirer une publication : la supprimer dans Postiz (téléphone), ou répondre en la décrivant.');
  out.push('   Tout suspendre : répondre « stop » à cet e-mail, ou `contenu pause` sur le serveur.');
  out.push('   Vider la file : `contenu vider-la-file` sur le serveur. Dernier recours : éteindre le VPS depuis l’appli OVH.');
  return { subject, text: out.join('\n') };
}
