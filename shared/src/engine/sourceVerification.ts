import { z } from 'zod';
import { BaseLLMClient } from '../client/base';
import { EvidenceSource, FactualClaim, SourceCheck } from './types';
import { extractJsonFromResponse, repairJsonString } from './validator';
import {
  FOURCHES_CAUDINES_SOURCE_JUDGEMENT_SYSTEM_PROMPT,
  buildSourceJudgementUserPrompt
} from './prompts';
import type { CitedSource } from './research';
import { fetchPageText, fetchableUrl } from './sourceFetch';

/**
 * Inspection of the pages an article actually cites - the half of factual
 * verification that no amount of searching can replace. A web search finds
 * what the wider web says about a claim; only reading the article's own
 * citations tells the reader whether the article's sourcing holds up, which
 * is a different question. The article can cite a page that says the exact
 * opposite, a page that never addresses the claim, or a page that supports it
 * but comes from a source that cannot be trusted - and until the page is
 * fetched and read, all three look identical: "a source is cited".
 *
 * The pipeline therefore fetches each distinct cited page, extracts its raw
 * text, and asks a judge to answer two separate questions about what was
 * actually read: what the page says about the claim (`relation`) and how
 * trustworthy the page is (`fiabilite`). The two are never collapsed into one,
 * so a prestigious page that contradicts the claim still lands as a
 * contradiction, and a confirming page from a dubious source still lands as
 * dubious.
 *
 * Honesty invariants, mirroring the research stage:
 * - Only pages that were fetched and read are ever judged; a URL on its own
 *   proves nothing, so a fetch failure becomes `inaccessible`, never a verdict.
 * - The claim under test is always what the article said, never the audit's
 *   objection to it.
 * - Every source fetched is bounded (timeout, size cap, total page budget),
 *   and every failure degrades only its own check - a dead link never turns
 *   the whole analysis into an error.
 * - Reconciliation only ever moves a claim toward what the read pages prove:
 *   a contradiction in the article's own citation makes the claim `douteuse`
 *   no matter what other snippets say; support read on a cited page can
 *   upgrade a claim that had no evidence either way, but never overturns an
 *   evidence-based doubt; and a "verified" claim whose only backers were
 *   citations that turned out dead, unrelated, or untrustworthy is downgraded
 *   rather than left standing on citations nobody could read.
 */

const SourceJudgementSchema = z.object({
  relation: z.enum(['supporte', 'contredit', 'sans-rapport']).default('sans-rapport'),
  fiabilite: z.enum(['fiable', 'partielle', 'douteuse', 'indeterminee']).default('indeterminee'),
  passage: z.string().default(''),
  discordance: z.string().optional(),
  raison: z.string().optional()
});

/** Hard ceilings on a single page fetch, so one pathological site cannot stall the report. */
const FETCH_TIMEOUT_MS = 10_000;
/** Upper bound on distinct pages fetched per analysis. */
const DEFAULT_MAX_PAGES = 8;

export interface VerifyCitedSourcesArgs {
  client: BaseLLMClient;
  claims: FactualClaim[];
  citedSources: CitedSource[];
  now?: Date;
  abortSignal?: AbortSignal;
  /** Bound on total pages fetched; stops paying for an article citing twenty links. */
  maxPages?: number;
  /** Per-fetch timeout; overridable in tests. */
  fetchTimeoutMs?: number;
  /** Injectable fetcher; defaults to the global, which host_permissions already authorises. */
  fetchImpl?: typeof fetch;
  /** Emits a human-readable line each time a cited page is fetched, for the live activity feed. */
  onActivity?: (note: string) => void;
}

export interface VerifyCitedSourcesResult {
  checks: SourceCheck[];
  /** Reconciliation result: the claims with verification states adjusted by the reading. */
  claims: FactualClaim[];
}

function rethrowIfAborted(err: unknown, abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
    throw err;
  }
}

function rethrowIfAbortedElsewhere(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw new DOMException('Source verification aborted', 'AbortError');
  }
}

/**
 * Judge one fetched page against one claim, and never let the judge rule on a
 * page it did not read: the extracted text is embedded in the prompt, the
 * schema forces `sans-rapport` as the default, and `supporte`/`contredit`
 * require the read text to establish them explicitly.
 */
async function judgeSourcePage(
  client: BaseLLMClient,
  claimId: string,
  claim: { quote: string; claim: string },
  source: { title: string; url: string },
  pageText: string,
  now: Date,
  abortSignal?: AbortSignal
): Promise<SourceCheck> {
  const completion = await client.complete({
    systemPrompt: FOURCHES_CAUDINES_SOURCE_JUDGEMENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildSourceJudgementUserPrompt(claim, source, pageText, now)
      }
    ],
    abortSignal
  });

  const raw = extractJsonFromResponse(completion.content);
  let parsed: z.infer<typeof SourceJudgementSchema>;
  try {
    parsed = SourceJudgementSchema.parse(JSON.parse(raw));
  } catch {
    parsed = SourceJudgementSchema.parse(JSON.parse(repairJsonString(raw)));
  }

  return {
    claimId,
    url: source.url,
    title: source.title || source.url,
    relation: parsed.relation,
    fiabilite: parsed.fiabilite,
    passage: parsed.passage || undefined,
    discordance: parsed.discordance || undefined,
    reason: parsed.raison || undefined
  };
}

