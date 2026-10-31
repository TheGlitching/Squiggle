/**
 * What the routine has learned and been told, read by every production step.
 *
 * A lesson is durable: a writing habit drawn from a comment, from a post the
 * owner removed, from a reply draft the owner changed, from a content pull
 * request edited before it was merged, or from the owner's own e-mail. A
 * writing lesson applies at once and is shown in the next report; a lesson that
 * would change the strategy itself (a pillar, a network, the editorial line) is
 * only ever proposed (rule 7), and the owner decides.
 *
 * A directive is one-off and dated: avoid a subject, one network less or more
 * this week. It expires on its own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Network } from './config';
import type { Ctx } from './context';

export type LessonKind = 'redaction' | 'strategie';

export interface Lesson {
  id: number;
  created_at: string;
  origin: string;
  kind: LessonKind;
  text: string;
  status: 'active' | 'proposee' | 'retiree';
  evidence: string | null;
}

export function addLesson(ctx: Pick<Ctx, 'db'>, lesson: { origin: string; kind: LessonKind; text: string; evidence?: string }): void {
  const text = lesson.text.trim().slice(0, 400);
  if (!text) return;
  if (ctx.db.get('SELECT id FROM lessons WHERE text = ?', text)) return;
  ctx.db.run(
    'INSERT INTO lessons (created_at, origin, kind, text, status, evidence) VALUES (?, ?, ?, ?, ?, ?)',
    new Date().toISOString(),
    lesson.origin,
    lesson.kind,
    text,
    lesson.kind === 'redaction' ? 'active' : 'proposee',
    lesson.evidence?.slice(0, 1000) ?? null,
  );
}

export function activeLessons(ctx: Pick<Ctx, 'db'>): Lesson[] {
  return ctx.db.all<Lesson>("SELECT * FROM lessons WHERE status = 'active' ORDER BY id DESC LIMIT 40");
}

export function lessonsSince(ctx: Pick<Ctx, 'db'>, since: string): Lesson[] {
  return ctx.db.all<Lesson>('SELECT * FROM lessons WHERE created_at >= ? ORDER BY id', since);
}

/** The lessons as the drafting prompts read them. */
export function lessonsBlock(ctx: Pick<Ctx, 'db'>): string {
  const lessons = activeLessons(ctx);
  return lessons.length ? `Leçons tirées des semaines passées (à appliquer) :\n${lessons.map((l) => `- ${l.text}`).join('\n')}` : '';
}

export type DirectiveKind = 'eviter_sujet' | 'reseau_moins' | 'reseau_plus';

export interface Directive {
  id: number;
  kind: DirectiveKind;
  value: string;
  until: string;
  origin: string;
}

export function addDirective(ctx: Pick<Ctx, 'db'>, d: { kind: DirectiveKind; value: string; until: string; origin: string }): void {
  ctx.db.run('INSERT INTO directives (created_at, kind, value, until, origin) VALUES (?, ?, ?, ?, ?)', new Date().toISOString(), d.kind, d.value, d.until, d.origin);
}

export function directives(ctx: Pick<Ctx, 'db'>, at: Date): Directive[] {
  return ctx.db.all<Directive>('SELECT id, kind, value, until, origin FROM directives WHERE until >= ? ORDER BY id', at.toISOString());
}

/** Whether a directive avoids this source: by slug, or by a word of its title. */
export function avoided(list: readonly Directive[], source: { id: string; title: string }): boolean {
  const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return list.some((d) => d.kind === 'eviter_sujet' && d.value.trim() && (source.id.endsWith(d.value.trim()) || fold(source.title).includes(fold(d.value.trim()))));
}

export function networkDirective(list: readonly Directive[], network: Network): 'moins' | 'plus' | null {
  const d = [...list].reverse().find((x) => (x.kind === 'reseau_moins' || x.kind === 'reseau_plus') && x.value === network);
  return d ? (d.kind === 'reseau_moins' ? 'moins' : 'plus') : null;
}

/** An instruction file of `tools/contenu/consignes/`, read from the clone the routine runs from. */
export function consigne(ctx: Pick<Ctx, 'paths'>, name: string): string {
  return readFileSync(join(ctx.paths.repo, 'tools/contenu/consignes', `${name}.md`), 'utf8');
}
