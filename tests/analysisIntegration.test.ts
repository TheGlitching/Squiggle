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

  it('reports progress and reaches a terminal success state', async () => {
    const seen: string[] = [];
    const pipeline = new AnalysisPipeline({
      demoMode: true,
      onProgress: (evt) => seen.push(evt.status),
    });
    await pipeline.analyze({ text: 'Un article de test.', title: 'Test' });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe('completed');
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
