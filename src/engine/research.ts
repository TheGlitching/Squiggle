import { z } from 'zod';
import { BaseLLMClient, SearchResult } from '../client/base';
import { extractJsonFromResponse, repairJsonString, RESEARCHABLE_FINDING_CATEGORIES } from './validator';
import {
  AnalysisInput,
  EvidenceSource,
  FactualClaim,
  FactualClaimSchema,
  Finding,
  ResearchRecord
} from './types';
import {
  buildClaimGroundedJudgementUserPrompt,
  buildClaimJudgementUserPrompt,
  FOURCHES_CAUDINES_CLAIM_GROUNDED_JUDGEMENT_SYSTEM_PROMPT,
  FOURCHES_CAUDINES_CLAIM_JUDGEMENT_SYSTEM_PROMPT
} from './prompts';

/** A source the article itself links to, as the extractor recovers it. */
export interface CitedSource {
  href: string;
  domain: string;
  text: string;
  blockId?: string;
}

export interface ResearchFindingsArgs {
  client: BaseLLMClient;
  input: AnalysisInput;
  /**
   * The audit's own findings. Only the factual categories among them are
   * researched; the claim under test is always the finding's `quote` (what
   * the article said), never the finding's own explanation of what is wrong
   * with it - the point of researching after the audit is to check the
   * audit's objection, not to re-confirm it from the audit's own wording.
   */
  findings: Finding[];
  citedSources: CitedSource[];
  /** Forwarded to a grounded client's own search budget; ignored on the ungrounded route. */
  maxSearches?: number;
  /** Pins "today" into every judgement prompt; defaults to the real clock. */
  now?: Date;
  onProgress?: (msg: string, pct: number) => void;
  abortSignal?: AbortSignal;
}

export interface ResearchFindingsResult {
  claims: FactualClaim[];
  research: ResearchRecord;
}

const JudgementSchema = z.object({
  verification: z.enum(['verifiee', 'douteuse', 'non-verifiable']).default('non-verifiable'),
  sources: z
    .array(
      z.object({
        title: z.string().default(''),
        url: z.string().default(''),
        quote: z.string().optional(),
        origin: z.enum(['article', 'search']).default('search')
      })
    )
    .default([]),
  rationale: z.string().optional()
});

/**
 * A cancelled request rejects the same way a flaky network does, but the two
 * must never be handled alike: three call sites in this module degrade a
 * research failure to `non-verifiable`, and every one of them must let a
 * genuine cancellation propagate instead of quietly reporting it as a
 * non-verifiable claim the caller never asked to abandon research for.
 */
function rethrowIfAborted(err: unknown, abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
    throw err;
  }
}

/**
 * Reuses the extractor/repair pair the audit parser already relies on, so a
 * third bespoke JSON scraper never appears for the research stage's own
 * strict-JSON calls.
 */
function parseLooseJson(rawText: string): unknown {
  const jsonStr = extractJsonFromResponse(rawText);
  try {
    return JSON.parse(jsonStr);
  } catch {
    return JSON.parse(repairJsonString(jsonStr));
  }
}

type JudgementRoute = 'grounded' | 'search';

/**
 * Forces the honesty invariant in code: a `verifiee`/`douteuse` verdict with
 * no backing evidence is exactly the confabulated-verdict bug this stage
 * exists to close, so it is made unrepresentable here rather than left to a
 * prompt instruction the model can ignore.
 *
 * The two routes disagree on what counts as evidence, and that disagreement
 * cannot be settled by counting sources alone:
 * - `grounded`: the provider itself fed the model the page content inside the
 *   single grounded call, so every source the model names (plus every
 *   citation the provider actually returned) is genuine evidence, even one
 *   whose `snippet`/`quote` is empty. Only a bare zero forces `non-verifiable`.
 * - `search`: the judge saw nothing but what this module put in its prompt.
 *   `evidencedUrls` is exactly the search results that carried real excerpt
 *   text - the article's own cited sources are shown as context but never
 *   count on their own, since the article citing itself proves nothing about
 *   what the judge actually read - so any source the model names that is NOT
 *   in `evidencedUrls` was never actually shown, and is dropped before the
 *   honesty check runs. A bare title/url pair the model invents or
 *   half-remembers can never survive this filter.
 */
function enforceSourcedVerdict(
  judgement: z.infer<typeof JudgementSchema>,
  route: JudgementRoute,
  evidencedUrls: Set<string>
): z.infer<typeof JudgementSchema> {
  if (judgement.verification === 'non-verifiable') {
    return judgement;
  }

  const sources = route === 'search' ? judgement.sources.filter((s) => evidencedUrls.has(s.url)) : judgement.sources;

  if (sources.length === 0) {
    const reason =
      route === 'search'
        ? `Verdict '${judgement.verification}' rejeté : aucune source fournie ne contenait de texte source lisible, une URL nue ne peut jamais justifier un verdict.`
        : `Verdict '${judgement.verification}' rejeté : aucune source fournie à l'appui.`;
    return {
      verification: 'non-verifiable',
      sources: [],
      rationale: `${reason} ${judgement.rationale ?? ''}`.trim()
    };
  }

  return { ...judgement, sources };
}

