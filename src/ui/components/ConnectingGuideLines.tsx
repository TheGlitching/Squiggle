import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  CSSProperties,
  SVGAttributes,
} from 'react';
import { durationTokens, easingCurves } from '../../tokens';
import { useReducedMotion } from '../../useReducedMotion';
import { lightTheme, ThemeColors } from '../tokens/colors';

/* =========================================================================
   1. Types & Coordinate Interfaces
   ========================================================================= */

export type AnchorSide = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'auto';

export interface Point {
  x: number;
  y: number;
}

export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export type AnchorTarget =
  | Point
  | HTMLElement
  | React.RefObject<HTMLElement | SVGElement | null>
  | string // CSS selector
  | ElementRect;

export interface GuideLineItem {
  id: string;
  source: AnchorTarget;
  target: AnchorTarget;
  sourceSide?: AnchorSide;
  targetSide?: AnchorSide;
  active?: boolean;
  category?: keyof ThemeColors | string;
  color?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  animated?: boolean;
  curvature?: number;
  showEndpoints?: boolean;
  sourceEndpointSize?: number;
  targetEndpointSize?: number;
  label?: string;
}

export interface BezierOptions {
  sourceSide?: AnchorSide;
  targetSide?: AnchorSide;
  curvature?: number; // 0.0 to 1.0 (default: 0.45)
  minOffset?: number; // Minimum control point extension distance
}

export interface BezierResult {
  d: string;
  source: Point;
  target: Point;
  controlPoint1: Point;
  controlPoint2: Point;
  length?: number;
}

/* =========================================================================
   2. Cubic Bezier Path Computation
   ========================================================================= */

/**
 * Resolves any AnchorTarget into an absolute {x, y} coordinate in viewport space
 */
export function resolveAnchorCoordinate(
  target: AnchorTarget,
  side: AnchorSide = 'auto',
  containerRect?: DOMRect | ElementRect
): Point | null {
  if (!target) return null;

  // 1. Direct Point
  if ('x' in target && 'y' in target && typeof target.x === 'number' && typeof target.y === 'number') {
    const x = containerRect ? target.x - containerRect.left : target.x;
    const y = containerRect ? target.y - containerRect.top : target.y;
    return { x, y };
  }

  // 2. Element Rect
  let rect: DOMRect | ElementRect | null = null;

  if (typeof target === 'string') {
    if (typeof document !== 'undefined') {
      const el = document.querySelector(target);
      if (el) rect = el.getBoundingClientRect();
    }
  } else if ('current' in target) {
    if (target.current) {
      rect = target.current.getBoundingClientRect();
    }
  } else if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    rect = target.getBoundingClientRect();
  } else if ('top' in target && 'left' in target && 'width' in target && 'height' in target) {
    rect = target as ElementRect;
  }

  if (!rect) return null;

  let x = rect.left;
  let y = rect.top;
  const width = rect.width || 0;
  const height = rect.height || 0;

  switch (side) {
    case 'left':
      x = rect.left;
      y = rect.top + height / 2;
      break;
    case 'right':
      x = rect.left + width;
      y = rect.top + height / 2;
      break;
    case 'top':
      x = rect.left + width / 2;
      y = rect.top;
      break;
    case 'bottom':
      x = rect.left + width / 2;
      y = rect.top + height;
      break;
    case 'center':
      x = rect.left + width / 2;
      y = rect.top + height / 2;
      break;
    case 'auto':
    default:
      // Default to center if auto without context
      x = rect.left;
      y = rect.top + height / 2;
      break;
  }

  if (containerRect) {
    x -= containerRect.left;
    y -= containerRect.top;
  }

  return { x, y };
}

/**
 * Automatically calculates the best anchor side based on relative geometry
 */
export function getAutoAnchorSides(
  source: Point,
  target: Point
): { sourceSide: AnchorSide; targetSide: AnchorSide } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;

  // Mostly horizontal layout (typical for sidepanel on right or left)
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) {
      return { sourceSide: 'right', targetSide: 'left' };
    } else {
      return { sourceSide: 'left', targetSide: 'right' };
    }
  } else {
    if (dy > 0) {
      return { sourceSide: 'bottom', targetSide: 'top' };
    } else {
      return { sourceSide: 'top', targetSide: 'bottom' };
    }
  }
}

/**
 * Computes a smooth editorial cubic bezier path between two coordinates
 */
