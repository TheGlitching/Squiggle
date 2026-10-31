/**
 * The e-mail a reader gets back from the forwarding address, as HTML and as
 * plain text. One template for every reply: a report (its mark and band, the
 * summary, the passages worth a second look, a strength, what the source
 * checks found, a button to the full report), and the short notices (a
 * refusal, an exhausted quota, a failure) in the same frame.
 *
 * Built for mail clients, not browsers: tables and inline styles, no script,
 * no web font, and the one image is the app icon served by squiggle.fr. It is
 * dark like the site, and says so (`color-scheme`), so Apple Mail and Gmail
 * leave its colours alone rather than invert a light page. Colour carries
 * severity only, as in the extension (`src/ui/tokens/colors.ts`); the tints
 * are those tones blended over the card, since not every client composites
 * an `rgba` background.
 *
 * The report shown is kept short on purpose: the detail lives on the site.
 */
import { getScoreBandLabel, reportSubject, type AnalysisReport, type Finding, type ScoreBand } from '@squiggle/shared';

/** A reply: a heading, a few sentences, and at most one button; or a report. */
export interface MailContent {
  heading: string;
  paragraphs?: string[];
  report?: AnalysisReport;
  action?: { href: string; label: string };
}

type Tone = 'critical' | 'warning' | 'info' | 'positive';

const C = {
  ground: '#0a0a0b',
  card: '#141417',
  border: '#2a2a2f',
  text: '#ece9e3',
  muted: '#948f88',
  accent: '#9061f0',
  accentInk: '#0a0a0b',
  link: '#cdbdfb',
};

/** Fill, text tone, and the tint (the fill at 14 % over the card). */
const TONES: Record<Tone, { fill: string; ink: string; tint: string }> = {
  critical: { fill: '#dc2626', ink: '#f87171', tint: '#301719' },
  warning: { fill: '#d97706', ink: '#fbbf24', tint: '#302215' },
  info: { fill: '#2563eb', ink: '#60a5fa', tint: '#161f35' },
  positive: { fill: '#059669', ink: '#34d399', tint: '#122622' },
};

const BAND_TONES: Record<ScoreBand, Tone> = {
  solide: 'positive',
  perfectible: 'info',
  fragile: 'warning',
  problematique: 'critical',
};

const VERIFICATION: Array<{ state: NonNullable<Finding['verification']>; one: string; many: string; tone?: Tone }> = [
  { state: 'verifiee', one: 'vérifiée', many: 'vérifiées', tone: 'positive' },
  { state: 'douteuse', one: 'douteuse', many: 'douteuses', tone: 'critical' },
  { state: 'non-verifiable', one: 'non vérifiable', many: 'non vérifiables', tone: 'warning' },
  { state: 'non-sourcee', one: 'non sourcée', many: 'non sourcées' },
];

export const LOGO_URL = 'https://squiggle.fr/icons/icon-192.png';
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const SERIF = `Georgia, 'Times New Roman', serif`;
/** A short message's four lines already say most of it: two passages are enough there. */
const MAX_FINDINGS = { article: 3, video: 3, message: 2 };
const MAX_EXPLANATION = 220;