/**
 * Ungrounded judgement: the judge only ever sees what this module hands it,
 * so blank-snippet search results are stripped before the prompt is built -
 * a bare title/url is not evidence anyone read the page - and whatever the
 * model claims afterward is still checked against that same evidenced set.
 */
async function judgeClaimViaSearch(
  client: BaseLLMClient,
  claim: { quote: string; claim: string },
  searchResults: SearchResult[],
  articleSources: CitedSource[],
  now: Date,
  abortSignal?: AbortSignal
): Promise<{ verification: FactualClaim['verification']; sources: EvidenceSource[]; rationale?: string }> {
  const evidencedResults = searchResults.filter((r) => r.snippet.trim().length > 0);

  const completion = await client.complete({
    systemPrompt: FOURCHES_CAUDINES_CLAIM_JUDGEMENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildClaimJudgementUserPrompt(claim, evidencedResults, articleSources, now)
      }
    ],
    abortSignal
  });

  const parsed = JudgementSchema.parse(parseLooseJson(completion.content));
  const evidencedUrls = new Set<string>(evidencedResults.map((r) => r.url));
  return enforceSourcedVerdict(parsed, 'search', evidencedUrls);
}

/**
 * Grounded judgement: a single call in which the provider itself runs the
 * searches and reads the pages into the model's own context, so the model's
 * verdict is judged against what it actually saw rather than a text excerpt
 * this module chose for it. Evidence is the union of the sources the model
 * names and the citations the provider reports it fetched, de-duplicated by
 * url; an empty `snippet` on either side is not a defect here, it is just
 * this module's inability to see what the model read.
 */
async function judgeClaimGrounded(
  client: BaseLLMClient,
  claim: { quote: string; claim: string },
  articleSources: CitedSource[],
  maxSearches: number | undefined,
  now: Date,
  abortSignal?: AbortSignal
): Promise<{ verification: FactualClaim['verification']; sources: EvidenceSource[]; rationale?: string }> {
  const answer = await client.groundedAnswer({
    systemPrompt: FOURCHES_CAUDINES_CLAIM_GROUNDED_JUDGEMENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildClaimGroundedJudgementUserPrompt(claim, articleSources, now)
      }
    ],
    abortSignal,
    maxSearches
  });

  const parsed = JudgementSchema.parse(parseLooseJson(answer.content));

  // Only what the provider actually retrieved counts as evidence. The model may
  // decline to search and answer from memory, and it may name more urls than
  // were ever fetched; either way an unfetched url is a recollection, and a
  // recollection is what makes a true, sourced claim get called false.
  if (answer.citations.length === 0) {
    return {
      verification: 'non-verifiable',
      sources: [],
      rationale:
        `Verdict '${parsed.verification}' rejeté : aucune source n'a été consultée, ` +
        `le modèle a répondu sans effectuer de recherche. ${parsed.rationale ?? ''}`.trim()
    };
  }

  const quoteByUrl = new Map(parsed.sources.filter((s) => s.url).map((s) => [s.url, s]));
  const evidenceByUrl = new Map<string, EvidenceSource>();
  for (const citation of answer.citations) {
    if (!citation.url || evidenceByUrl.has(citation.url)) continue;
    const named = quoteByUrl.get(citation.url);
    evidenceByUrl.set(citation.url, {
      title: citation.title || named?.title || citation.url,
      url: citation.url,
      quote: named?.quote || citation.snippet || undefined,
      origin: 'search'
    });
  }

  const merged = { ...parsed, sources: Array.from(evidenceByUrl.values()) };
  return enforceSourcedVerdict(merged, 'grounded', new Set(evidenceByUrl.keys()));
}

/**
 * Gathers evidence for the audit's own factual findings, so what gets
 * published as a fault is checked against reality rather than against
 * whatever a disjoint extraction pass happened to pick out beforehand.
 *
 * Only `RESEARCHABLE_FINDING_CATEGORIES` are candidates: `source-absente`
 * findings are already fully resolved by `enforceEvidenceHonesty` before this
 * runs, and are deliberately never re-opened here, or a claim of
 * `non-verifiable` from a fruitless search would silently overwrite the
 * `non-sourcee` sourcing observation with an unrelated truth verdict.
 *
 * This runs AFTER the audit, not before it: the audit's factual findings are
 * exactly the claims under test, and the claim under test is always the
 * article's own statement (the finding's `quote`), never the finding's
 * explanation of what the audit thinks is wrong with it. Reconciling a
 * finding against its researched claim - keeping it, downgrading it, or
 * withdrawing it as an unfounded objection - is `reconcileResearchedFindings`
 * in validator.ts, not this function; this function only gathers evidence.
 *
 * Judgement runs one LLM call per finding rather than a single batched call:
 * each finding's search/judgement failure must degrade only that finding, and
 * a batched call would turn one malformed finding into a parse failure for
 * all of them.
 */
