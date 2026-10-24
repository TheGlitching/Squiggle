/**
 * Payload validation for the analysis stage endpoints.
 *
 * Every field a client can set is bounded here, before a single token is paid
 * for: an unbounded `blocks` array is an unbounded model bill, and an
 * unbounded string is an unbounded prompt. The caps are generous enough for a
 * long-form investigation (roughly 200 000 characters, an order of magnitude
 * above a newspaper feature) and small enough that no single request can cost
 * more than a few cents.
 *
 * These schemas are also the reason no stage handler needs to defend itself:
 * a handler only ever sees a parsed value of the declared shape.
 */
import { z } from 'zod';

/** Longest article accepted, in characters across all blocks. */
export const MAX_ARTICLE_CHARS = 200_000;
/** Most blocks a single article may be split into. */
export const MAX_BLOCKS = 2_000;
/** Longest single block. */
export const MAX_BLOCK_CHARS = 20_000;
/** Most links an article may offer as its own sources. */
export const MAX_CITED_SOURCES = 100;
/** Longest URL accepted anywhere in a payload. */
export const MAX_URL_CHARS = 2_048;

const url = z.string().min(1).max(MAX_URL_CHARS);

export const TextBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['heading', 'paragraph', 'quote', 'caption', 'list-item']),
  text: z.string().max(MAX_BLOCK_CHARS),
  charStart: z.number().int().min(0).max(MAX_ARTICLE_CHARS),
});

export const CitedSourceSchema = z.object({
  href: url,
  domain: z.string().max(255).default(''),
  text: z.string().max(500).default(''),
  blockId: z.string().max(64).optional(),
});

/**
 * The part of the cache preflight that is not the address: the fingerprint of
 * the text the reader's page yields (see `articleTextHash`). The address itself
 * is judged by `analyzeCheck`, which answers `invalid_url`.
 */
export const CheckQuerySchema = z.object({
  text: z.string().regex(/^[0-9a-f]{64}$/),
});

const auditFields = {
  url,
  title: z.string().max(500).default(''),
  author: z.string().max(200).optional(),
  outlet: z.string().max(200).optional(),
  blocks: z.array(TextBlockSchema).min(1).max(MAX_BLOCKS),
  citedSources: z.array(CitedSourceSchema).max(MAX_CITED_SOURCES).default([]),
  /**
   * The extension could only read part of the page (a paywall). It changes
   * what the audit is told it is looking at, never whether it runs.
   */
  partialAccess: z.boolean().default(false),
};

const withinArticleCap = (v: { blocks: Array<{ text: string }> }) =>
  v.blocks.reduce((total, b) => total + b.text.length, 0) <= MAX_ARTICLE_CHARS;
const overArticleCap = { message: `l'article dépasse ${MAX_ARTICLE_CHARS} caractères`, path: ['blocks'] };

export const AuditRequestSchema = z.object(auditFields).refine(withinArticleCap, overArticleCap);

/**
 * The web app's audit: a text the reader pasted. Its address is optional
 * metadata, given to the audit and never fetched; without one the report is
 * filed by its text alone. A pasted text carries no links, so the request may
 * name none, and a run opened from it can never make the server read a page.
 */
export const PastedAuditRequestSchema = z
  .object({ ...auditFields, url: url.optional(), citedSources: z.array(CitedSourceSchema).max(0).default([]) })
  .refine(withinArticleCap, overArticleCap);

export type AuditRequest = z.infer<typeof PastedAuditRequestSchema>;

export const RunIdSchema = z.string().min(1).max(128);

export const ResearchRequestSchema = z.object({
  runId: RunIdSchema,
  findingId: z.string().min(1).max(128),
});

export const SourceCheckRequestSchema = z.object({
  runId: RunIdSchema,
  claimId: z.string().min(1).max(128),
  /**
   * Which cited link to read. It must match a link the audit recorded for this
   * run: the server reads pages the *article* cites, never a URL a client
   * chose, which is what keeps this endpoint from being a fetch proxy.
   */
  sourceUrl: url,
});

export const FinalizeRequestSchema = z.object({ runId: RunIdSchema });
