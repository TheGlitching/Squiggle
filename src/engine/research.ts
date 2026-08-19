import { z } from 'zod';
import { BaseLLMClient, SearchResult } from '../client/base';
import { extractJsonFromResponse, repairJsonString } from './validator';
import {
  AnalysisInput,
  EvidenceSource,
  FactualClaim,
  FactualClaimSchema,
  ResearchRecord
} from './types';
import {
  buildClaimExtractionUserPrompt,
  buildClaimGroundedJudgementUserPrompt,
  buildClaimJudgementUserPrompt,
  FOURCHES_CAUDINES_CLAIM_EXTRACTION_SYSTEM_PROMPT,
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

export interface ResearchClaimsArgs {
  client: BaseLLMClient;
  input: AnalysisInput;
  citedSources: CitedSource[];
  maxClaims?: number;
  /** Forwarded to a grounded client's own search budget; ignored on the ungrounded route. */
  maxSearches?: number;
  onProgress?: (msg: string, pct: number) => void;
  abortSignal?: AbortSignal;
}

export interface ResearchClaimsResult {
  claims: FactualClaim[];
  research: ResearchRecord;
}

const DEFAULT_MAX_CLAIMS = 6;

/** What the extraction call must return before ids/defaults are filled in by FactualClaimSchema. */
const ClaimExtractionSchema = z.object({
  claims: z
    .array(
      z.object({
        blockId: z.string().default(''),
        quote: z.string().default(''),
        claim: z.string().min(1)
      })
    )
    .default([])
});

const JudgementSchema = z.object({
  verification: z.enum(['confirmed', 'contradicted', 'unverified']).default('unverified'),
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
 * research failure to `unverified`, and every one of them must let a genuine
 * cancellation propagate instead of quietly reporting it as an unverified
 * claim the caller never asked to abandon research for.
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

async function extractClaims(
  client: BaseLLMClient,
  input: AnalysisInput,
  maxClaims: number,
  abortSignal?: AbortSignal
): Promise<{ blockId: string; quote: string; claim: string }[]> {
  const completion = await client.complete({
    systemPrompt: FOURCHES_CAUDINES_CLAIM_EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildClaimExtractionUserPrompt(input, maxClaims) }],
    abortSignal
  });

  const parsed = ClaimExtractionSchema.parse(parseLooseJson(completion.content));
  return parsed.claims.slice(0, maxClaims);
}

type JudgementRoute = 'grounded' | 'search';

/**
 * Forces the honesty invariant in code: a `confirmed`/`contradicted` verdict
 * with no backing evidence is exactly the confabulated-verdict bug this stage
 * exists to close, so it is made unrepresentable here rather than left to a
 * prompt instruction the model can ignore.
 *
 * The two routes disagree on what counts as evidence, and that disagreement
 * cannot be settled by counting sources alone:
 * - `grounded`: the provider itself fed the model the page content inside the
 *   single grounded call, so every source the model names (plus every
 *   citation the provider actually returned) is genuine evidence, even one
 *   whose `snippet`/`quote` is empty. Only a bare zero forces `unverified`.
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
  if (judgement.verification === 'unverified') {
    return judgement;
  }

  const sources = route === 'search' ? judgement.sources.filter((s) => evidencedUrls.has(s.url)) : judgement.sources;

  if (sources.length === 0) {
    const reason =
      route === 'search'
        ? `Verdict '${judgement.verification}' rejeté : aucune source fournie ne contenait de texte source lisible, une URL nue ne peut jamais justifier un verdict.`
        : `Verdict '${judgement.verification}' rejeté : aucune source fournie à l'appui.`;
    return {
      verification: 'unverified',
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
  abortSignal?: AbortSignal
): Promise<{ verification: FactualClaim['verification']; sources: EvidenceSource[]; rationale?: string }> {
  const evidencedResults = searchResults.filter((r) => r.snippet.trim().length > 0);

  const completion = await client.complete({
    systemPrompt: FOURCHES_CAUDINES_CLAIM_JUDGEMENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildClaimJudgementUserPrompt(claim, evidencedResults, articleSources)
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
  abortSignal?: AbortSignal
): Promise<{ verification: FactualClaim['verification']; sources: EvidenceSource[]; rationale?: string }> {
  const answer = await client.groundedAnswer({
    systemPrompt: FOURCHES_CAUDINES_CLAIM_GROUNDED_JUDGEMENT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildClaimGroundedJudgementUserPrompt(claim, articleSources)
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
      verification: 'unverified',
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
 * Gathers evidence for an article's checkable factual claims before the
 * audit runs, so the audit prompt can be handed sources instead of an order
 * to "verify" with nothing to verify against.
 *
 * Judgement runs one LLM call per claim rather than a single batched call:
 * each claim's search/judgement failure must degrade only that claim, and a
 * batched call would turn one malformed claim into a parse failure for all
 * of them.
 */
export async function researchClaims(args: ResearchClaimsArgs): Promise<ResearchClaimsResult> {
  const { client, input, citedSources, maxSearches, onProgress, abortSignal } = args;
  const maxClaims = args.maxClaims ?? DEFAULT_MAX_CLAIMS;

  onProgress?.('Extraction des affirmations vérifiables...', 5);

  let extracted: { blockId: string; quote: string; claim: string }[];
  try {
    extracted = await extractClaims(client, input, maxClaims, abortSignal);
  } catch (err) {
    rethrowIfAborted(err, abortSignal);
    return {
      claims: [],
      research: {
        performed: false,
        provider: client.getProvider(),
        queries: [],
        skippedReason: `Extraction des affirmations impossible : ${(err as Error).message}`
      }
    };
  }

  if (abortSignal?.aborted) {
    throw new DOMException('Research aborted', 'AbortError');
  }

  if (extracted.length === 0) {
    return {
      claims: [],
      research: { performed: false, provider: client.getProvider(), queries: [], skippedReason: 'Aucune affirmation factuelle vérifiable détectée.' }
    };
  }

  const groundedCapable = client.supportsGroundedAnswer();
  const canSearch = client.supportsWebSearch();
  if (!groundedCapable && !canSearch) {
    const claims = extracted.map((c) =>
      FactualClaimSchema.parse({
        blockId: c.blockId,
        quote: c.quote,
        claim: c.claim,
        verification: 'unverified',
        sources: [],
        rationale: `Le fournisseur ${client.getProvider()} ne prend pas en charge la recherche web ; affirmation non vérifiée.`
      })
    );
    return {
      claims,
      research: {
        performed: false,
        provider: client.getProvider(),
        queries: [],
        skippedReason: `Le fournisseur ${client.getProvider()} ne prend pas en charge la recherche web.`
      }
    };
  }

  const queries: string[] = [];
  const claims: FactualClaim[] = [];

  for (let i = 0; i < extracted.length; i++) {
    if (abortSignal?.aborted) {
      throw new DOMException('Research aborted', 'AbortError');
    }

    const raw = extracted[i];
    const query = raw.claim;
    queries.push(query);
    onProgress?.(`Recherche : ${raw.claim}`, 10 + Math.round((i / extracted.length) * 80));

    const articleSourcesForBlock = citedSources.filter((s) => !s.blockId || s.blockId === raw.blockId);

    if (groundedCapable) {
      try {
        const judgement = await judgeClaimGrounded(
          client,
          { quote: raw.quote, claim: raw.claim },
          articleSourcesForBlock,
          maxSearches,
          abortSignal
        );
        claims.push(
          FactualClaimSchema.parse({
            blockId: raw.blockId,
            quote: raw.quote,
            claim: raw.claim,
            verification: judgement.verification,
            sources: judgement.sources,
            rationale: judgement.rationale
          })
        );
      } catch (err) {
        rethrowIfAborted(err, abortSignal);
        claims.push(
          FactualClaimSchema.parse({
            blockId: raw.blockId,
            quote: raw.quote,
            claim: raw.claim,
            verification: 'unverified',
            sources: [],
            rationale: `Vérification impossible pour cette affirmation : ${(err as Error).message}`
          })
        );
      }
      continue;
    }

    let searchResults: SearchResult[] = [];
    let searchFailed = false;
    let searchError = '';
    try {
      searchResults = await client.webSearch(query);
    } catch (err) {
      rethrowIfAborted(err, abortSignal);
      searchFailed = true;
      searchError = (err as Error).message;
    }

    if (searchFailed) {
      claims.push(
        FactualClaimSchema.parse({
          blockId: raw.blockId,
          quote: raw.quote,
          claim: raw.claim,
          verification: 'unverified',
          sources: [],
          rationale: `Recherche web indisponible pour cette affirmation : ${searchError}`
        })
      );
      continue;
    }

    try {
      const judgement = await judgeClaimViaSearch(
        client,
        { quote: raw.quote, claim: raw.claim },
        searchResults,
        articleSourcesForBlock,
        abortSignal
      );
      claims.push(
        FactualClaimSchema.parse({
          blockId: raw.blockId,
          quote: raw.quote,
          claim: raw.claim,
          verification: judgement.verification,
          sources: judgement.sources,
          rationale: judgement.rationale
        })
      );
    } catch (err) {
      rethrowIfAborted(err, abortSignal);
      claims.push(
        FactualClaimSchema.parse({
          blockId: raw.blockId,
          quote: raw.quote,
          claim: raw.claim,
          verification: 'unverified',
          sources: [],
          rationale: `Vérification impossible pour cette affirmation : ${(err as Error).message}`
        })
      );
    }
  }

  onProgress?.('Vérifications terminées', 100);

  return {
    claims,
    research: { performed: true, provider: client.getProvider(), queries }
  };
}
