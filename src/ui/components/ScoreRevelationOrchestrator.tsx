import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  CSSProperties,
  ReactNode,
} from 'react';
import {
  durationTokens,
  easingCurves,
  springPresets,
  CubicBezierCurve,
  SpringConfig,
} from '../../tokens';
import { useReducedMotion, getMotionSafeTransition, getMotionSafeTransform } from '../../useReducedMotion';
/* =========================================================================
   1. Types & Timeline Specifications (§6.3 Specs)
   ========================================================================= */

export type RevelationStage =
  | 'idle'
  | 'panel_fade'
  | 'score_countup'
  | 'stamp_reveal'
  | 'gauges_fill'
  | 'review_pass'
  | 'completed';

export interface ScoreRevelationConfig {
  targetScore: number;
  scoreBand?: 'solide' | 'perfectible' | 'fragile' | 'problematique';
  categoryCount?: number;
  findingCount?: number;
  autoStart?: boolean;
  onStageChange?: (stage: RevelationStage) => void;
  onComplete?: () => void;
  /** Custom count-up duration in ms (default: 900ms) */
  scoreCountupDuration?: number;
  /** Custom count-up curve (default: cubic-bezier(0.16, 1, 0.3, 1)) */
  scoreCountupCurve?: string;
  /** Stamp drop delay in ms (default: 200ms) */
  stampDelay?: number;
  /** Gauge fill delay in ms (default: 420ms) */
  gaugesDelay?: number;
  /** Gauge stagger delay between categories in ms (default: 60ms) */
  gaugeStagger?: number;
  /** Review pass delay in ms (default: 600ms) */
  reviewPassDelay?: number;
  /** Review pass stagger per finding card in ms (default: 45ms, auto-compressed if >20 items) */
  reviewPassStagger?: number;
  /** Max duration for entire review pass in ms (default: 1200ms) */
  maxReviewPassDuration?: number;
  /** Override reduced motion preference */
  reducedMotionOverride?: boolean;
}

export interface ScoreRevelationTimeline {
  panelFadeStart: number;
  scoreCountupStart: number;
  stampRevealStart: number;
  gaugesFillStart: number;
  reviewPassStart: number;
  effectiveReviewPassStagger: number;
  totalDuration: number;
}

export interface ScoreRevelationState {
  stage: RevelationStage;
  isAnimating: boolean;
  isComplete: boolean;
  isReducedMotion: boolean;
  currentScore: number;
  scoreProgress: number; // 0 to 1
  stampVisible: boolean;
  stampProgress: number; // 0 to 1
  stampScale: number;
  stampRotateDeg: number;
  stampOpacity: number;
  gaugeProgresses: number[]; // Array of 0 to 1 for each category
  revealedFindingsCount: number;
  timeline: ScoreRevelationTimeline;
  start: () => void;
  reset: () => void;
  skipToEnd: () => void;
  replay: () => void;
}

/* =========================================================================
   2. Mathematical & Motion Helpers (Easing & Springs)
   ========================================================================= */

/**
 * Standard cubic bezier evaluation approximation (t: 0..1)
 */
export function solveCubicBezier(
  t: number,
  p1x: number = 0.16,
  p1y: number = 1.0,
  p2x: number = 0.3,
  p2y: number = 1.0
): number {
  const clampedT = Math.max(0, Math.min(1, t));
  if (clampedT === 0 || clampedT === 1) return clampedT;

  // Analytical approximation for ease-out curves
  // 3 * (1-t)^2 * t * p1 + 3 * (1-t) * t^2 * p2 + t^3
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  // Newton-Raphson to solve for x(u) = t
  let u = clampedT;
  for (let i = 0; i < 5; i++) {
    const x = ((ax * u + bx) * u + cx) * u;
    const dx = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(dx) < 1e-6) break;
    u -= (x - clampedT) / dx;
    u = Math.max(0, Math.min(1, u));
  }

  const y = ((ay * u + by) * u + cy) * u;
  return Math.max(0, Math.min(1, y));
}

/**
 * Custom ease-out curve calculator (Kowalski principle: fast entry, long gentle settle)
 */
