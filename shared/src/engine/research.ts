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
  buildResearchAgentStepPrompt,
  MAX_SOURCE_EXCERPT_CHARS,
  FOURCHES_CAUDINES_CLAIM_GROUNDED_JUDGEMENT_SYSTEM_PROMPT,
  RESEARCH_AGENT_SYSTEM_PROMPT
} from './prompts';
import { fetchPageText, fetchableUrl } from './sourceFetch';

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
  /**
   * Emits a human-readable line for each step the research agent takes
   * (query issued, cited source read, verdict reached), for the live feed.
   */
  onActivity?: (note: string) => void;
  /** Injectable fetcher for reading a cited source the agent decides to read. */
  fetchImpl?: typeof fetch;
  /** Per-cited-source fetch timeout; overridable in tests. */
  fetchTimeoutMs?: number;
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
 * Stage-wide ceiling on the total number of web searches the search route may
 * issue across all claims, so a long article with many findings cannot run up
 * an unbounded bill. Each claim is handed a fair share of whatever remains.
 */
const STAGE_MAX_SEARCHES = 14;
/** Floor on how many searches a single claim is guaranteed when several share. */
const MIN_FAIR_SHARE = 1;

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
 *   text plus the article's own cited sources that were actually fetched and
 *   read - a cited URL the agent merely named but never read proves nothing,
 *   so any source the model names that is NOT in `evidencedUrls` was never
 *   actually shown and is dropped before the honesty check runs. A bare
 *   title/url pair the model invents or half-remembers can never survive.
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
 * The search-route investigation, rewritten as a bounded agent. The old judge
 * saw one bullet list of search excerpts and answered once. The agent instead
 * iterates: each step it decides - issue another search, read a page the
 * article itself cited (which the old route only ever showed as an inert
 * context line, never fetched), or render a verdict. Evidence accumulates
 * across steps and is re-fed into the next decision, so a claim that needs
 * several searches, or that is best settled by reading the article's own
 * citation, gets exactly that - the model drives its own investigation.
 *
 * Budgets bound the loop so a pathological claim cannot pay forever:
 * `searchesBudget` is the per-claim share of the stage-wide search budget,
 * and `maxSteps` caps agent steps. Both feed the agent's context; once either
 * runs out, the agent is told to conclude with what it has.
 *
 * Honesty is still enforced in code, not by the prompt: `evidencedUrls` is
 * exactly the set of search results that carry real excerpt text plus the
 * cited pages that were actually fetched and read, and `enforceSourcedVerdict`
 * drops any source the agent names that is not in that set - the article
 * citing a URL proves nothing about whether anyone read it.
 */
const AgentActionSchema = z.object({
  action: z.enum(['search', 'read_source', 'verdict' as const]),
  query: z.string().optional().default(''),
  url: z.string().optional().default(''),
  note: z.string().optional().default(''),
  verification: z.enum(['verifiee', 'douteuse', 'non-verifiable']).optional(),
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
  rationale: z.string().optional().default('')
});

/** Ceiling on agent steps per claim; safety net beneath the search budget. */
const MAX_AGENT_STEPS = 8;
/** Timeout for reading one cited source page the agent chooses to read. */
const AGENT_FETCH_TIMEOUT_MS = 10_000;

/**
 * The agent's step decision, expressed as a JSON Schema the clients enforce
 * via their structured-output path (`response_format: json_schema, strict`
 * on OpenAI/OpenRouter, `responseSchema` on Gemini). Demanding strict JSON in
 * prose and repairing the reply is fragile - most models will not honour it
 * when they can sidestep it - so the shape is handed to the provider itself,
 * exactly the way the audit and grounded routes already reach their clients.
 */
const AGENT_ACTION_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    action: { type: 'string' as const, enum: ['search', 'read_source', 'verdict'] },
    query: { type: 'string' as const },
    url: { type: 'string' as const },
    note: { type: 'string' as const },
    verification: { type: 'string' as const, enum: ['verifiee', 'douteuse', 'non-verifiable'] },
    sources: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          url: { type: 'string' as const },
          quote: { type: 'string' as const },
          origin: { type: 'string' as const, enum: ['article', 'search'] }
        },
        required: ['title', 'url', 'origin'],
        additionalProperties: false
      }
    },
    rationale: { type: 'string' as const }
  },
  required: ['action'],
  additionalProperties: false
} as const;

