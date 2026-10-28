import { useSyncExternalStore } from 'react';

const unchanging = () => () => {};

/**
 * A value read from the browser, and `build` while the app takes over a page the build
 * rendered (see `src/main.tsx`): that first render must match the build's, which had no
 * browser. React renders again with the browser's value straight after.
 */
export function useBrowserValue<T>(read: () => T, build: T): T {
  return useSyncExternalStore(unchanging, read, () => build);
}