/**
 * Fetches and reads the pages the article cites for its factual claims, and
 * re-rates the claims against what the pages really say. Runs AFTER the
 * research stage so the judge sees the complete claim set, including claims
 * the research stage could not verify for lack of evidence - a claim that no
 * search can adjudicate may still be settled by the article's own citation.
 */
export async function verifyCitedSources(args: VerifyCitedSourcesArgs): Promise<VerifyCitedSourcesResult> {
  const {
    client,
    claims,
    citedSources,
    now = new Date(),
    abortSignal,
    maxPages = DEFAULT_MAX_PAGES,
    fetchTimeoutMs = FETCH_TIMEOUT_MS,
    fetchImpl = fetch,
    onActivity
  } = args;

  const sourcesByBlock = new Map<string, CitedSource[]>();
  for (const source of citedSources) {
    if (!source.blockId) continue;
    const bucket = sourcesByBlock.get(source.blockId) ?? [];
    bucket.push(source);
    sourcesByBlock.set(source.blockId, bucket);
  }

  const checks: SourceCheck[] = [];
  let pagesFetched = 0;

  for (const claim of claims) {
    rethrowIfAbortedElsewhere(abortSignal);

    const blockSources = sourcesByBlock.get(claim.blockId) ?? [];
    if (blockSources.length === 0) continue;

    // Same URL cited twice in one block is one page.
    const candidates = Array.from(
      new Map(blockSources.map((s) => [s.href, s])).values()
    );

    const claimChecks: SourceCheck[] = [];
    for (const candidate of candidates) {
      if (pagesFetched >= maxPages) break;

      const url = fetchableUrl(candidate.href);
      if (!url) {
        claimChecks.push({
          claimId: claim.id,
          url: candidate.href,
          title: candidate.text || candidate.domain,
          relation: 'inaccessible',
          fiabilite: 'indeterminee',
          reason: 'ce lien n\'est pas une adresse http(s) exploitable'
        });
        continue;
      }
      pagesFetched += 1;
      const fetchTitle = candidate.text || candidate.domain || url;
      onActivity?.(`Lecture de la source citée : ${fetchTitle}`);

      let pageText = '';
      try {
        pageText = await fetchPageText(url, fetchTimeoutMs, fetchImpl);
      } catch (err) {
        rethrowIfAborted(err, abortSignal);
        claimChecks.push({
          claimId: claim.id,
          url,
          title: candidate.text || candidate.domain || url,
          relation: 'inaccessible',
          fiabilite: 'indeterminee',
          reason: `page inaccessible : ${(err as Error).message}`
        });
        continue;
      }

      if (!pageText.trim()) {
        claimChecks.push({
          claimId: claim.id,
          url,
          title: candidate.text || candidate.domain || url,
          relation: 'inaccessible',
          fiabilite: 'indeterminee',
          reason: 'la page a répondu mais son contenu n\'a produit aucun texte exploitable'
        });
        continue;
      }

      try {
        claimChecks.push(
          await judgeSourcePage(
            client,
            claim.id,
            { quote: claim.quote, claim: claim.claim },
            { title: candidate.text || candidate.domain || url, url },
            pageText,
            now,
            abortSignal
          )
        );
      } catch (err) {
        rethrowIfAborted(err, abortSignal);
        // A judge that fails on one page is a failed check, not a failed claim:
        // the article's citation was still not verified, and saying so is honest.
        claimChecks.push({
          claimId: claim.id,
          url,
          title: candidate.text || candidate.domain || url,
          relation: 'inaccessible',
          fiabilite: 'indeterminee',
          reason: `la page a été lue mais son évaluation a échoué : ${(err as Error).message}`
        });
      }
    }

    checks.push(...claimChecks);
  }

  return { checks, claims: reconcileSourceChecks(claims, checks) };
}

