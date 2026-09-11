/**
 * The chokepoint between a model's output and the shared cache.
 *
 * A cached report is written by one reader's analysis and served to every
 * later reader of the same article. That makes the cache the one place in the
 * product where text derived from an article A can reach a reader of article
 * A who never chose to trust its author — so a poisoned article must not be
 * able to plant anything durable in it.
 *
 * The engine already validates the model's output against its zod schemas at
 * parse time, so the *shape* is guaranteed before anything gets here. What a
 * schema does not constrain is what a string may contain or how long it may
 * be, and that is exactly what this module bounds:
 *
 *  - invisible and control characters are removed. Not because they render
 *    badly, but because they are the carrier for the tricks that survive a
 *    schema: C0/C1 controls (a stray ESC is an ANSI sequence in any terminal
 *    that later reads a log), bidi overrides (U+202A–U+202E, U+2066–U+2069)
 *    which reorder displayed text against its byte order, zero-width joiners
 *    and spaces used to smuggle instructions past a human reader, and
 *    U+2028/U+2029 which are line terminators to a JavaScript parser but not
 *    to JSON;
 *  - every string is capped, so no single field can bloat the cache;
 *  - every array is capped, so a thousand findings cannot either;
 *  - the whole serialized report is then measured, and one that still does
 *    not fit is not cached at all.
 *
 * `sanitizeReport` is applied on the way in AND on the way out. On the way in
 * is where it matters; on the way out is what makes "no reader is ever served
 * unsanitized text" true regardless of which build wrote the row.
 */

/** Longest single string kept in a cached report. */
export const MAX_FIELD_CHARS = 4_000;
/** Longest array kept in a cached report. */
export const MAX_ARRAY_ITEMS = 200;
/** Deepest object nesting walked; anything below is dropped, not recursed. */
const MAX_DEPTH = 12;

/**
 * Characters removed from every string. Each range is here for a reason, not
 * for tidiness — see the module header.
 */
const STRIP_RE = new RegExp(
  [
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', // C0 controls, keeping \t and \n
    '[\\u0080-\\u009F]', // C1 controls
    '[\\u200B-\\u200F]', // zero-width + LTR/RTL marks
    '[\\u202A-\\u202E]', // bidi embedding / override
    '[\\u2060-\\u2064]', // word joiner and invisible operators
    '[\\u2066-\\u2069]', // bidi isolates
    '\\uFEFF', // byte-order mark
  ].join('|'),
  'gu',
);

/** Strip the invisible carriers, fold the JS-only line terminators, cap. */
export function sanitizeString(value: string): string {
  const cleaned = value.replace(/[\u2028\u2029]/g, '\n').replace(STRIP_RE, '');
  return cleaned.length > MAX_FIELD_CHARS ? `${cleaned.slice(0, MAX_FIELD_CHARS)}…` : cleaned;
}

/**
 * Sanitize an arbitrary JSON value. Deliberately structure-agnostic: it walks
 * whatever the engine produced rather than enumerating the report's fields,
 * so a field added to the report later is covered without anyone remembering
 * to add it here.
 */
export function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return null;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[sanitizeString(key)] = sanitizeJson(item, depth + 1);
    }
    return out;
  }
  // undefined, function, symbol, bigint: not JSON, and not something a report
  // is allowed to smuggle through.
  return null;
}

export function sanitizeReport<T>(report: T): T {
  return sanitizeJson(report) as T;
}
