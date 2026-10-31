/**
 * An engine report over the text it was made from: the mark and its band,
 * the five domains, then the pasted text with every finding's passage
 * highlighted and linked to its explanation, as the extension does in the
 * page itself. Colour carries severity only; a category is named, never
 * coloured.
 */
import { useMemo, useState, type CSSProperties } from 'react';

import { getScoreBandLabel, reportSubject } from '../../../shared/src/engine/bands';
import { FLAG_REASONS, flagCounters } from '../../../shared/src/hosted/audience';
import type { AnalysisReport, EvidenceSource, Finding, TextBlock } from '../../../shared/src/engine/types';
import {
  CATEGORY_LABELS,
  findingTone,
  formatPoints,
  SCORE_BANDS,
  severityColor,
  SEVERITY_LABELS,
  VERIFICATION_STATES,
  type HighlightSeverity,
} from '../demo';
import { count } from '../count';
import { frenchDate } from '../format';
import { glossaryLink } from '../glossaire';
import { locateFindings, passageTone, type Segment } from '../report';
import { Link } from '../router';
import { PRIMARY_BUTTON } from './Landing';
import { timeAt, videoTime, type Start } from '../transcript';

const VERIFICATION = Object.fromEntries(VERIFICATION_STATES.map((v) => [v.state, v]));