export function easeOutInterpolate(
  t: number,
  curve: 'easeOut' | 'easeOutQuart' | 'easeOutExpo' | 'editorial' | string = 'editorial'
): number {
  const clampedT = Math.max(0, Math.min(1, t));
  if (curve === 'easeOut') {
    return 1 - Math.pow(1 - clampedT, 3);
  }
  if (curve === 'easeOutQuart') {
    return 1 - Math.pow(1 - clampedT, 4);
  }
  if (curve === 'easeOutExpo') {
    return clampedT === 1 ? 1 : 1 - Math.pow(2, -10 * clampedT);
  }
  // Editorial curve (cubic-bezier(0.16, 1, 0.3, 1))
  return solveCubicBezier(clampedT, 0.16, 1.0, 0.3, 1.0);
}

/**
 * Stamp spring physics calculator (§6.3: Scale 1.08 -> 1, Rotation -2deg -> 0, Opacity 0 -> 1)
 */
export function calculateStampPhysics(
  progress: number,
  isReducedMotion: boolean = false
): { scale: number; rotate: number; opacity: number } {
  if (progress <= 0) {
    return { scale: isReducedMotion ? 1 : 1.08, rotate: isReducedMotion ? 0 : -2, opacity: 0 };
  }
  if (progress >= 1 || isReducedMotion) {
    return { scale: 1.0, rotate: 0, opacity: 1.0 };
  }

  // Overshoot bounce emulation (cubic-bezier(0.34, 1.56, 0.64, 1))
  // Progress 0..0.6: rapid drop & scale down from 1.08 to 0.98
  // Progress 0.6..1.0: spring settle to 1.0
  const t = progress;
  let scale = 1.0;
  let rotate = 0;

  if (t < 0.6) {
    const subT = t / 0.6;
    scale = 1.08 - 0.1 * easeOutInterpolate(subT, 'easeOutQuart'); // 1.08 -> 0.98
    rotate = -2 * (1 - easeOutInterpolate(subT, 'easeOut'));
  } else {
    const subT = (t - 0.6) / 0.4;
    scale = 0.98 + 0.02 * easeOutInterpolate(subT, 'editorial'); // 0.98 -> 1.0
    rotate = 0;
  }

  const opacity = Math.min(1, t * 2.5); // Quick fade in first 40%

  return {
    scale: Number(scale.toFixed(4)),
    rotate: Number(rotate.toFixed(2)),
    opacity: Number(opacity.toFixed(3)),
  };
}

/**
 * Compute sequence timeline parameters and compressed stagger intervals
 */
export function calculateScoreRevelationTimeline(
  config: Partial<ScoreRevelationConfig> = {}
): ScoreRevelationTimeline {
  const panelFadeStart = 0;
  const scoreCountupStart = 120;
  const stampRevealStart = config.stampDelay ?? 200;
  const gaugesFillStart = config.gaugesDelay ?? 420;
  const reviewPassStart = config.reviewPassDelay ?? 600;
  const findingCount = config.findingCount ?? 5;
  const nominalStagger = config.reviewPassStagger ?? 45;
  const maxPassDuration = config.maxReviewPassDuration ?? 1200;

  // Stagger compression rule: if findingCount * nominalStagger > maxPassDuration, compress
  let effectiveReviewPassStagger = nominalStagger;
  if (findingCount > 1) {
    const nominalSpan = (findingCount - 1) * nominalStagger;
    if (nominalSpan > maxPassDuration) {
      effectiveReviewPassStagger = Math.max(12, Math.floor(maxPassDuration / (findingCount - 1)));
    }
  }

  const reviewPassEnd = reviewPassStart + (findingCount > 0 ? (findingCount - 1) * effectiveReviewPassStagger + 200 : 0);
  const scoreEnd = scoreCountupStart + (config.scoreCountupDuration ?? 900);
  const totalDuration = Math.max(reviewPassEnd, scoreEnd, gaugesFillStart + (config.categoryCount ?? 5) * 60 + 500);

  return {
    panelFadeStart,
    scoreCountupStart,
    stampRevealStart,
    gaugesFillStart,
    reviewPassStart,
    effectiveReviewPassStagger,
    totalDuration,
  };
}

/* =========================================================================
   3. useScoreRevelation Hook
   ========================================================================= */

