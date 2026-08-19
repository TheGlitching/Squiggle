import { useSyncExternalStore } from 'react';
import { easingCurves, durationTokens } from './tokens';

/**
 * Media query string for standard prefers-reduced-motion
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Helper to subscribe to prefers-reduced-motion media query changes
 */
function subscribeReducedMotion(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }
  const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY);

  // Use addEventListener with fallback for older browsers
  if (mediaQueryList.addEventListener) {
    mediaQueryList.addEventListener('change', callback);
    return () => mediaQueryList.removeEventListener('change', callback);
  } else {
    // addListener/removeListener are deprecated but still declared in lib.dom,
    // so the previous @ts-expect-error suppressions had nothing to suppress.
    mediaQueryList.addListener(callback);
    return () => {
      mediaQueryList.removeListener(callback);
    };
  }
}

/**
 * Snapshot getter for SSR-safe / sync media query state
 */
function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Server snapshot always defaults to false
 */
function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * useReducedMotion Hook
 *
 * Reads client OS prefers-reduced-motion setting and updates reactively.
 * Ensures SSR safety with hydration resilience and zero layout flicker.
 */
export function useReducedMotion(overridePreference?: boolean): boolean {
  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  if (overridePreference !== undefined) {
    return overridePreference;
  }

  return prefersReduced;
}

/**
 * Motion safe transition configuration generator
 */
export interface TransitionOptions {
  property?: string;
  duration?: number;
  easing?: string;
  delay?: number;
  reducedMotionFallback?: 'instant' | 'fade-only' | 'none';
}

export function getMotionSafeTransition(
  options: TransitionOptions = {},
  isReducedMotion: boolean = false
): string {
  const {
    property = 'all',
    duration = durationTokens.normal,
    easing = easingCurves.easeOut.css,
    delay = 0,
    reducedMotionFallback = 'fade-only',
  } = options;

  if (isReducedMotion) {
    if (reducedMotionFallback === 'instant') {
      return 'none';
    }
    if (reducedMotionFallback === 'fade-only') {
      // Retain gentle opacity transition (150ms) to avoid jarring snaps, but strip transform
      return `opacity 150ms ${easingCurves.easeElegant.css}`;
    }
    return 'none';
  }

  const delayStr = delay > 0 ? ` ${delay}ms` : '';
  return `${property} ${duration}ms ${easing}${delayStr}`;
}

/**
 * Transform styling utility that disables spatial motion when reduced motion is preferred
 */
export function getMotionSafeTransform(
  normalTransform: string,
  isReducedMotion: boolean = false,
  reducedFallback: string = 'none'
): string {
  if (isReducedMotion) {
    return reducedFallback;
  }
  return normalTransform;
}