export function computeCubicBezierPath(
  source: Point,
  target: Point,
  options: BezierOptions = {}
): BezierResult {
  const { curvature = 0.45, minOffset = 24 } = options;

  let sourceSide = options.sourceSide || 'auto';
  let targetSide = options.targetSide || 'auto';

  if (sourceSide === 'auto' || targetSide === 'auto') {
    const autoSides = getAutoAnchorSides(source, target);
    if (sourceSide === 'auto') sourceSide = autoSides.sourceSide;
    if (targetSide === 'auto') targetSide = autoSides.targetSide;
  }

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.max(dist * curvature, minOffset);

  // Directional tangent vectors based on side
  const getTangent = (side: AnchorSide, magnitude: number): Point => {
    switch (side) {
      case 'left':
        return { x: -magnitude, y: 0 };
      case 'right':
        return { x: magnitude, y: 0 };
      case 'top':
        return { x: 0, y: -magnitude };
      case 'bottom':
        return { x: 0, y: magnitude };
      case 'center':
      case 'auto':
      default:
        return { x: magnitude * (dx >= 0 ? 1 : -1), y: 0 };
    }
  };

  const t1 = getTangent(sourceSide, offset);
  const t2 = getTangent(targetSide, offset);

  const cp1: Point = {
    x: source.x + t1.x,
    y: source.y + t1.y,
  };

  const cp2: Point = {
    x: target.x + t2.x,
    y: target.y + t2.y,
  };

  // Approximate arc length using chord + control net
  const chord = dist;
  const net =
    Math.sqrt((cp1.x - source.x) ** 2 + (cp1.y - source.y) ** 2) +
    Math.sqrt((cp2.x - cp1.x) ** 2 + (cp2.y - cp1.y) ** 2) +
    Math.sqrt((target.x - cp2.x) ** 2 + (target.y - cp2.y) ** 2);
  const approxLength = (chord + net) / 2;

  const d = `M ${source.x.toFixed(1)},${source.y.toFixed(1)} C ${cp1.x.toFixed(1)},${cp1.y.toFixed(1)} ${cp2.x.toFixed(1)},${cp2.y.toFixed(1)} ${target.x.toFixed(1)},${target.y.toFixed(1)}`;

  return {
    d,
    source,
    target,
    controlPoint1: cp1,
    controlPoint2: cp2,
    length: approxLength,
  };
}

/* =========================================================================
   3. Dynamic Coordinate Hook (Resize, Scroll, Mutation, Raf)
   ========================================================================= */

export function useAnchorTracking(
  items: GuideLineItem[],
  containerRef: React.RefObject<SVGSVGElement | HTMLElement | null>,
  enabled: boolean = true
) {
  const [resolvedPaths, setResolvedPaths] = useState<
    Array<{ item: GuideLineItem; result: BezierResult | null }>
  >([]);

  const updateCoordinates = useCallback(() => {
    if (!enabled) return;

    const containerRect = containerRef.current?.getBoundingClientRect();

    const updated = items.map((item) => {
      if (item.active === false) {
        return { item, result: null };
      }

      const p1 = resolveAnchorCoordinate(item.source, item.sourceSide || 'auto', containerRect);
      const p2 = resolveAnchorCoordinate(item.target, item.targetSide || 'auto', containerRect);

      if (!p1 || !p2) {
        return { item, result: null };
      }

      const result = computeCubicBezierPath(p1, p2, { 
        sourceSide: item.sourceSide,
        targetSide: item.targetSide,
        curvature: item.curvature,
      });

      return { item, result };
    });

    setResolvedPaths(updated);
  }, [items, containerRef, enabled]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Initial update
    updateCoordinates();

    let animationFrameId: number;

    const handleScrollOrResize = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateCoordinates);
    };

    // Scroll listening with passive capture to catch scroll events on any sub-container
    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    // ResizeObserver on body and container
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleScrollOrResize();
      });
      if (document.body) resizeObserver.observe(document.body);
      if (containerRef.current) resizeObserver.observe(containerRef.current);
    }

    // MutationObserver to catch DOM card expansion/collapse
    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && document.body) {
      mutationObserver = new MutationObserver(() => {
        handleScrollOrResize();
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
      });
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [updateCoordinates, enabled, containerRef]);

  return { resolvedPaths, refresh: updateCoordinates };
}

/* =========================================================================
   4. Single Guide Line (SVG Path Component)
   ========================================================================= */

export interface ConnectingGuideLineProps extends SVGAttributes<SVGPathElement> {
  result: BezierResult;
  color?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  animated?: boolean;
  active?: boolean;
  showEndpoints?: boolean;
  sourceEndpointSize?: number;
  targetEndpointSize?: number;
  theme?: ThemeColors;
}

