/**
 * The report's first lines, in plain French: the only part of it the model
 * writes. They are checked like the strategy note: every number must be one the
 * program computed, and no internal word may appear. A summary that fails either
 * check is replaced by sentences the program writes itself.
 */
import type { Ctx } from './context';
import { numbersIn } from './filter';
import { askJson } from './llm';
import { consigne } from './memory';
import type { Decision, ReportInput, Summary } from './report';
import { NETWORK_NAME } from './report';

/** Words that belong to the routine's insides, never to the owner's report. */
const JARGON_WORDS = /pull request|\?ref|ref=|filtre|\bslots?\b|pilier|contentVisits|snapshot|pipeline|json|sqlite|search console|cloudflare|postiz|commande|fichier|\.ts\b|\bkv\b/i;

export function jargon(text: string): string | null {
  return JARGON_WORDS.exec(text)?.[0] ?? /\bPR\b/.exec(text)?.[0] ?? null;
}

export function checkSummary(summary: Summary, facts: unknown): string | null {
  const known = new Set(numbersIn(JSON.stringify(facts).replace(/"/g, ' ')));
  const text = [...summary.essentiel, summary.lecture].join('\n');
  const unknown = numbersIn(text).filter((n) => !known.has(n));
  if (unknown.length) return `chiffres non calculés : ${[...new Set(unknown)].join(', ')}`;
  const word = jargon(text);
  if (word) return `mot interne : ${word}`;
  if (summary.essentiel.length < 2 || summary.essentiel.length > 5) return 'longueur inattendue';
  return null;
}

/** What the summary may say: the week's figures and what the run did, as plain data. */
export function summaryData(input: ReportInput, decisions: Decision[]) {
  const f = input.facts;
  const accepted = input.entering.filter((p) => p.status !== 'refuse');
  return {
    visitesDesReseaux: f?.networkVisits ?? null,
    visitesParReseau: f ? Object.fromEntries(Object.entries(f.networks).map(([n, v]) => [NETWORK_NAME[n as keyof typeof NETWORK_NAME], v.visits])) : null,
    google: f?.google ? { visites: f.google.clicks, apparitions: f.google.impressions } : null,
    comptesCrees: f?.accounts ?? null,
    publicationsParties: f ? Object.values(f.networks).reduce((s, v) => s + v.posts, 0) : null,
    semainesDeDonnees: f?.weeksOfData ?? null,
    publicationsQuiEntrentDansLaFile: accepted.length,
    publicationsLaisseesDeCote: input.entering.length - accepted.length,
    reseauxDeLaFile: [...new Set(accepted.map((p) => NETWORK_NAME[p.network]))],
    contenuDeLaSemaine: input.deep?.production ? { quoi: input.deep.production.label, pourquoi: input.deep.why } : input.deep ? { rien: input.deep.why } : null,
    commentairesARepondre: input.comments.filter((c) => c.draft).length,
    leconsApprises: input.lessons.filter((l) => l.status === 'active').map((l) => l.text),
    decisions: decisions.map((d) => d.title),
    suspendu: input.health.paused,
    versionDEssai: input.dry,
  };
}

export async function summarize(ctx: Ctx, input: ReportInput, decisions: Decision[]): Promise<Summary | null> {
  const data = summaryData(input, decisions);
  const answer = await askJson<{ essentiel?: unknown; lecture?: unknown }>(ctx, {
    purpose: 'résumé du compte rendu',
    system: consigne(ctx, 'resume'),
    user: `Données de la semaine (les seules que tu peux citer) :\n${JSON.stringify(data, null, 1)}`,
    maxTokens: 3000,
  }).catch(() => null);
  if (!answer) return null;
  const summary: Summary = {
    essentiel: Array.isArray(answer.essentiel) ? answer.essentiel.map(String).filter((s) => s.trim()) : [],
    lecture: typeof answer.lecture === 'string' ? answer.lecture : '',
  };
  const problem = checkSummary(summary, data);
  if (problem) {
    ctx.log(`  résumé écarté (${problem}) : phrases du programme à la place`);
    return null;
  }
  return summary;
}