const ORIGIN_LABELS: Record<EvidenceSource['origin'], string> = {
  article: 'cité par l’article',
  search: 'trouvé en recherche',
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const CARD_LINK =
  'inline-block py-3 text-sm text-accentInk underline decoration-borderControl underline-offset-4 hover:decoration-accentInk';

const passageId = (finding: Finding) => `passage-${finding.id}`;
const findingId = (finding: Finding) => `constat-${finding.id}`;

function toneStyle(tone: HighlightSeverity): CSSProperties {
  const { color, tint, text } = severityColor(tone);
  return { '--sev-color': color, '--sev-tint': tint, '--sev-text': text } as CSSProperties;
}

/** As in the extension: a passage is capped by its verification, its card toned by severity alone. */
const passageStyle = (finding: Finding) => toneStyle(passageTone(finding));
const cardStyle = (finding: Finding) => toneStyle(findingTone(finding.severity, finding.category));

/** Bring an element into view inside its own scroller, then hand it the focus. */
function reveal(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}

function Passage({
  segment,
  selected,
  onSelect,
}: {
  segment: Segment;
  selected: string | null;
  onSelect: (finding: Finding) => void;
}) {
  if (segment.findings.length === 0) return <>{segment.text}</>;
  const lead = segment.findings[0];
  const anchor = segment.starts[0];
  return (
    <a
      href={`#${findingId(lead)}`}
      id={anchor ? passageId(anchor) : undefined}
      tabIndex={anchor ? undefined : -1}
      className="annot"
      style={passageStyle(lead)}
      aria-current={segment.findings.some((f) => f.id === selected) ? 'true' : undefined}
      onClick={(event) => {
        event.preventDefault();
        onSelect(lead);
        reveal(findingId(lead));
      }}
    >
      {segment.text}
      {anchor ? <span className="sr-only"> (constat : {lead.label})</span> : null}
    </a>
  );
}

function Badge({ className, children, title }: { className: string; children: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function FindingCard({
  finding,
  located,
  inText = true,
  at,
  selected,
  onSelect,
}: {
  finding: Finding;
  located: boolean;
  /** False for a report found by its link alone: there is no text on the page to point into. */
  inText?: boolean;
  /** Where its passage starts in the video, for a transcript. */
  at: number | undefined;
  selected: boolean;
  onSelect: (finding: Finding) => void;
}) {
  const verification = finding.verification ? VERIFICATION[finding.verification] : undefined;
  const glossary = glossaryLink(finding);
  // "Signaler une erreur": the category and the reason are counted, never the text.
  const [report, setReport] = useState<'closed' | 'open' | 'sent'>('closed');
  return (
    <article
      id={findingId(finding)}
      tabIndex={-1}
      style={cardStyle(finding)}
      aria-labelledby={`${findingId(finding)}-titre`}
      className={`scroll-mt-6 rounded-card border bg-surface p-5 outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-offset-0 transition-colors duration-160 ease-out ${
        selected ? 'border-accentHover ring-1 ring-inset ring-accentHover' : 'border-border'
      }`}
      onFocus={() => onSelect(finding)}
    >
      <p className="m-0 flex items-center gap-2 text-sm font-medium text-[var(--sev-text)]">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--sev-color)]" />
        {CATEGORY_LABELS[finding.category] ?? finding.category}
      </p>
      <h3 id={`${findingId(finding)}-titre`} className="mt-2 mb-0 text-lg font-semibold leading-snug">
        {finding.label}
      </h3>
      {verification || finding.category !== 'point-fort' ? (
        <p className="mt-2 mb-0 flex flex-wrap gap-1.5">
          {verification ? (
            <Badge className={verification.chip} title={verification.hint}>
              {verification.label}
            </Badge>
          ) : null}
          {/* A strength is not graded: "Mineur" beside "Point fort" reads as a fault. */}
          {finding.category !== 'point-fort' ? (
            <Badge className="border-border bg-background text-muted">{SEVERITY_LABELS[finding.severity]}</Badge>
          ) : null}
        </p>
      ) : null}
      <blockquote className="mt-3 mb-0 border-l border-borderControl pl-3 font-serif text-base italic leading-relaxed text-muted">
        « {finding.quote} »
      </blockquote>
      {at !== undefined ? (
        <p className="mt-2 mb-0 text-sm text-muted">
          À <span className="tabular-nums">{videoTime(at)}</span> dans la vidéo
        </p>
      ) : null}
      <p className="mt-3 mb-0 text-base leading-relaxed">{finding.explanation}</p>
      {finding.sources && finding.sources.length > 0 ? <Sources sources={finding.sources} /> : null}
      {located || !inText ? null : (
        <p className="mt-4 mb-0 text-sm text-muted">Ce passage n’a pas été retrouvé tel quel dans le texte collé.</p>
      )}
      {(located && inText) || glossary ? (
        <p className="mt-2 mb-0 flex flex-wrap gap-x-5">
          {located && inText ? (
            <a
              href={`#${passageId(finding)}`}
              className={CARD_LINK}
              onClick={(event) => {
                event.preventDefault();
                onSelect(finding);
                reveal(passageId(finding));
              }}
            >
              Voir le passage dans le texte
            </a>
          ) : null}
          {/* A new tab: leaving would lose the report, which costs an analysis to get back. */}
          {glossary ? (
            <a href={glossary.to} target="_blank" rel="noopener" className={CARD_LINK}>
              {glossary.label}
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : null}
        </p>
      ) : null}
      {/* Apart from the links above: it is a word about the report, not a way through it. */}
      {report === 'closed' ? (
        <button
          type="button"
          aria-expanded={false}
          className="block whitespace-nowrap py-3 text-left text-sm text-muted underline decoration-borderControl underline-offset-4 hover:text-foreground hover:decoration-foreground"
          onClick={() => setReport('open')}
        >
          Signaler une erreur
        </button>
      ) : null}
      {report === 'open' ? (
        <div role="group" aria-labelledby={`${findingId(finding)}-motif`} className="mt-1">
          <p id={`${findingId(finding)}-motif`} className="m-0 text-sm text-muted">
            Qu’est-ce qui ne va pas ?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FLAG_REASONS.map(({ id, label }, index) => (
              <button
                key={id}
                type="button"
                autoFocus={index === 0}
                className="min-h-11 whitespace-nowrap rounded-control border border-borderControl px-3 text-sm hover:border-accentInk"
                onClick={() => {
                  for (const name of flagCounters(finding.category, id)) count(name);
                  setReport('sent');
                }}
              >
                {label}
              </button>
            ))}
            <button type="button" className={`${CARD_LINK} px-1`} onClick={() => setReport('closed')}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {report === 'sent' ? (
        <p role="status" className="mt-2 mb-0 text-sm text-muted">
          Merci, c’est noté. Seuls la catégorie du constat et le motif sont comptés, jamais le texte.
        </p>
      ) : null}
    </article>
  );
}

function Sources({ sources, label = 'Sources consultées' }: { sources: EvidenceSource[]; label?: string }) {
  return (
    <div className="mt-4">
      <p className="m-0 text-sm font-medium text-muted">{label}</p>
      <ul className="mt-2 mb-0 grid list-none gap-2 p-0">
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className="text-sm leading-snug">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accentInk underline decoration-borderControl underline-offset-4 hover:decoration-accentInk"
            >
              {source.title || domainOf(source.url)}
            </a>
            <span className="block text-muted">
              {domainOf(source.url)}, {ORIGIN_LABELS[source.origin]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Block({
  block,
  at,
  segments,
  selected,
  onSelect,
}: {
  block: TextBlock;
  at: number | undefined;
  segments: Segment[];
  selected: string | null;
  onSelect: (finding: Finding) => void;
}) {
  const content = segments.map((segment, index) => (
    <Passage key={index} segment={segment} selected={selected} onSelect={onSelect} />
  ));
  if (block.type === 'heading') {
    return (
      <h3 className="mt-0 mb-5 font-serif text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
        {content}
      </h3>
    );
  }
  return (
    <p className="mt-0 mb-5 last:mb-0">
      {at !== undefined ? (
        <span className="mb-1 block font-sans text-sm text-paperMuted tabular-nums">{videoTime(at)}</span>
      ) : null}
      {content}
    </p>
  );
}

/**
 * The findings a visitor's report kept back, as cards with nothing written on
 * them: the server sent only the tone of each, so the page draws blurred bars
 * in that tone, never words, and says plainly what an account opens.
 */
function Withheld({ withheld, signUp }: { withheld: NonNullable<AnalysisReport['withheld']>; signUp: string }) {
  const others = withheld.length === 1 ? 'l’autre constat' : `les ${withheld.length} autres constats`;
  return (
    <div className="relative mt-3">
      {/* Blocks, not grids: bars sized in percent would widen an auto grid track to fit them. */}
      <div aria-hidden="true" className="space-y-3 select-none">
        {withheld.map((finding, index) => (
          <div
            key={index}
            style={toneStyle(findingTone(finding.severity, finding.category))}
            className="rounded-card border border-border bg-surface p-5"
          >
            <p className="m-0 flex items-center gap-2 text-sm font-medium text-[var(--sev-text)]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--sev-color)]" />
              {CATEGORY_LABELS[finding.category] ?? finding.category}
            </p>
            <div className="mt-3 space-y-2.5 blur-[3px]">
              {['75%', '100%', '84%', '66%'].map((width, line) => (
                <span
                  key={width}
                  style={{ width }}
                  className={`block rounded-full ${line === 0 ? 'h-3.5 bg-[var(--sev-tint)]' : 'h-2.5 bg-border'}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-card border border-accent/50 bg-surface p-5">
        <p className="m-0 text-base font-semibold">Créez un compte gratuit pour voir {others}.</p>
        <p className="mt-1 mb-4 text-sm text-muted">
          Sans carte bancaire. Le rapport complet s’affiche dès votre retour, sans nouvelle analyse.
        </p>
        <Link to={signUp} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
          Créer un compte gratuit
        </Link>
      </div>
    </div>
  );
}

export function Rapport({
  report,
  blocks,
  times = null,
  byLink = false,
  signUp = '/connexion',
}: {
  report: AnalysisReport;
  blocks: TextBlock[];
  /** For a video transcript, where each passage starts in each block, by block id. */
  times?: Record<string, Start[]> | null;
  /** Found by its link alone: there is no text here to annotate, only the report and its short quotes. */
  byLink?: boolean;
  /** Where a visitor's report with findings kept back sends them to open an account. */
  signUp?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { segments, located } = useMemo(() => locateFindings(blocks, report.findings), [blocks, report.findings]);

  // In reading order: the passages as they come in the text, then those not found in it.
  const { findings, findingAt } = useMemo(() => {
    const order = new Map<string, number>();
    const findingAt = new Map<string, number>();
    let rank = 0;
    for (const block of blocks) {
      let offset = 0;
      for (const segment of segments.get(block.id) ?? []) {
        for (const finding of segment.starts) {
          if (order.has(finding.id)) continue;
          order.set(finding.id, rank++);
          const starts = times?.[block.id];
          if (starts) findingAt.set(finding.id, timeAt(starts, offset));
        }
        offset += segment.text.length;
      }
    }
    const findings = [...report.findings].sort(
      (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    return { findings, findingAt };
  }, [blocks, segments, report.findings, times]);

  const band = getScoreBandLabel(report.scoreBand, reportSubject(report, Boolean(times)));
  const bandTone = severityColor(SCORE_BANDS[report.scoreBand].tone);
  const select = (finding: Finding) => setSelected(finding.id);
  const withdrawn = report.research.withdrawn ?? [];
  const analysedAt = Date.parse(report.meta.analyzedAt);
  const analysedOn = frenchDate(Number.isNaN(analysedAt) ? null : analysedAt);
  const withheld = report.withheld ?? [];
  const total = findings.length + withheld.length;

  return (
    <div className="grid gap-10">
      <section aria-labelledby="note-titre" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div>
          <h2 id="note-titre" className="sr-only">
            La note
          </h2>
          <p className="m-0 flex items-baseline gap-2">
            <span className="font-display text-6xl font-semibold leading-none tracking-tight tabular-nums">
              {Math.round(report.score)}
            </span>
            <span className="text-lg text-muted">sur 100</span>
          </p>
          <p className="mt-3 mb-0 text-xl font-semibold" style={{ color: bandTone.text }}>
            {band.title}
          </p>
          <p className="mt-1 mb-0 text-base text-muted">{band.description}</p>
          {/* A message's summary answers its four questions one per line. */}
          {report.summary.split('\n').map((line, i) => (
            <p key={i} className={`${i ? 'mt-3' : 'mt-5'} mb-0 max-w-[55ch] text-lg leading-relaxed`}>
              {line}
            </p>
          ))}
        </div>

        <div>
          <h2 className="m-0 text-base font-semibold">Les cinq domaines</h2>
          <ul className="mt-3 mb-0 grid list-none gap-3 p-0">
            {report.categories.map((category) => (
              <li key={category.domain}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{category.label}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatPoints(category.score)} / {category.maxScore}
                  </span>
                </div>
                <div
                  role="meter"
                  aria-label={category.label}
                  aria-valuemin={0}
                  aria-valuemax={category.maxScore}
                  aria-valuenow={category.score}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border"
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(0, Math.min(100, (category.score / category.maxScore) * 100))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div
        className={
          byLink ? 'grid max-w-2xl gap-10' : 'grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-12'
        }
      >
        {byLink ? null : (
          <section aria-labelledby="texte-titre">
            <h2 id="texte-titre" className="m-0 text-base font-semibold">
              Le texte, annoté
            </h2>
            <p className="mt-1 mb-0 text-sm text-muted">Sélectionnez un passage surligné pour lire son constat.</p>
            {/* The same sheet as the landing's example article: the text is the article, Squiggle's notes sit beside it. */}
            <article
              aria-label="Le texte collé, surligné par Squiggle"
              className="mt-5 rounded-card bg-paper px-6 py-7 font-serif text-lg leading-[1.6] text-paperInk md:px-12 md:py-10"
            >
              {blocks.map((block) => (
                <Block
                  key={block.id}
                  block={block}
                  at={times?.[block.id]?.[0].at}
                  segments={segments.get(block.id) ?? []}
                  selected={selected}
                  onSelect={select}
                />
              ))}
            </article>
          </section>
        )}

        {/* The column scrolls on its own; its right padding, borrowed from the page gutter, keeps
            the cards clear of a macOS overlay scrollbar, whose expanded track paints the page
            background over whatever sits under it. The cards keep the full 24rem. */}
        <section
          aria-labelledby="constats-titre"
          className={
            byLink
              ? undefined
              : 'lg:sticky lg:top-6 lg:-mr-4 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-4'
          }
        >
          <h2 id="constats-titre" className="m-0 text-base font-semibold">
            {total === 0 ? 'Constats' : `${total} constat${total > 1 ? 's' : ''}`}
          </h2>
          {total === 0 ? (
            <p className="mt-3 mb-0 rounded-card border border-dashed border-border px-5 py-4 text-base text-muted">
              Aucun passage relevé : selon la grille, ce texte n’appelle pas de remarque particulière.
            </p>
          ) : (
            <div className="mt-3 grid gap-3">
              {findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  located={located.has(finding.id)}
                  inText={!byLink}
                  at={findingAt.get(finding.id)}
                  selected={selected === finding.id}
                  onSelect={select}
                />
              ))}
            </div>
          )}
          {withheld.length > 0 ? <Withheld withheld={withheld} signUp={signUp} /> : null}

          {withdrawn.length > 0 ? (
            <div className="mt-8">
              <h3 className="m-0 text-base font-semibold">Objections retirées après vérification</h3>
              <p className="mt-1 mb-0 text-sm text-muted">
                Les sources consultées ont confirmé ce que dit le texte : ces points ne lui sont pas reprochés.
              </p>
              <ul className="mt-3 mb-0 grid list-none gap-3 p-0">
                {withdrawn.map((item, index) => (
                  <li key={index} className="rounded-card border border-border bg-surface p-5">
                    <p className="m-0 font-serif text-base italic leading-relaxed text-muted">« {item.quote} »</p>
                    <p className="mt-2 mb-0 text-base leading-relaxed">{item.reason}</p>
                    {item.sources.length > 0 ? (
                      <Sources sources={item.sources} label="Sources qui le confirment" />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!report.research.performed && report.research.skippedReason ? (
            <p className="mt-6 mb-0 rounded-card border border-dashed border-warning/60 px-5 py-4 text-sm text-warningInk">
              {report.research.skippedReason}
            </p>
          ) : null}
        </section>
      </div>

      <p className="m-0 max-w-[55ch] text-sm text-muted">
        {/* The model behind an analysis changes over time; the page names the method, not the model. */}
        Analyse effectuée par Squiggle, consignes v{report.meta.promptVersion}
        {analysedOn ? `, le ${analysedOn}` : ''}.{' '}
        {byLink
          ? 'Elle porte sur le texte que l’extension a lu sur la page, ou sur les sous-titres d’une vidéo ; Squiggle n’a pas consulté ce lien.'
          : 'Elle porte sur le texte collé : l’adresse source, si vous en avez donné une, n’a pas été consultée.'}
      </p>
    </div>
  );
}
