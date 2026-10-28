/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute origin of the hosted API, without a trailing slash. Empty in
   * production, where the web app and the API are served from one origin.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The bookmark "Analyser avec Squiggle", built by `vite.config.ts`. */
declare module 'virtual:favori' {
  /** A `javascript:` address, with `FAVORI_ORIGIN` where the site's origin goes. */
  export const BOOKMARKLET: string;
  export const FAVORI_ORIGIN: string;
}