interface AgentVerdict {
  verification: FactualClaim['verification'];
  sources: EvidenceSource[];
  rationale?: string;
}

async function researchClaimViaAgent(
  client: BaseLLMClient,
  claim: { quote: string; claim: string },
  articleSources: CitedSource[],
  now: Date,
  opts: {
    searchesBudget: number;
    onActivity?: (note: string) => void;
    fetchImpl?: typeof fetch;
    fetchTimeoutMs?: number;
    abortSignal?: AbortSignal;
  }
): Promise<{ verdict: AgentVerdict; queries: string[] }> {
  const { searchesBudget, onActivity, fetchImpl = fetch, fetchTimeoutMs = AGENT_FETCH_TIMEOUT_MS, abortSignal } = opts;

  const seenUrls = new Set<string>();
  const searchEvidence: { title: string; url: string; snippet: string }[] = [];
  const readEvidence: { title: string; url: string; text: string }[] = [];
  const remainingSources = [...articleSources];
  const queries: string[] = [];
  let searchesLeft = searchesBudget;

  const addSearchResults = (results: SearchResult[]): void => {
    for (const r of results) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      searchEvidence.push({ title: r.title, url: r.url, snippet: r.snippet });
    }
  };

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    if (abortSignal?.aborted) {
      throw new DOMException('Research aborted', 'AbortError');
    }

    const mustConclude = searchesLeft <= 0 || step === MAX_AGENT_STEPS - 1;

    let action: z.infer<typeof AgentActionSchema>;
    try {
      const completion = await client.complete({
        systemPrompt: RESEARCH_AGENT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildResearchAgentStepPrompt({
              claim,
              searchEvidence,
              readEvidence,
              remainingArticleSources: remainingSources,
              now,
              searchesLeft,
              readsLeft: remainingSources.length,
              mustConclude
            })
          }
        ],
        abortSignal,
        temperature: 0.1,
        maxTokens: 700,
        // The step shape is enforced by the provider (structured output), not
        // asked for in prose and repaired - many models will not honour a
        // strict-JSON instruction they can sidestep, and a parse-repair fallback
        // silently swallows that drift.
        jsonSchema: AGENT_ACTION_JSON_SCHEMA
      });
      action = AgentActionSchema.parse(parseLooseJson(completion.content));
    } catch (err) {
      rethrowIfAborted(err, abortSignal);
      if (searchEvidence.length === 0 && readEvidence.length === 0) {
        // Nothing was ever gathered and no step can be parsed: this is not a
        // claim to adjudicate, it is a broker failure. Degrade to non-verifiable
        // and stop rather than loop against a broken completion.
        return {
          verdict: { verification: 'non-verifiable', sources: [], rationale: `Vérification impossible : ${(err as Error).message}` },
          queries
        };
      }
      // A single malformed step is not fatal if we already have evidence: force
      // a concluding look with what we have (searchesLeft <= 0 path below).
      action = { action: 'verdict' as const, verification: 'non-verifiable' as const, sources: [], rationale: '', query: '', url: '', note: '' };
    }

    if (action.action === 'verdict') {
      const evidencedUrls = new Set<string>([
        ...searchEvidence.filter((r) => r.snippet.trim().length > 0).map((r) => r.url),
        ...readEvidence.map((r) => r.url)
      ]);
      const parsed = JudgementSchema.parse({
        verification: action.verification ?? 'non-verifiable',
        sources: action.sources ?? [],
        rationale: action.rationale
      });
      return { verdict: enforceSourcedVerdict(parsed, 'search', evidencedUrls), queries };
    }

    if (mustConclude) {
      // Budget spent but the agent asked for yet another investigation step.
      // Render the honest conclusion rather than looping.
      const evidencedUrls = new Set<string>([
        ...searchEvidence.filter((r) => r.snippet.trim().length > 0).map((r) => r.url),
        ...readEvidence.map((r) => r.url)
      ]);
      const parsed = JudgementSchema.parse({
        verification: 'non-verifiable',
        sources: [],
        rationale: searchesLeft <= 0 ? 'Budget de recherche épuisé sans preuve suffisante.' : 'Nombre maximal d’étapes atteint sans preuve suffisante.'
      });
      return { verdict: enforceSourcedVerdict(parsed, 'search', evidencedUrls), queries };
    }

    if (action.action === 'search') {
      const query = action.query.trim();
      if (!query) continue; // malformed empty query; step wastage only
      if (searchesLeft <= 0) continue;
      searchesLeft -= 1;
      queries.push(query);
      onActivity?.(`Recherche : ${query}`);
      let results: SearchResult[] = [];
      try {
        results = await client.webSearch(query, { maxResults: 5 });
      } catch (err) {
        rethrowIfAborted(err, abortSignal);
        onActivity?.(`Recherche échouée : ${query}`);
      }
      addSearchResults(results);
      continue;
    }

    if (action.action === 'read_source') {
      const url = action.url.trim();
      const candidate = remainingSources.find((s) => s.href === url || s.domain === url);
      const fetchUrl = candidate ? fetchableUrl(candidate.href) : url ? fetchableUrl(url) : null;
      if (!fetchUrl || !candidate) {
        // The agent named a URL that is not one of the article's cited sources.
        // That is not evidence anyone read anything; ignore it and continue.
        continue;
      }
      remainingSources.splice(remainingSources.indexOf(candidate), 1);
      onActivity?.(`Lecture de la source citée : ${candidate.text || candidate.domain}`);
      let pageText = '';
      try {
        pageText = await fetchPageText(fetchUrl, fetchTimeoutMs, fetchImpl);
      } catch (err) {
        rethrowIfAborted(err, abortSignal);
        continue;
      }
      if (!pageText.trim()) continue;
      readEvidence.push({ title: candidate.text || candidate.domain || fetchUrl, url: fetchUrl, text: pageText.slice(0, MAX_SOURCE_EXCERPT_CHARS) });
      continue;
    }
  }

  // Loop exhausted without an explicit verdict.
  const evidencedUrls = new Set<string>([
    ...searchEvidence.filter((r) => r.snippet.trim().length > 0).map((r) => r.url),
    ...readEvidence.map((r) => r.url)
  ]);
  const parsed = JudgementSchema.parse({
    verification: 'non-verifiable',
    sources: [],
    rationale: 'Investigation terminée sans verdict explicite.'
  });
  return { verdict: enforceSourcedVerdict(parsed, 'search', evidencedUrls), queries };
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
  const { client, input, findings, citedSources, maxSearches, onProgress, onActivity, fetchImpl, fetchTimeoutMs, abortSignal } = args;
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
  let totalSearchesLeft = STAGE_MAX_SEARCHES;

  for (let i = 0; i < factual.length; i++) {
    if (abortSignal?.aborted) {
      throw new DOMException('Research aborted', 'AbortError');
    }

    const finding = factual[i];
    const claimUnderTest = { quote: finding.quote, claim: finding.quote };
    onProgress?.(`Vérification : ${finding.quote}`, 10 + Math.round((i / factual.length) * 80));
    onActivity?.(`Vérification du constat : ${finding.quote.slice(0, 80)}`);

    const articleSourcesForBlock = citedSources.filter((s) => !s.blockId || s.blockId === finding.blockId);

    if (groundedCapable) {
      try {
        const judgement = await judgeClaimGrounded(client, claimUnderTest, articleSourcesForBlock, maxSearches, now, abortSignal);
        queries.push(finding.quote);
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

    // The article's own citations participate in the investigation: they are
    // handed to the agent as readable sources, exactly as the user asked -
    // always in the search process, not merely listed beside it.
    const fairShare = Math.max(MIN_FAIR_SHARE, Math.floor(totalSearchesLeft / Math.max(1, factual.length - i)));
    try {
      const { verdict, queries: claimQueries } = await researchClaimViaAgent(
        client,
        claimUnderTest,
        articleSourcesForBlock,
        now,
        { searchesBudget: fairShare, onActivity, fetchImpl, fetchTimeoutMs, abortSignal }
      );
      totalSearchesLeft = Math.max(0, totalSearchesLeft - claimQueries.length);
      queries.push(...claimQueries);
      claims.push(
        FactualClaimSchema.parse({
          findingId: finding.id,
          blockId: finding.blockId,
          quote: finding.quote,
          claim: finding.quote,
          verification: verdict.verification,
          sources: verdict.sources,
          rationale: verdict.rationale
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
