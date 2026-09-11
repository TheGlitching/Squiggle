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

export function usePath(): Path {
  const [path, setPath] = useState<Path>(currentPath);
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return path;
}

export function navigate(to: string): void {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
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