/** The four lines a short message's summary is written in (`shared/src/engine/prompts.ts`). */
const MESSAGE_LINE = /^(De quoi parle-t-on|Qui l[’']affirme|Ce qu[’']on en sait|Ce qui manque)\s*:\s*(.+)$/i;

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Cut at the last full sentence within `max` characters, or else at a word. */
function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence >= max / 3) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.]+$/, '')}…`;
}

function findingTone(f: Finding): Tone {
  if (f.category === 'point-fort') return 'positive';
  return f.severity === 3 ? 'critical' : f.severity === 2 ? 'warning' : 'info';
}

/** The most severe objections, in the article's order among equals. */
function topFindings(report: AnalysisReport): Finding[] {
  const max = MAX_FINDINGS[reportSubject(report)];
  return report.findings
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.category !== 'point-fort')
    .sort((a, b) => b.f.severity - a.f.severity || a.i - b.i)
    .slice(0, max)
    .map(({ f }) => f);
}

function messageLines(summary: string): Array<[string, string]> | null {
  const lines = summary.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => MESSAGE_LINE.exec(l));
  if (parsed.length < 2 || parsed.some((m) => !m)) return null;
  return parsed.map((m) => [m![1].replace(/'/g, '’'), m![2]]);
}

/** What the research found: the claims it settled, then the pages the article cited. */
function sourceSummary(report: AnalysisReport): { counts: Array<{ text: string; tone?: Tone }>; pages?: string; none?: string } {
  const counts = VERIFICATION.flatMap((v) => {
    const n = report.claims.filter((c) => c.verification === v.state).length;
    return n ? [{ text: `${n} ${n > 1 ? v.many : v.one}`, tone: v.tone }] : [];
  });
  const checks = (report.research.sourceChecks ?? []).filter((c) => c.relation !== 'inaccessible');
  let pages: string | undefined;
  if (checks.length) {
    const supports = checks.filter((c) => c.relation === 'supporte').length;
    const contradicts = checks.filter((c) => c.relation === 'contredit').length;
    const parts = [
      supports && `${supports} confirme${supports > 1 ? 'nt' : ''} l’article`,
      contradicts && `${contradicts} le contredi${contradicts > 1 ? 'sent' : 't'}`,
    ].filter(Boolean);
    pages = `${checks.length} source${checks.length > 1 ? 's' : ''} citée${checks.length > 1 ? 's' : ''} lue${checks.length > 1 ? 's' : ''}${parts.length ? ` : ${parts.join(', ')}` : ''}.`;
  }
  if (!counts.length && !pages) {
    return { counts, none: report.research.performed ? 'Aucune affirmation n’a pu être confrontée aux sources.' : 'Aucune affirmation de ce texte n’appelait de recherche.' };
  }
  return { counts, pages };
}

// --- HTML ------------------------------------------------------------------

const P = `margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text};`;

function sectionTitle(text: string): string {
  return `<p style="margin:28px 0 12px 0;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${esc(text)}</p>`;
}

function chip(text: string, tone?: Tone): string {
  const t = tone && TONES[tone];
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:999px;border:1px solid ${t ? t.fill : C.border};background-color:${t ? t.tint : C.ground};font-family:${FONT};font-size:13px;line-height:1.5;color:${t ? t.ink : C.muted};white-space:nowrap;">${esc(text)}</span>`;
}

function findingBlock(f: Finding): string {
  const t = TONES[findingTone(f)];
  const quote = f.quote.trim()
    ? `<p style="margin:0 0 8px 0;font-family:${SERIF};font-size:16px;line-height:1.5;font-style:italic;color:${C.text};">«&nbsp;${esc(f.quote.trim())}&nbsp;»</p>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;border-collapse:separate;">
<tr><td style="padding:14px 16px;background-color:${t.tint};border-left:3px solid ${t.fill};border-radius:0 10px 10px 0;">
<p style="margin:0 0 6px 0;font-family:${FONT};font-size:13px;line-height:1.4;font-weight:700;color:${t.ink};">${esc(f.label)}</p>
${quote}<p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.muted};">${esc(clip(f.explanation, MAX_EXPLANATION))}</p>
</td></tr></table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px 0;">
<tr><td align="center" bgcolor="${C.accent}" style="border-radius:10px;background-color:${C.accent};">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:700;color:${C.accentInk};text-decoration:none;border-radius:10px;">${esc(label)}&nbsp;→</a>
</td></tr></table>`;
}

function reportHtml(report: AnalysisReport, heading: string): string {
  const subject = reportSubject(report);
  const band = getScoreBandLabel(report.scoreBand, subject);
  const tone = TONES[BAND_TONES[report.scoreBand]];
  const lines = subject === 'message' ? messageLines(report.summary) : null;

  const summary = lines
    ? lines
        .map(
          ([label, value]) =>
            `<tr><td style="padding:10px 0;border-top:1px solid ${C.border};"><p style="margin:0 0 3px 0;font-family:${FONT};font-size:13px;line-height:1.4;font-weight:700;color:${C.text};">${esc(label)}</p><p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.muted};">${esc(value)}</p></td></tr>`,
        )
        .join('')
    : '';
  const strength = report.findings.find((f) => f.category === 'point-fort');
  const top = topFindings(report);
  const sources = sourceSummary(report);

  return `<p style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">Rapport Squiggle</p>
<h1 style="margin:0 0 20px 0;font-family:${SERIF};font-size:24px;line-height:1.3;font-weight:600;color:${C.text};">${esc(heading)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;border-collapse:separate;">
<tr><td style="padding:16px 18px;background-color:${tone.tint};border:1px solid ${tone.fill};border-radius:12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding:0 16px 0 0;font-family:${FONT};white-space:nowrap;"><span style="font-size:40px;line-height:1;font-weight:800;color:${tone.ink};">${report.score}</span><span style="font-size:15px;line-height:1;font-weight:600;color:${C.muted};">&nbsp;/100</span></td>
<td valign="middle" style="padding:0;font-family:${FONT};"><p style="margin:0 0 2px 0;font-size:16px;line-height:1.35;font-weight:700;color:${tone.ink};">${esc(band.title)}</p><p style="margin:0;font-size:13px;line-height:1.45;color:${C.muted};">${esc(band.description)}</p></td>
</tr></table>
</td></tr></table>
${lines ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${summary}</table>` : `<p style="${P}">${esc(report.summary)}</p>`}
${top.length ? sectionTitle('À regarder de près') + top.map(findingBlock).join('\n') : ''}
${strength ? sectionTitle('Point fort') + findingBlock(strength) : ''}
${sectionTitle('Vérification des sources')}
${sources.counts.length ? `<div style="margin:0 0 6px 0;">${sources.counts.map((c) => chip(c.text, c.tone)).join('')}</div>` : ''}
${sources.pages ? `<p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.muted};">${esc(sources.pages)}</p>` : ''}
${sources.none ? `<p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.muted};">${esc(sources.none)}</p>` : ''}`;
}

export function renderMailHtml(content: MailContent): string {
  const body = content.report
    ? reportHtml(content.report, content.heading)
    : `<h1 style="margin:0 0 16px 0;font-family:${SERIF};font-size:22px;line-height:1.3;font-weight:600;color:${C.text};">${esc(content.heading)}</h1>
