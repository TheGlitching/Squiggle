import { describe, it, expect } from 'vitest';
import { AnalysisPipeline } from '../src/engine/pipeline';
import { SCORE_DOMAINS } from '../src/engine/types';
import {
  findingsToHighlightTargets,
  countFindingsByFilterCategory,
  filterFindings,
  engineCategoryToFilter,
} from '../src/adapters/findingAdapters';

/**
 * Covers the seam that every per-module test structurally could not see: a
 * report coming out of the real pipeline and surviving the trip into the
 * content script's highlight vocabulary and the sidepanel's filter vocabulary.
 *
 * The background worker used to post raw engine findings straight to the content
 * script, whose fields are named differently in every position, so `findingId`
 * arrived undefined and every highlight silently failed to anchor. Nothing
 * caught it because no test ever crossed the boundary.
 */
describe('analysis pipeline -> UI/content adapters', () => {
  it('produces a structurally valid report through the real pipeline', async () => {
    const pipeline = new AnalysisPipeline({ demoMode: true });
    const report = await pipeline.analyze({ text: 'Un article de test.', title: 'Test' });

    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(['solide', 'perfectible', 'fragile', 'problematique']).toContain(report.scoreBand);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.categories.length).toBeGreaterThan(0);

    // Every scored domain must be a real domain key, or the gauges render blanks.
    for (const category of report.categories) {
      expect(SCORE_DOMAINS[category.domain]).toBeDefined();
    }
  });

  it('reports progress and reaches a terminal success state, carrying the notes feed on every event', async () => {
    const seen: string[] = [];
    const notesSeen: string[][] = [];
    const pipeline = new AnalysisPipeline({
      demoMode: true,
      onProgress: (evt) => {
        seen.push(evt.status);
        // Every progress event carries the cumulative live notes trail so the
        // panel's activity feed can render it without guessing.
        expect(Array.isArray(evt.notes)).toBe(true);
        notesSeen.push(evt.notes ?? []);
      },
    });
    await pipeline.analyze({ text: 'Un article de test.', title: 'Test' });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe('completed');
    // The notes trail is cumulative: each event's list never shrinks.
    for (let i = 1; i < notesSeen.length; i++) {
      expect(notesSeen[i].length).toBeGreaterThanOrEqual(notesSeen[i - 1].length);
    }
  });

  it('maps every finding into a fully populated highlight target', async () => {
    const pipeline = new AnalysisPipeline({ demoMode: true });
    const report = await pipeline.analyze({ text: 'Un article de test.', title: 'Test' });

    const targets = findingsToHighlightTargets(report.findings);
    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      // The exact field that used to arrive undefined.
      expect(target.findingId).toBeTruthy();
      expect(target.quote).toBeTruthy();
      expect(target.title).toBeTruthy();
      expect(['critical', 'warning', 'info', 'positive']).toContain(target.severity);
      expect([
        'logical_fallacy',
        'unverified_source',
        'factual_error',
        'manipulation',
        'editorial_bias',
        'missing_context',
        'methodological_flaw',
        'rigorous_journalism',
      ]).toContain(target.category);
    }
  });

  it('a strength is mapped as positive, not as a defect severity', () => {
    const [target] = findingsToHighlightTargets([
      {
        id: 'f-strength',
        blockId: 'b1',
        quote: 'une source primaire est citée',
        category: 'point-fort',
        severity: 3,
        label: 'Point fort',
        explanation: 'Bonne pratique.',
        confidence: 0.9,
      },
    ]);
    expect(target.severity).toBe('positive');
    expect(target.category).toBe('rigorous_journalism');
  });

  // The in-page highlight is the loudest thing the extension does, and it used
  // to shout at the same volume whatever the verification state said. A missing
  // citation is not a wrong statement, so it must never be painted critical.
  it('never paints an unsourced-but-checkable claim as critical, and keeps that for a doubt', () => {
    const base = {
      id: 'f-src',
      blockId: 'b1',
      quote: 'un entretien accordé la semaine dernière',
      category: 'source-absente' as const,
      severity: 3 as const,
      label: 'Source absente',
      explanation: 'L’article ne nomme pas le média.',
      confidence: 0.9,
    };

    const [unsourced] = findingsToHighlightTargets([{ ...base, verification: 'non-sourcee' }]);
    expect(unsourced.severity).toBe('info');

    const [uncheckable] = findingsToHighlightTargets([{ ...base, verification: 'non-verifiable' }]);
    expect(uncheckable.severity).toBe('warning');

    const [doubted] = findingsToHighlightTargets([{ ...base, verification: 'douteuse' }]);
    expect(doubted.severity).toBe('critical');

    // Evidence backed the article on this one, so there is no fault left to
    // shout about even though the model rated it severity 3.
    const [backed] = findingsToHighlightTargets([{ ...base, verification: 'verifiee' }]);
    expect(backed.severity).toBe('info');

    // And the badge the reader sees in the page names the constat, not a verdict.
    expect(unsourced.category).toBe('unverified_source');
  });

  it('filter counts and filtering agree with the engine taxonomy', async () => {
    const pipeline = new AnalysisPipeline({ demoMode: true });
    const report = await pipeline.analyze({ text: 'Un article de test.', title: 'Test' });

    const counts = countFindingsByFilterCategory(report.findings);
    expect(counts.all).toBe(report.findings.length);

    // Each per-category count must match what the filter actually returns.
    for (const finding of report.findings) {
      const key = engineCategoryToFilter(finding.category);
      expect(filterFindings(report.findings, key).length).toBe(counts[key]);
    }

    // 'all' is a passthrough.
    expect(filterFindings(report.findings, 'all').length).toBe(report.findings.length);
  });
});
