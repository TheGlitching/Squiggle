/**
 * Payload validation for the analysis stage endpoints.
 *
 * Every field a client can set is bounded here, before a single token is paid
 * for: an unbounded `blocks` array is an unbounded model bill, and an
 * unbounded string is an unbounded prompt. Each block and the block count are
 * capped here; the article's total length is not, because a text over
 * `MAX_ARTICLE_CHARS` is a reader-facing refusal (`article_too_long`, with a
 * sentence the reader can act on) rather than a malformed request, so the
 * audit stage checks it before anything else.
 *
 * These schemas are also the reason no stage handler needs to defend itself:
 * a handler only ever sees a parsed value of the declared shape.
 */
import { z } from 'zod';

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
  // Bounded by the largest text the other caps let through, not by
  // MAX_ARTICLE_CHARS: an over-long article must reach the audit stage and be
  // refused there with its own message, not fail here on an offset.
  charStart: z.number().int().min(0).max(MAX_BLOCKS * MAX_BLOCK_CHARS),
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

export const AuditRequestSchema = z.object(auditFields);

/**
 * The web app's audit: a text the reader pasted. Its address is optional
 * metadata, given to the audit and never fetched; without one the report is
 * filed by its text alone. A pasted text carries no links, so the request may
 * name none, and a run opened from it can never make the server read a page.
 */
export const PastedAuditRequestSchema = z
  .object({ ...auditFields, url: url.optional(), citedSources: z.array(CitedSourceSchema).max(0).default([]) });

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
