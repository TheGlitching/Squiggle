/**
 * The published blog articles, read from `web/src/blog/` itself so the routine
 * never works from a copy. Drafts (`*.brouillon.ts`) are left out: a post is
 * only ever drawn from a page that is online. The bundle (`build.mjs`) replaces
 * this glob with the same list written as imports.
 */
import type { Article } from '../../../web/src/blog';

const FILES = import.meta.glob<{ default: Article }>(['../../../web/src/blog/*.ts', '!../../../web/src/blog/*.brouillon.ts'], { eager: true });

export const ARTICLES: readonly Article[] = Object.values(FILES).map((file) => file.default);
