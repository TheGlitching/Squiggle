/**
 * A deliberately tiny history router: enough for a handful of static pages,
 * and one less dependency to audit. Any link must go through `navigate` so the
 * URL, the browser history and the render stay in step.
 */
import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

export type Path = string;

function currentPath(): Path {
  return `${window.location.pathname}${window.location.search}`;
}

/** `at` fixes the path where there is no browser: the build renders each page at its own. */
export function usePath(at?: Path): Path {
  const [path, setPath] = useState<Path>(() => at ?? currentPath());
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('popstate', onChange);
    // A child's effect runs before this one: a redirect on the first render has already moved the URL.
    if (at === undefined) onChange();
    return () => window.removeEventListener('popstate', onChange);
  }, [at]);
  return path;
}

/**
 * `replace` is for a redirect: the page that only sends the reader on must not stay
 * in the history, or Back lands on it and it sends the reader forward again.
 */
export function navigate(to: string, { replace = false }: { replace?: boolean } = {}): void {
  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  // A new page opens at its top, as it would on a full load, not at the scroll of the last one.
  window.scrollTo(0, 0);
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
}

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        // Let the browser handle a new tab / new window as usual.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
