/**
 * The article's words in a report served by link alone.
 *
 * A reader who has only the link may not be a subscriber: what they are
 * served must point them to the publisher, never stand in for the article. The
 * cache never held the text, only the report, and a report quotes the article
 * in exactly three places: each finding's passage, each researched claim's,
 * and each withdrawn objection's. Here every one of those is held to a short
 * quotation, the length of a sentence or two, and all of them together to a
 * small share of the article: the per-quote ceiling shrinks as the quotes
 * multiply, so a long list of findings cannot rebuild the text piece by piece.
 * The summary is the diagnostic of the method (2 to 4 sentences on how the
 * text argues), not an account of what it says, so it is served as written.
 */
import type { AnalysisReport } from '@squiggle/shared';

/** Longest quote, in words: what the audit prompt already asks of the model. */
export const MAX_QUOTE_WORDS = 25;
/** Shortest ceiling, so a quote still says which passage the finding is about. */
export const MIN_QUOTE_WORDS = 8;
/** Share of the article's words that all the quotes together may reach. */
export const MAX_QUOTED_SHARE = 0.1;
/** Average length of a French word with its space, to count words from characters. */
const CHARS_PER_WORD = 6;

function cut(quote: string, maxWords: number): string {
  const words = quote.trim().split(/\s+/);
  return words.length <= maxWords ? quote : `${words.slice(0, maxWords).join(' ')}…`;
}

/** The report with every quote of the article held to a short quotation. */
export function shortQuotes(report: AnalysisReport): AnalysisReport {
  const quotes = report.findings.length + report.claims.length + (report.research.withdrawn?.length ?? 0);
  const articleWords = Math.floor((report.meta.textLengthChars ?? 0) / CHARS_PER_WORD);
  const share = quotes > 0 ? Math.floor((articleWords * MAX_QUOTED_SHARE) / quotes) : MAX_QUOTE_WORDS;
  const maxWords = Math.max(MIN_QUOTE_WORDS, Math.min(MAX_QUOTE_WORDS, share));
  return {
    ...report,
    findings: report.findings.map((f) => ({ ...f, quote: cut(f.quote, maxWords) })),
    claims: report.claims.map((c) => ({ ...c, quote: cut(c.quote, maxWords) })),
    research: {
      ...report.research,
      withdrawn: report.research.withdrawn?.map((w) => ({ ...w, quote: cut(w.quote, maxWords) })) ?? [],
    },
  };
}