/**
 * Moves claims according to what the read citations proved. The direction of
 * every move is dictated by the strongest evidence actually read:
 *
 * - A cited page that contradicts the claim makes it `douteuse`, unconditionally:
 *   the article's own sourcing refutes it, which is the strongest signal this
 *   stage can produce, and no amount of elsewhere-supporting snippets undoes a
 *   contradiction sitting in the article's own citation.
 * - Absent a contradiction, a claim that had no evidence either way
 *   (`non-verifiable`) rises to `verifiee` only when a read page explicitly
 *   supports it from a source worth trusting (`fiable` or `partielle`).
 *   A confirming page that is itself `douteuse` certifies nothing.
 * - A claim the research stage called `verifiee` on citations alone - every
 *   supporting source is the article's own - is recomputed against the pages:
 *   if every cited backer is dead, unrelated, or untrustworthy, the claim
 *   drops to `non-verifiable` rather than standing on pages nobody could read.
 * - `douteuse` verdicts from the research stage are never overturned by a
 *   supporting citation: the article citing a page that agrees with it is not
 *   independent corroboration.
 *
 * Sources read are appended to the claim's evidence list so the reader sees
 * exactly which pages were consulted, quoted with the passage that was read.
 */
export function reconcileSourceChecks(claims: FactualClaim[], checks: SourceCheck[]): FactualClaim[] {
  const checksByClaim = new Map<string, SourceCheck[]>();
  for (const check of checks) {
    if (!check.claimId) continue;
    const bucket = checksByClaim.get(check.claimId) ?? [];
    bucket.push(check);
    checksByClaim.set(check.claimId, bucket);
  }

  return claims.map((claim) => {
    const claimChecks = checksByClaim.get(claim.id);
    if (!claimChecks || claimChecks.length === 0) return claim;

    const contradiction = claimChecks.find((c) => c.relation === 'contredit');
    const supporters = claimChecks.filter((c) => c.relation === 'supporte');
    const trustedSupport = supporters.find((c) => c.fiabilite === 'fiable' || c.fiabilite === 'partielle');
    const unreliableSupport = supporters.find((c) => c.fiabilite === 'douteuse');

    const citedPagesAsEvidence: EvidenceSource[] = claimChecks
      .filter((c) => c.relation === 'supporte' || c.relation === 'contredit')
      .filter((c) => c.passage || c.discordance)
      .map((c) => ({
        title: c.title,
        url: c.url,
        quote: c.discordance || c.passage,
        origin: 'article' as const
      }));

    const onlyArticleBacking = claim.sources.length === 0 || claim.sources.every((s) => s.origin === 'article');

    let verification = claim.verification;
    let rationale = claim.rationale;

    if (contradiction) {
      const detail = contradiction.discordance
        ? `La page citée dit le contraire : ${contradiction.discordance}`
        : 'La page citée contredit l\'affirmation sans que son extrait soit relançable.';
      verification = 'douteuse';
      rationale = [rationale, `Source citée par l'article (« ${contradiction.title} », ${contradiction.url}) inspectée : ${detail}`]
        .filter(Boolean)
        .join(' ');
    } else if (unreliableSupport) {
      // A confirming page that is itself untrustworthy certifies nothing. Whether
      // the claim was already unverified or stood on article-only backing, the
      // reader must hear that the one page cited in its favour was read and
      // judged not credible.
      if (onlyArticleBacking && verification === 'verifiee') {
        verification = 'non-verifiable';
      }
      rationale = [
        rationale,
        `La seule source citée à l'appui (« ${unreliableSupport.title} », ${unreliableSupport.url}) a été lue et jugée non fiable (${unreliableSupport.fiabilite}); elle ne peut pas certifier l'affirmation.`
      ]
        .filter(Boolean)
        .join(' ');
    } else if (trustedSupport) {
      if (verification === 'non-verifiable' || verification === 'non-sourcee') {
        verification = 'verifiee';
        rationale = [
          rationale,
          `La source citée par l'article (« ${trustedSupport.title} », ${trustedSupport.url}) a été lue et confirme explicitement l'affirmation (fiabilité : ${trustedSupport.fiabilite}).`
        ]
          .filter(Boolean)
          .join(' ');
      }
    } else if (claimChecks.every((c) => c.relation === 'inaccessible' || c.relation === 'sans-rapport')) {
      if (verification === 'verifiee' && onlyArticleBacking) {
        verification = 'non-verifiable';
        rationale = [
          rationale,
          'Toutes les sources citées par l\'article pour cette affirmation se sont révélées inaccessibles ou sans rapport avec elle : leur lecture n\'a confirmé ni infirmé le constat, donc rien ne le certifie.'
        ]
          .filter(Boolean)
          .join(' ');
      } else if (verification === 'verifiee') {
        // Independent search evidence exists, so the claim stands - but the
        // reader deserves to know the article's own citations failed it.
        rationale = [
          rationale,
          'Les sources citées par l\'article pour cette affirmation se sont révélées inaccessibles ou sans rapport avec elle ; la confirmation repose sur les sources de recherche.'
        ]
          .filter(Boolean)
          .join(' ');
      }
    }

    return {
      ...claim,
      verification,
      rationale,
      sources: [...claim.sources, ...citedPagesAsEvidence]
    };
  });
}