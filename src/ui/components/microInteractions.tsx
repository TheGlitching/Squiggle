import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  forwardRef,
  CSSProperties,
  ReactNode,
  ButtonHTMLAttributes,
  HTMLAttributes,
} from 'react';
import { durationTokens, easingCurves } from '../../tokens';
import { useReducedMotion } from '../../useReducedMotion';

/* =========================================================================
   1. Interactive Press Button (Scale 0.97 Feedback, Blur mask state switch)
   ========================================================================= */

export interface PressableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  scaleOnPress?: number;
  hoverElevation?: boolean;
  blurOnTransition?: boolean;
  isTransitioning?: boolean;
  disabled?: boolean;
  reducedMotion?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  (
    {
      scaleOnPress = 0.97,
      hoverElevation = true,
      blurOnTransition = false,
      isTransitioning = false,
      disabled = false,
      reducedMotion,
      children,
      style,
      className,
      onMouseDown,
      onMouseUp,
      onMouseLeave,
      onTouchStart,
      onTouchEnd,
      ...rest
    },
    ref
  ) => {
    const isReduced = useReducedMotion(reducedMotion);
    const [isPressed, setIsPressed] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) setIsPressed(true);
      onMouseDown?.(e);
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLButtonElement>) => {
      setIsPressed(false);
      onMouseUp?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      setIsPressed(false);
      setIsHovered(false);
      onMouseLeave?.(e);
    };

    const handleMouseEnter = () => {
      if (!disabled) setIsHovered(true);
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
      if (!disabled) setIsPressed(true);
      onTouchStart?.(e);
    };

    const handleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
      setIsPressed(false);
      onTouchEnd?.(e);
    };

    const transformStyle = isReduced
      ? 'none'
      : isPressed
      ? `scale(${scaleOnPress})`
      : isHovered && hoverElevation
      ? 'translateY(-1px)'
      : 'scale(1)';

    const transitionStyle = isReduced
      ? 'opacity 150ms ease'
      : `transform ${durationTokens.micro}ms ${easingCurves.easeOut.css}, filter ${durationTokens.fast}ms ${easingCurves.easeElegant.css}, box-shadow ${durationTokens.fast}ms ${easingCurves.easeOut.css}`;

    const filterStyle = blurOnTransition && isTransitioning ? 'blur(1.5px)' : 'none';

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={className}
        onMouseEnter={handleMouseEnter}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: transformStyle,
          transition: transitionStyle,
          filter: filterStyle,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          willChange: isReduced ? 'auto' : 'transform',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
Pressable.displayName = 'Pressable';

/* =========================================================================
   2. Card Expansion Wrapper (Zero-jank accordion / expansion with smooth height)
   ========================================================================= */

export interface ExpandableCardProps extends HTMLAttributes<HTMLDivElement> {
  isExpanded: boolean;
  header: ReactNode;
  children: ReactNode;
  duration?: number;
  reducedMotion?: boolean;
  className?: string;
  style?: CSSProperties;
  contentStyle?: CSSProperties;
  onToggle?: (expanded: boolean) => void;
}