${(content.paragraphs ?? []).filter(Boolean).map((p) => `<p style="${P}">${esc(p)}</p>`).join('\n')}`;
  const action = content.action ? button(content.action.href, content.action.label) : '';

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(content.heading)}</title>
<style>
:root { color-scheme: dark; supported-color-schemes: dark; }
@media (max-width: 600px) { .sq-card { padding: 22px 18px !important; } .sq-outer { padding: 16px 8px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.ground};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ground}" style="background-color:${C.ground};">
<tr><td class="sq-outer" align="center" style="padding:28px 16px;">
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">
<tr><td align="left" style="padding:0 4px 18px 4px;text-align:left;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding:0 10px 0 0;"><img src="${LOGO_URL}" width="30" height="30" alt="" style="display:block;border:0;border-radius:8px;"></td>
<td valign="middle" style="font-family:${FONT};font-size:21px;line-height:1;font-weight:700;letter-spacing:-0.02em;color:${C.text};">squiggle</td>
</tr></table>
</td></tr>
<tr><td class="sq-card" align="left" bgcolor="${C.card}" style="text-align:left;padding:28px 28px;background-color:${C.card};border:1px solid ${C.border};border-radius:14px;">
${body}
${action}
</td></tr>
<tr><td align="left" style="text-align:left;padding:18px 4px 0 4px;font-family:${FONT};font-size:12px;line-height:1.55;color:${C.muted};">
Réponse automatique à votre message transféré à verifier@squiggle.fr. Squiggle lit le texte que vous lui envoyez, sans aller chercher la page.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// --- Plain text ------------------------------------------------------------

function reportText(report: AnalysisReport, heading: string): string[] {
  const subject = reportSubject(report);
  const band = getScoreBandLabel(report.scoreBand, subject);
  const lines = subject === 'message' ? messageLines(report.summary) : null;
  const out = [`RAPPORT SQUIGGLE`, heading, '', `${report.score}/100 - ${band.title}`, band.description, ''];
  if (lines) for (const [label, value] of lines) out.push(`${label} : ${value}`);
  else out.push(report.summary);

  const block = (f: Finding) => {
    out.push('', `- ${f.label}`);
    if (f.quote.trim()) out.push(`  « ${f.quote.trim()} »`);
    out.push(`  ${clip(f.explanation, MAX_EXPLANATION)}`);
  };
  const top = topFindings(report);
  if (top.length) {
    out.push('', 'À REGARDER DE PRÈS');
    top.forEach(block);
  }
  const strength = report.findings.find((f) => f.category === 'point-fort');
  if (strength) {
    out.push('', 'POINT FORT');
    block(strength);
  }
  const sources = sourceSummary(report);
  out.push('', 'VÉRIFICATION DES SOURCES');
  if (sources.counts.length) out.push(`Affirmations : ${sources.counts.map((c) => c.text).join(', ')}.`);
  if (sources.pages) out.push(sources.pages);
  if (sources.none) out.push(sources.none);
  return out;
}

export function renderMailText(content: MailContent): string {
  const out = content.report
    ? reportText(content.report, content.heading)
    : [content.heading, '', ...(content.paragraphs ?? []).filter(Boolean).flatMap((p) => [p, ''])];
  if (content.action) out.push('', `${content.action.label} : ${content.action.href}`);
  out.push('', '--', 'Réponse automatique à votre message transféré à verifier@squiggle.fr.');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