export async function researchFindings(args: ResearchFindingsArgs): Promise<ResearchFindingsResult> {
  const { client, input, findings, citedSources, maxSearches, onProgress, abortSignal } = args;
  const now = args.now ?? new Date();
  void input; // kept in the signature for parity with the prompt builders and future per-article context

  const factual = findings.filter((f) => RESEARCHABLE_FINDING_CATEGORIES[f.category]);

  if (factual.length === 0) {
    return {
      claims: [],
      research: {
        performed: false,
        provider: client.getProvider(),
        queries: [],
        skippedReason: "Aucun constat factuel dans l'audit à vérifier.",
        withdrawn: []
      }
    };
  }

  const groundedCapable = client.supportsGroundedAnswer();
  const canSearch = client.supportsWebSearch();
  if (!groundedCapable && !canSearch) {
    const claims = factual.map((f) =>
      FactualClaimSchema.parse({
        findingId: f.id,
        blockId: f.blockId,
        quote: f.quote,
        claim: f.quote,
        verification: 'non-verifiable',
        sources: [],
        rationale: `Le fournisseur ${client.getProvider()} ne prend pas en charge la recherche web ; constat non vérifié.`
      })
    );
    return {
      claims,
      research: {
        performed: false,
        provider: client.getProvider(),
        queries: [],
        skippedReason: `Le fournisseur ${client.getProvider()} ne prend pas en charge la recherche web.`,
        withdrawn: []
      }
    };
  }

  const queries: string[] = [];
  const claims: FactualClaim[] = [];

  for (let i = 0; i < factual.length; i++) {
    if (abortSignal?.aborted) {
      throw new DOMException('Research aborted', 'AbortError');
    }

    const finding = factual[i];
    const claimUnderTest = { quote: finding.quote, claim: finding.quote };
    queries.push(finding.quote);
    onProgress?.(`Vérification : ${finding.quote}`, 10 + Math.round((i / factual.length) * 80));

    const articleSourcesForBlock = citedSources.filter((s) => !s.blockId || s.blockId === finding.blockId);

    if (groundedCapable) {
      try {
        const judgement = await judgeClaimGrounded(client, claimUnderTest, articleSourcesForBlock, maxSearches, now, abortSignal);
        claims.push(
          FactualClaimSchema.parse({
            findingId: finding.id,
            blockId: finding.blockId,
            quote: finding.quote,
            claim: finding.quote,
            verification: judgement.verification,
            sources: judgement.sources,
            rationale: judgement.rationale
          })
        );
      } catch (err) {
        rethrowIfAborted(err, abortSignal);
        claims.push(
          FactualClaimSchema.parse({
            findingId: finding.id,
            blockId: finding.blockId,
            quote: finding.quote,
            claim: finding.quote,
            verification: 'non-verifiable',
            sources: [],
            rationale: `Vérification impossible pour ce constat : ${(err as Error).message}`
          })
        );
      }
      continue;
    }

    let searchResults: SearchResult[] = [];
    let searchFailed = false;
    let searchError = '';
    try {
      searchResults = await client.webSearch(finding.quote);
    } catch (err) {
      rethrowIfAborted(err, abortSignal);
      searchFailed = true;
      searchError = (err as Error).message;
    }

    if (searchFailed) {
      claims.push(
        FactualClaimSchema.parse({
          findingId: finding.id,
          blockId: finding.blockId,
          quote: finding.quote,
          claim: finding.quote,
          verification: 'non-verifiable',
          sources: [],
          rationale: `Recherche web indisponible pour ce constat : ${searchError}`
        })
      );
      continue;
    }

    try {
      const judgement = await judgeClaimViaSearch(client, claimUnderTest, searchResults, articleSourcesForBlock, now, abortSignal);
      claims.push(
        FactualClaimSchema.parse({
          findingId: finding.id,
          blockId: finding.blockId,
          quote: finding.quote,
          claim: finding.quote,
          verification: judgement.verification,
          sources: judgement.sources,
          rationale: judgement.rationale
        })
      );
    } catch (err) {
      rethrowIfAborted(err, abortSignal);
      claims.push(
        FactualClaimSchema.parse({
          findingId: finding.id,
          blockId: finding.blockId,
          quote: finding.quote,
          claim: finding.quote,
          verification: 'non-verifiable',
          sources: [],
          rationale: `Vérification impossible pour ce constat : ${(err as Error).message}`
        })
      );
    }
  }

  onProgress?.('Vérifications terminées', 100);

  // `withdrawn` is filled in by `reconcileResearchedFindings`, which knows
  // which findings the evidence actually cleared; this stage only gathers
  // the evidence.
  return {
    claims,
    research: { performed: true, provider: client.getProvider(), queries, withdrawn: [] }
  };
}