export const ExpandableCard: React.FC<ExpandableCardProps> = ({
  isExpanded,
  header,
  children,
  duration = durationTokens.normal,
  reducedMotion,
  className,
  style,
  contentStyle,
  onToggle,
  ...rest
}) => {
  const isReduced = useReducedMotion(reducedMotion);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(isExpanded ? undefined : 0);
  const [, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!contentRef.current) return;

    if (isExpanded) {
      const scrollHeight = contentRef.current.scrollHeight;
      setHeight(scrollHeight);

      // After transition completes, unset explicit height so dynamic content updates don't clip
      const timeout = setTimeout(() => {
        setHeight(undefined);
      }, duration);
      return () => clearTimeout(timeout);
    } else {
      // First lock to current scrollHeight to enable transition down to 0
      const currentScrollHeight = contentRef.current.scrollHeight;
      setHeight(currentScrollHeight);

      // Force frame tick then set to 0
      const frame = requestAnimationFrame(() => {
        setHeight(0);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isExpanded, duration]);

  const transitionStyle = isReduced
    ? 'opacity 150ms ease'
    : `height ${duration}ms ${easingCurves.easeOut.css}, opacity ${duration}ms ${easingCurves.easeOut.css}`;

  return (
    <div
      className={className}
      style={{
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => onToggle?.(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle?.(!isExpanded);
          }
        }}
        style={{ cursor: 'pointer', outline: 'none' }}
      >
        {header}
      </div>
      <div
        ref={contentRef}
        aria-hidden={!isExpanded}
        style={{
          height: height !== undefined ? `${height}px` : 'auto',
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: transitionStyle,
          willChange: isReduced ? 'auto' : 'height, opacity',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* =========================================================================
   3. Tab Switching Indicator (Fluid sliding underline / pill indicator)
   ========================================================================= */

export interface TabItem<T = string> {
  id: T;
  label: string;
  badge?: string | number;
  icon?: ReactNode;
}

export interface TabSwitcherProps<T = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  variant?: 'pill' | 'underline';
  activeColor?: string;
  activeBg?: string;
  inactiveColor?: string;
  reducedMotion?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function TabSwitcher<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  variant = 'pill',
  activeColor = '#1A1817',
  activeBg = '#F3EFE6',
  inactiveColor = '#7D7571',
  reducedMotion,
  className,
  style,
}: TabSwitcherProps<T>) {
  const isReduced = useReducedMotion(reducedMotion);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
    height: number;
    top: number;
    opacity: number;
  }>({ left: 0, width: 0, height: 0, top: 0, opacity: 0 });

  const updateIndicator = () => {
    const container = containerRef.current;
    const currentTabEl = tabRefs.current.get(activeTab);
    if (!container || !currentTabEl) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = currentTabEl.getBoundingClientRect();

    setIndicatorStyle({
      left: tabRect.left - containerRect.left,
      width: tabRect.width,
      height: tabRect.height,
      top: tabRect.top - containerRect.top,
      opacity: 1,
    });
  };

  useLayoutEffect(() => {
    updateIndicator();
  }, [activeTab]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab]);

  const transitionStyle = isReduced
    ? 'opacity 150ms ease'
    : `transform ${durationTokens.fast}ms ${easingCurves.easeOut.css}, width ${durationTokens.fast}ms ${easingCurves.easeOut.css}, opacity ${durationTokens.fast}ms ease`;

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        padding: variant === 'pill' ? '4px' : '0px',
        borderRadius: variant === 'pill' ? '8px' : '0px',
        backgroundColor: variant === 'pill' ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
        borderBottom: variant === 'underline' ? '1px solid rgba(0, 0, 0, 0.1)' : 'none',
        ...style,
      }}
    >
      {/* Sliding Highlight Indicator */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: variant === 'underline' ? undefined : `${indicatorStyle.top}px`,
          bottom: variant === 'underline' ? '0px' : undefined,
          left: 0,
          transform: isReduced
            ? undefined
            : `translateX(${indicatorStyle.left}px)`,
          width: `${indicatorStyle.width}px`,
          height: variant === 'underline' ? '2px' : `${indicatorStyle.height}px`,
          backgroundColor: variant === 'underline' ? activeColor : activeBg,
          borderRadius: variant === 'pill' ? '6px' : '1px',
          boxShadow: variant === 'pill' ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
          opacity: indicatorStyle.opacity,
          transition: transitionStyle,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Tab Buttons */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
              else tabRefs.current.delete(tab.id);
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            style={{
              position: 'relative',
              zIndex: 2,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 14px',
              border: 'none',
              background: 'transparent',
              color: isActive ? activeColor : inactiveColor,
              fontWeight: isActive ? 600 : 500,
              fontSize: '13px',
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
              transition: `color ${durationTokens.fast}ms ease`,
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 5px',
                  borderRadius: '9999px',
                  backgroundColor: isActive ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                  color: isActive ? activeColor : inactiveColor,
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   4. Staggered Container for Lists & Item Reveals
   ========================================================================= */

export interface StaggerContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  staggerDelayMs?: number;
  initialDelayMs?: number;
  reducedMotion?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const StaggerContainer: React.FC<StaggerContainerProps> = ({
  children,
  staggerDelayMs = 40,
  initialDelayMs = 0,
  reducedMotion,
  className,
  style,
  ...rest
}) => {
  const isReduced = useReducedMotion(reducedMotion);
  const childArray = React.Children.toArray(children);

  return (
    <div className={className} style={style} {...rest}>
      {childArray.map((child, index) => {
        if (!React.isValidElement(child)) return child;

        const delay = initialDelayMs + index * staggerDelayMs;
        const transition = isReduced
          ? 'opacity 150ms ease'
          : `opacity ${durationTokens.normal}ms ${easingCurves.easeOut.css} ${delay}ms, transform ${durationTokens.normal}ms ${easingCurves.easeOut.css} ${delay}ms`;

        return (
          <div
            key={child.key ?? index}
            style={{
              transition,
              opacity: 1,
              transform: isReduced ? 'none' : 'translateY(0)',
              willChange: isReduced ? 'auto' : 'transform, opacity',
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
};