export const ConnectingGuideLine: React.FC<ConnectingGuideLineProps> = ({
  result,
  color,
  strokeWidth = 1.5,
  strokeDasharray = '4 3',
  animated = true,
  active = true,
  showEndpoints = true,
  sourceEndpointSize = 4,
  targetEndpointSize = 5,
  theme = lightTheme,
  className,
  style,
  ...rest
}) => {
  const isReducedMotion = useReducedMotion();
  const pathRef = useRef<SVGPathElement | null>(null);
  const [pathLength, setPathLength] = useState<number>(result.length || 200);
  const [isRendered, setIsRendered] = useState<boolean>(false);

  const strokeColor = color || theme.accent || '#9B2C2C';

  // Measure exact rendered SVG path length for pixel-perfect dash animation
  useEffect(() => {
    if (pathRef.current) {
      try {
        const length = pathRef.current.getTotalLength();
        if (length > 0) {
          setPathLength(length);
        }
      } catch {
        // Fallback to estimated length
      }
    }
    setIsRendered(true);
  }, [result.d]);

  // Animated stroke-dashoffset transition
  const pathStyle: CSSProperties = useMemo(() => {
    if (isReducedMotion || !animated) {
      return {
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray: strokeDasharray || undefined,
        strokeDashoffset: 0,
        opacity: active ? 0.9 : 0.4,
        transition: `opacity ${durationTokens.micro}ms ease`,
        ...style,
      };
    }

    return {
      stroke: strokeColor,
      strokeWidth,
      strokeDasharray: strokeDasharray ? undefined : pathLength,
      strokeDashoffset: isRendered ? 0 : pathLength,
      opacity: active ? 0.95 : 0.35,
      transition: [
        `stroke-dashoffset ${durationTokens.moderate}ms ${easingCurves.easeOut.css}`,
        `opacity ${durationTokens.normal}ms ${easingCurves.easeOut.css}`,
        `stroke ${durationTokens.fast}ms ease`,
      ].join(', '),
      ...style,
    };
  }, [
    isReducedMotion,
    animated,
    strokeColor,
    strokeWidth,
    strokeDasharray,
    pathLength,
    isRendered,
    active,
    style,
  ]);

  return (
    <g className="fc-guide-line-group" opacity={active ? 1 : 0.4}>
      {/* Background glow / soft highlight track */}
      <path
        d={result.d}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth + 3}
        strokeOpacity={0.12}
        strokeLinecap="round"
      />

      {/* Main Bezier Guide Line */}
      <path
        ref={pathRef}
        d={result.d}
        fill="none"
        strokeLinecap="round"
        style={pathStyle}
        className={className}
        {...rest}
      />

      {/* Endpoints & Editorial Markers */}
      {showEndpoints && (
        <>
          {/* Source Endpoint (Sidepanel Card Anchor) - Solid Round Pin */}
          <circle
            cx={result.source.x}
            cy={result.source.y}
            r={sourceEndpointSize}
            fill={strokeColor}
            stroke={theme.surface || '#FFFFFF'}
            strokeWidth={1.5}
            style={{
              transition: isReducedMotion
                ? 'none'
                : `transform ${durationTokens.fast}ms ${easingCurves.easeOut.css}`,
            }}
          />

          {/* Target Endpoint (Viewport Text Target) - Editorial Diamond / Reticle */}
          <g transform={`translate(${result.target.x}, ${result.target.y})`}>
            {/* Outer halo */}
            <circle
              r={targetEndpointSize + 2}
              fill="none"
              stroke={strokeColor}
              strokeWidth={1}
              strokeOpacity={0.4}
            />
            {/* Center target dot */}
            <circle
              r={targetEndpointSize - 1.5}
              fill={strokeColor}
              stroke={theme.surface || '#FFFFFF'}
              strokeWidth={1}
            />
          </g>
        </>
      )}
    </g>
  );
};

/* =========================================================================
   5. Main Connecting Guide Lines Overlay Component
   ========================================================================= */

export interface ConnectingGuideLinesProps {
  items: GuideLineItem[];
  enabled?: boolean;
  theme?: ThemeColors;
  className?: string;
  style?: CSSProperties;
  zIndex?: number;
}

export const ConnectingGuideLines: React.FC<ConnectingGuideLinesProps> = ({
  items,
  enabled = true,
  theme = lightTheme,
  className = '',
  style,
  zIndex = 9999,
}) => {
  const containerRef = useRef<SVGSVGElement | null>(null);
  const { resolvedPaths } = useAnchorTracking(items, containerRef, enabled);

  if (!enabled || items.length === 0) {
    return null;
  }

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={`fc-connecting-guidelines fixed inset-0 w-full h-full pointer-events-none select-none overflow-visible ${className}`}
      style={{
        zIndex,
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        ...style,
      }}
    >
      <defs>
        {/* Soft shadow filter for editorial depth */}
        <filter id="fc-guide-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {resolvedPaths.map(({ item, result }) => {
        if (!result) return null;

        // Extract category specific theme color if provided
        let itemColor = item.color;
        if (!itemColor && item.category && theme) {
          const catKey = item.category as keyof ThemeColors;
          if (typeof theme[catKey] === 'string') {
            itemColor = theme[catKey] as string;
          }
        }

        return (
          <ConnectingGuideLine
            key={item.id}
            result={result}
            color={itemColor}
            strokeWidth={item.strokeWidth}
            strokeDasharray={item.strokeDasharray}
            animated={item.animated}
            active={item.active !== false}
            showEndpoints={item.showEndpoints}
            sourceEndpointSize={item.sourceEndpointSize}
            targetEndpointSize={item.targetEndpointSize}
            theme={theme}
          />
        );
      })}
    </svg>
  );
};

export default ConnectingGuideLines;