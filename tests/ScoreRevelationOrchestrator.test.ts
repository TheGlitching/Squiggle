import { describe, it, expect } from 'vitest';
import {
  solveCubicBezier,
  calculateStampPhysics,
  calculateScoreRevelationTimeline,
} from '../src/ui/components/ScoreRevelationOrchestrator';

describe('ScoreRevelationOrchestrator - Motion & Physics Math', () => {
  it('solves cubic bezier accurately at boundary and intermediate steps', () => {
    expect(solveCubicBezier(0)).toBe(0);
    expect(solveCubicBezier(1)).toBe(1);
    const mid = solveCubicBezier(0.5, 0.16, 1.0, 0.3, 1.0);
    expect(mid).toBeGreaterThan(0.5); // editorial curve has fast front
    expect(mid).toBeLessThanOrEqual(1.0);
  });

  it('computes stamp spring physics with overshoot and settles at scale 1, rot 0', () => {
    const startPhysics = calculateStampPhysics(0);
    expect(startPhysics.scale).toBe(1.08);
    expect(startPhysics.rotate).toBe(-2);
    expect(startPhysics.opacity).toBe(0);

    const endPhysics = calculateStampPhysics(1);
    expect(endPhysics.scale).toBe(1);
    expect(endPhysics.rotate).toBe(0);
    expect(endPhysics.opacity).toBe(1);

    const reducedPhysics = calculateStampPhysics(0.5, true);
    expect(reducedPhysics.scale).toBe(1);
    expect(reducedPhysics.rotate).toBe(0);
  });

  it('calculates score revelation timeline and compresses stagger when needed', () => {
    const normalTimeline = calculateScoreRevelationTimeline({
      findingCount: 5,
      reviewPassStagger: 45,
      maxReviewPassDuration: 1200,
    });
    expect(normalTimeline.effectiveReviewPassStagger).toBe(45);

    const largeTimeline = calculateScoreRevelationTimeline({
      findingCount: 50,
      reviewPassStagger: 45,
      maxReviewPassDuration: 1000,
    });
    expect(largeTimeline.effectiveReviewPassStagger).toBeLessThan(45);
    expect(largeTimeline.effectiveReviewPassStagger).toBeGreaterThanOrEqual(12);
  });
});
