/**
 * The report a visitor without an account is served: the note, the summary
 * and the five domains, the first finding in reading order in full, and of
 * the others only how many there are and the tone each is drawn in. The rest
 * is not hidden by the page, it never leaves the server: the full report is
 * in the shared cache, served to the same text once the reader has an account.
 */
import type { AnalysisReport, Finding } from '@squiggle/shared';

/** Where a finding sits in the text; one the engine could not place comes last. */
const position = (finding: Finding) => finding.charStart ?? Number.MAX_SAFE_INTEGER;

export function withholdForVisitor(report: AnalysisReport): AnalysisReport {
  const [first, ...rest] = [...report.findings].sort((a, b) => position(a) - position(b));
  const claims = report.claims.filter((claim) => first !== undefined && claim.findingId === first.id);
  const kept = new Set(claims.map((claim) => claim.id));
  return {
    ...report,
    findings: first ? [first] : [],
    withheld: rest.map(({ category, severity }) => ({ category, severity })),
    claims,
    // Which source each passage leans on quotes the text as the findings do.
    sourcing: undefined,
    // The domains' notes stay; their notes in words name the findings.
    categories: report.categories.map((category) => ({ ...category, strengths: [], weaknesses: [] })),
    research: {
      ...report.research,
      queries: [],
      // An objection research withdrew quotes the text and says why: it is a finding's content too.
      withdrawn: [],
      sourceChecks: report.research.sourceChecks?.filter((check) => check.claimId !== undefined && kept.has(check.claimId)),
    },
    // The audit's raw marks carry the same notes in words; only the engine reads them.
    meta: { ...report.meta, rawScores: undefined },
  };
}
