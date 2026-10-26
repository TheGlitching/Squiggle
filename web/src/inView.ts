import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onEnter` once, the first time the element is at least `share` in view.
 * Where the browser cannot tell (no IntersectionObserver), it calls it at once,
 * so nothing waits on an event that will never come.
 */
export function useInView<T extends Element>(onEnter: () => void, share = 0.3): RefObject<T> {
  const ref = useRef<T>(null);
  const enter = useRef(onEnter);
  enter.current = onEnter;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      enter.current();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          enter.current();
        }
      },
      { threshold: share },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [share]);

  return ref;
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