export function useScoreRevelation(
  config: ScoreRevelationConfig
): ScoreRevelationState {
  const prefersReducedMotion = useReducedMotion(config.reducedMotionOverride);
  const isReducedMotion = config.reducedMotionOverride ?? prefersReducedMotion;

  const [stage, setStage] = useState<RevelationStage>(config.autoStart !== false ? 'panel_fade' : 'idle');
  const [isAnimating, setIsAnimating] = useState<boolean>(config.autoStart !== false);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  const [currentScore, setCurrentScore] = useState<number>(0);
  const [scoreProgress, setScoreProgress] = useState<number>(0);

  const [stampVisible, setStampVisible] = useState<boolean>(false);
  const [stampProgress, setStampProgress] = useState<number>(0);
  const [stampPhysics, setStampPhysics] = useState({ scale: 1.08, rotate: -2, opacity: 0 });

  const categoryCount = config.categoryCount ?? 5;
  const [gaugeProgresses, setGaugeProgresses] = useState<number[]>(() => new Array(categoryCount).fill(0));

  const findingCount = config.findingCount ?? 6;
  const [revealedFindingsCount, setRevealedFindingsCount] = useState<number>(0);

  const timeline = useMemo(
    () => calculateScoreRevelationTimeline(config),
    [config.stampDelay, config.gaugesDelay, config.reviewPassDelay, config.findingCount, config.categoryCount, config.scoreCountupDuration, config.reviewPassStagger, config.maxReviewPassDuration]
  );

  const startTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const stageRef = useRef<RevelationStage>(stage);
  stageRef.current = stage;

  const targetScore = config.targetScore;
  const scoreDuration = config.scoreCountupDuration ?? 900;
  const stampDuration = 320;
  const gaugeDuration = 500;
  const gaugeStagger = config.gaugeStagger ?? 60;

  // Complete all states immediately (reduced motion or skip)
  const completeInstantly = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    setCurrentScore(targetScore);
    setScoreProgress(1.0);
    setStampVisible(true);
    setStampProgress(1.0);
    setStampPhysics({ scale: 1.0, rotate: 0, opacity: 1.0 });
    setGaugeProgresses(new Array(categoryCount).fill(1.0));
    setRevealedFindingsCount(findingCount);
    setStage('completed');
    setIsAnimating(false);
    setIsComplete(true);
    config.onStageChange?.('completed');
    config.onComplete?.();
  }, [targetScore, categoryCount, findingCount, config]);

  // Main animation tick loop
  const animateTick = useCallback((now: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = now;
    }
    const elapsed = now - startTimeRef.current;

    // 1. Determine Stage Transitions
    let nextStage: RevelationStage = 'panel_fade';
    if (elapsed >= timeline.reviewPassStart) {
      nextStage = 'review_pass';
    } else if (elapsed >= timeline.gaugesFillStart) {
      nextStage = 'gauges_fill';
    } else if (elapsed >= timeline.stampRevealStart) {
      nextStage = 'stamp_reveal';
    } else if (elapsed >= timeline.scoreCountupStart) {
      nextStage = 'score_countup';
    } else if (elapsed >= timeline.panelFadeStart) {
      nextStage = 'panel_fade';
    }

    if (nextStage !== stageRef.current && nextStage !== 'completed') {
      setStage(nextStage);
      config.onStageChange?.(nextStage);
    }

    // 2. Score Count-Up (§6.3: t=120ms, duration 900ms, cubic-bezier(.16,1,.3,1))
    if (elapsed >= timeline.scoreCountupStart) {
      const scoreElapsed = elapsed - timeline.scoreCountupStart;
      const rawProgress = Math.min(1, scoreElapsed / scoreDuration);
      const easedProgress = easeOutInterpolate(rawProgress, 'editorial');
      const calculatedScore = Math.round(easedProgress * targetScore);
      setCurrentScore(calculatedScore);
      setScoreProgress(easedProgress);
    }

    // 3. Verdict Stamp Reveal (§6.3: t=200ms, duration 320ms, scale 1.08->1, rot -2->0)
    if (elapsed >= timeline.stampRevealStart) {
      setStampVisible(true);
      const stampElapsed = elapsed - timeline.stampRevealStart;
      const rawStampProgress = Math.min(1, stampElapsed / stampDuration);
      setStampProgress(rawStampProgress);
      setStampPhysics(calculateStampPhysics(rawStampProgress, false));
    }

    // 4. Gauge Bars Fill (§6.3: t=420ms, duration 500ms, stagger 60ms)
    if (elapsed >= timeline.gaugesFillStart) {
      const gaugesElapsed = elapsed - timeline.gaugesFillStart;
      const nextGauges = [];
      for (let i = 0; i < categoryCount; i++) {
        const itemStart = i * gaugeStagger;
        if (gaugesElapsed < itemStart) {
          nextGauges.push(0);
        } else {
          const itemProgress = Math.min(1, (gaugesElapsed - itemStart) / gaugeDuration);
          nextGauges.push(easeOutInterpolate(itemProgress, 'easeOutQuart'));
        }
      }
      setGaugeProgresses(nextGauges);
    }

    // 5. Review Pass Stagger (§6.3: t=600ms, stagger 45ms compressed)
    if (elapsed >= timeline.reviewPassStart) {
      const reviewElapsed = elapsed - timeline.reviewPassStart;
      const revealed = Math.min(
        findingCount,
        Math.floor(reviewElapsed / timeline.effectiveReviewPassStagger) + 1
      );
      setRevealedFindingsCount(Math.max(0, revealed));
    }

    // 6. Completion Check
    if (elapsed >= timeline.totalDuration) {
      setCurrentScore(targetScore);
      setScoreProgress(1.0);
      setStampVisible(true);
      setStampProgress(1.0);
      setStampPhysics({ scale: 1.0, rotate: 0, opacity: 1.0 });
      setGaugeProgresses(new Array(categoryCount).fill(1.0));
      setRevealedFindingsCount(findingCount);
      setStage('completed');
      setIsAnimating(false);
      setIsComplete(true);
      config.onStageChange?.('completed');
      config.onComplete?.();
    } else {
      rafIdRef.current = requestAnimationFrame(animateTick);
    }
  }, [
    timeline,
    targetScore,
    scoreDuration,
    stampDuration,
    gaugeDuration,
    gaugeStagger,
    categoryCount,
    findingCount,
    config,
  ]);

  const start = useCallback(() => {
    if (isReducedMotion) {
      completeInstantly();
      return;
    }
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    startTimeRef.current = null;
    setIsAnimating(true);
    setIsComplete(false);
    setStage('panel_fade');
    config.onStageChange?.('panel_fade');
    rafIdRef.current = requestAnimationFrame(animateTick);
  }, [isReducedMotion, completeInstantly, animateTick, config]);

  const reset = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    startTimeRef.current = null;
    setStage('idle');
    setIsAnimating(false);
    setIsComplete(false);
    setCurrentScore(0);
    setScoreProgress(0);
    setStampVisible(false);
    setStampProgress(0);
    setStampPhysics({ scale: isReducedMotion ? 1 : 1.08, rotate: isReducedMotion ? 0 : -2, opacity: 0 });
    setGaugeProgresses(new Array(categoryCount).fill(0));
    setRevealedFindingsCount(0);
    config.onStageChange?.('idle');
  }, [categoryCount, isReducedMotion, config]);

  const skipToEnd = useCallback(() => {
    completeInstantly();
  }, [completeInstantly]);

  const replay = useCallback(() => {
    reset();
    setTimeout(() => {
      start();
    }, 20);
  }, [reset, start]);

  // Initial trigger effect
  useEffect(() => {
    if (config.autoStart !== false) {
      if (isReducedMotion) {
        completeInstantly();
      } else {
        start();
      }
    }
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isReducedMotion]);

  return {
    stage,
    isAnimating,
    isComplete,
    isReducedMotion,
    currentScore,
    scoreProgress,
    stampVisible,
    stampProgress,
    stampScale: stampPhysics.scale,
    stampRotateDeg: stampPhysics.rotate,
    stampOpacity: stampPhysics.opacity,
    gaugeProgresses,
    revealedFindingsCount,
    timeline,
    start,
    reset,
    skipToEnd,
    replay,
  };
}

