/**
 * Motion Tokens & Emil Kowalski Principles
 *
 * Implements high-polish physics, custom cubic-bezier curves,
 * duration tokens, and preset animation configurations.
 */

export interface CubicBezierCurve {
  css: string;
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}

export interface SpringConfig {
  type: 'spring';
  mass?: number;
  stiffness?: number;
  damping?: number;
  velocity?: number;
  bounce?: number;
  duration?: number;
}

export interface DurationTokens {
  instant: number; // 0ms (reduced motion / immediate)
  micro: number; // 100ms - 120ms (button press, fine feedback)
  fast: number; // 150ms - 180ms (tooltips, small toggles, badges)
  normal: number; // 200ms - 250ms (card expansion, popovers, tabs)
  moderate: number; // 300ms - 400ms (modals, drawers, reveal sequences)
  deliberate: number; // 500ms - 800ms (score counters, gauge fills)
}

export interface DurationTokensFormatted {
  instant: string;
  micro: string;
  fast: string;
  normal: string;
  moderate: string;
  deliberate: string;
}

export const durationTokens: DurationTokens = {
  instant: 0,
  micro: 120,
  fast: 180,
  normal: 240,
  moderate: 350,
  deliberate: 650,
};

export const durationTokensFormatted: DurationTokensFormatted = {
  instant: `${durationTokens.instant}ms`,
  micro: `${durationTokens.micro}ms`,
  fast: `${durationTokens.fast}ms`,
  normal: `${durationTokens.normal}ms`,
  moderate: `${durationTokens.moderate}ms`,
  deliberate: `${durationTokens.deliberate}ms`,
};

/**
 * High-craft custom easing curves (Emil Kowalski principles: strong ease-out, never ease-in for UI)
 */
export const easingCurves = {
  // Strong punchy ease-out for entering UI elements and instant feedback
  easeOut: {
    css: 'cubic-bezier(0.23, 1, 0.32, 1)',
    p1x: 0.23,
    p1y: 1,
    p2x: 0.32,
    p2y: 1,
  },
  // Decisive ease-out for snappy menu & dropdown reveals
  easeOutQuart: {
    css: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
    p1x: 0.165,
    p1y: 0.84,
    p2x: 0.44,
    p2y: 1,
  },
  // Smooth ease-out for gauge fills and count-ups
  easeOutExpo: {
    css: 'cubic-bezier(0.19, 1, 0.22, 1)',
    p1x: 0.19,
    p1y: 1,
    p2x: 0.22,
    p2y: 1,
  },
  // Natural acceleration/deceleration for moving morphing objects on-screen
  easeInOut: {
    css: 'cubic-bezier(0.77, 0, 0.175, 1)',
    p1x: 0.77,
    p1y: 0,
    p2x: 0.175,
    p2y: 1,
  },
  // iOS-style drawer & sheet transition curve
  easeDrawer: {
    css: 'cubic-bezier(0.32, 0.72, 0, 1)',
    p1x: 0.32,
    p1y: 0.72,
    p2x: 0,
    p2y: 1,
  },
  // Subtle elegant ease for non-spatial color / opacity transitions
  easeElegant: {
    css: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    p1x: 0.25,
    p1y: 0.1,
    p2x: 0.25,
    p2y: 1,
  },
  // Linear for marquee / progress
  linear: {
    css: 'linear',
    p1x: 0,
    p1y: 0,
    p2x: 1,
    p2y: 1,
  },
} as const;

/**
 * Spring physics presets tailored for UI micro-interactions and editorial reveals
 */
export const springPresets = {
  // Snappy responsive feedback for button presses and small toggles
  snappy: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 30,
    mass: 0.8,
    duration: 0.25,
    bounce: 0.05,
  },
  // Bouncy tactile response for stamps, seals, and celebratory badges
  stampSeal: {
    type: 'spring' as const,
    stiffness: 280,
    damping: 18,
    mass: 1.1,
    duration: 0.45,
    bounce: 0.22,
  },
  // Smooth gentle physics for card expansion and accordion drawers
  gentleExpansion: {
    type: 'spring' as const,
    stiffness: 220,
    damping: 24,
    mass: 1.0,
    duration: 0.35,
    bounce: 0.0,
  },
  // Sliding tab indicator with fluid tracking
  tabSlider: {
    type: 'spring' as const,
    stiffness: 350,
    damping: 28,
    mass: 0.9,
    duration: 0.3,
    bounce: 0.08,
  },
  // Subtle interactive hover tilt / follow
  magneticHover: {
    type: 'spring' as const,
    stiffness: 150,
    damping: 15,
    mass: 0.6,
    duration: 0.3,
    bounce: 0.0,
  },
} as const;

export type SpringPresetName = keyof typeof springPresets;
export type EasingCurveName = keyof typeof easingCurves;