/* =========================================================================
   4. Orchestrator Context & Provider
   ========================================================================= */

const ScoreRevelationContext = createContext<ScoreRevelationState | null>(null);

export function useScoreRevelationContext(): ScoreRevelationState {
  const ctx = useContext(ScoreRevelationContext);
  if (!ctx) {
    throw new Error('useScoreRevelationContext must be used within a ScoreRevelationProvider');
  }
  return ctx;
}

export interface ScoreRevelationProviderProps extends ScoreRevelationConfig {
  children: ReactNode | ((state: ScoreRevelationState) => ReactNode);
}

export const ScoreRevelationProvider: React.FC<ScoreRevelationProviderProps> = ({
  children,
  ...config
}) => {
  const state = useScoreRevelation(config);

  return (
    <ScoreRevelationContext.Provider value={state}>
      {typeof children === 'function' ? children(state) : children}
    </ScoreRevelationContext.Provider>
  );
};

/* =========================================================================
   5. Animated Reveal UI Wrapper Components
   ========================================================================= */

/**
 * Animated Count-Up Score Display with font scaling & tabular figures
 */
export interface AnimatedScoreCounterProps {
  score?: number;
  maxScore?: number;
  label?: string;
  theme?: 'light' | 'dark';
  className?: string;
  style?: CSSProperties;
}

export const AnimatedScoreCounter: React.FC<AnimatedScoreCounterProps> = ({
  score: controlledScore,
  maxScore = 100,
  label = 'INDICE DE FIABILITÉ',
  theme = 'light',
  className = '',
  style = {},
}) => {
  const ctx = useContext(ScoreRevelationContext);
  const displayScore = controlledScore !== undefined ? controlledScore : (ctx?.currentScore ?? 0);
  const isReducedMotion = ctx?.isReducedMotion ?? false;

  // Determine score color band
  let bandColor = '#B3402F'; // problematique
  let bandLabel = 'PROBLÉMATIQUE';
  if (displayScore >= 80) {
    bandColor = '#3F7A5E';
    bandLabel = 'SOLIDE';
  } else if (displayScore >= 65) {
    bandColor = '#2B4ACB';
    bandLabel = 'PERFECTIBLE';
  } else if (displayScore >= 45) {
    bandColor = '#A8761F';
    bandLabel = 'FRAGILE';
  }

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
    ...style,
  };

  const numberStyle: CSSProperties = {
    fontSize: '56px',
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.03em',
    color: bandColor,
    transition: isReducedMotion ? 'none' : 'color 200ms ease-out',
  };

  const labelStyle: CSSProperties = {
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginTop: '6px',
    color: theme === 'dark' ? '#9CA3AF' : '#6B7079',
  };

  const bandBadgeStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily: 'Bricolage Grotesque, system-ui, sans-serif',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '2px 8px',
    borderRadius: '4px',
    marginTop: '4px',
    backgroundColor: `${bandColor}1F`,
    color: bandColor,
  };

  return (
    <div
      className={`squiggle-score-counter ${className}`}
      style={containerStyle}
      data-testid="animated-score-counter"
      data-score={displayScore}
    >
      <div style={numberStyle} aria-live="polite" aria-atomic="true">
        {displayScore}
      </div>
      <div style={bandBadgeStyle}>{bandLabel}</div>
      <div style={labelStyle}>{label}</div>
    </div>
  );
};

/**
 * Animated Stamp Drop Wrapper (Scale 1.08 -> 1, Rot -2deg -> 0, Opacity 0 -> 1)
 */
export interface AnimatedStampContainerProps {
  children: ReactNode;
  visible?: boolean;
  scale?: number;
  rotateDeg?: number;
  opacity?: number;
  style?: CSSProperties;
  className?: string;
}

export const AnimatedStampContainer: React.FC<AnimatedStampContainerProps> = ({
  children,
  visible: controlledVisible,
  scale: controlledScale,
  rotateDeg: controlledRotate,
  opacity: controlledOpacity,
  style = {},
  className = '',
}) => {
  const ctx = useContext(ScoreRevelationContext);
  const isReduced = ctx?.isReducedMotion ?? false;

  const isVisible = controlledVisible !== undefined ? controlledVisible : (ctx?.stampVisible ?? true);
  const scale = controlledScale !== undefined ? controlledScale : (ctx?.stampScale ?? 1.0);
  const rotate = controlledRotate !== undefined ? controlledRotate : (ctx?.stampRotateDeg ?? 0);
  const opacity = controlledOpacity !== undefined ? controlledOpacity : (ctx?.stampOpacity ?? (isVisible ? 1 : 0));

  if (!isVisible && !isReduced) {
    return (
      <div
        className={`squiggle-stamp-container-hidden ${className}`}
        style={{ opacity: 0, pointerEvents: 'none', ...style }}
        data-testid="animated-stamp-container"
      />
    );
  }

  const transform = isReduced ? 'none' : `scale(${scale}) rotate(${rotate}deg)`;
  const transition = isReduced ? 'opacity 150ms ease-out' : 'none';

  return (
    <div
      className={`squiggle-stamp-container ${className}`}
      style={{
        transform,
        opacity,
        transition,
        transformOrigin: 'center center',
        willChange: isReduced ? 'auto' : 'transform, opacity',
        ...style,
      }}
      data-testid="animated-stamp-container"
      data-scale={scale}
      data-rotate={rotate}
      data-opacity={opacity}
    >
      {children}
    </div>
  );
};

/**
 * Staggered Category Gauge Bar with Smooth Fill Transition
 */
export interface StaggeredGaugeBarProps {
  index: number;
  label: string;
  score: number; // 0 to 100
  color?: string;
  theme?: 'light' | 'dark';
  style?: CSSProperties;
}

export const StaggeredGaugeBar: React.FC<StaggeredGaugeBarProps> = ({
  index,
  label,
  score,
  color = '#2B4ACB',
  theme = 'light',
  style = {},
}) => {
  const ctx = useContext(ScoreRevelationContext);
  const isReduced = ctx?.isReducedMotion ?? false;
  const progressRatio = ctx?.gaugeProgresses?.[index] ?? (ctx?.isComplete ? 1 : 0);

  // Animated score value and bar width
  const animatedScore = isReduced ? score : Math.round(progressRatio * score);
  const barWidthPercent = isReduced ? score : progressRatio * score;

  const trackBg = theme === 'dark' ? '#2A2E37' : '#E5E7EB';

  return (
    <div
      className="squiggle-gauge-bar-item"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        width: '100%',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '12px',
        ...style,
      }}
      data-testid={`staggered-gauge-bar-${index}`}
      data-progress={progressRatio}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: theme === 'dark' ? '#D1D5DB' : '#374151', fontWeight: 500 }}>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color }}>{animatedScore}%</span>
      </div>
      <div
        style={{
          width: '100%',
          height: '6px',
          backgroundColor: trackBg,
          borderRadius: '3px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${barWidthPercent}%`,
            backgroundColor: color,
            borderRadius: '3px',
            transition: isReduced ? 'width 200ms ease-out' : 'none',
          }}
        />
      </div>
    </div>
  );
};

/**
 * Review Pass Stagger Container for Finding Cards
 */
export interface StaggeredFindingCardWrapperProps {
  index: number;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export const StaggeredFindingCardWrapper: React.FC<StaggeredFindingCardWrapperProps> = ({
  index,
  children,
  style = {},
  className = '',
}) => {
  const ctx = useContext(ScoreRevelationContext);
  const isReduced = ctx?.isReducedMotion ?? false;
  const isRevealed = ctx ? index < ctx.revealedFindingsCount : true;

  if (isReduced) {
    return (
      <div
        className={`squiggle-finding-card-stagger ${className}`}
        style={{ opacity: 1, ...style }}
        data-testid={`staggered-card-${index}`}
        data-revealed="true"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`squiggle-finding-card-stagger ${className}`}
      style={{
        opacity: isRevealed ? 1 : 0,
        transform: isRevealed ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 200ms cubic-bezier(0.23, 1, 0.32, 1), transform 200ms cubic-bezier(0.23, 1, 0.32, 1)',
        willChange: isRevealed ? 'auto' : 'transform, opacity',
        ...style,
      }}
      data-testid={`staggered-card-${index}`}
      data-revealed={isRevealed ? 'true' : 'false'}
    >
      {children}
    </div>
  );
};
