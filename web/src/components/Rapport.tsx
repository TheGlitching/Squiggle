/**
 * An engine report over the text it was made from: the mark and its band,
 * the five domains, then the pasted text with every finding's passage
 * highlighted and linked to its explanation, as the extension does in the
 * page itself. Colour carries severity only; a category is named, never
 * coloured.
 */
import { useMemo, useState, type CSSProperties } from 'react';

import { getScoreBandLabel } from '../../../shared/src/engine/bands';
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
import { frenchDate } from '../format';
import { locateFindings, passageTone, type Segment } from '../report';

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
  selected,
  onSelect,
}: {
  finding: Finding;
  located: boolean;
  selected: boolean;
  onSelect: (finding: Finding) => void;
}) {
  const verification = finding.verification ? VERIFICATION[finding.verification] : undefined;
  return (
    <article
      id={findingId(finding)}
      tabIndex={-1}
      style={cardStyle(finding)}
      aria-labelledby={`${findingId(finding)}-titre`}
      className={`scroll-mt-6 rounded-card border bg-surface p-5 outline-hidden focus-visible:ring-1 focus-visible:ring-offset-0 transition-colors duration-160 ease-out ${
        selected ? 'border-accentHover ring-1 ring-accentHover' : 'border-border'
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
      <p className="mt-3 mb-0 text-base leading-relaxed">{finding.explanation}</p>
      {finding.sources && finding.sources.length > 0 ? <Sources sources={finding.sources} /> : null}
      {located ? (
        <a
          href={`#${passageId(finding)}`}
          className="mt-2 inline-block py-3 text-sm text-accentInk underline decoration-borderControl underline-offset-4 hover:decoration-accentInk"
          onClick={(event) => {
            event.preventDefault();
            onSelect(finding);
            reveal(passageId(finding));
          }}
        >
          Voir le passage dans le texte
        </a>
      ) : (
        <p className="mt-4 mb-0 text-sm text-muted">Ce passage n’a pas été retrouvé tel quel dans le texte collé.</p>
      )}
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
  segments,
  selected,
  onSelect,
}: {
  block: TextBlock;
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
  return <p className="mt-0 mb-5 last:mb-0">{content}</p>;
}

export function Rapport({ report, blocks }: { report: AnalysisReport; blocks: TextBlock[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { segments, located } = useMemo(() => locateFindings(blocks, report.findings), [blocks, report.findings]);

  // In reading order: the passages as they come in the text, then those not found in it.
  const findings = useMemo(() => {
    const order = new Map<string, number>();
    let rank = 0;
    for (const block of blocks) {
      for (const segment of segments.get(block.id) ?? []) {
        for (const finding of segment.starts) if (!order.has(finding.id)) order.set(finding.id, rank++);
      }
    }
    return [...report.findings].sort(
      (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [blocks, segments, report.findings]);

  const band = getScoreBandLabel(report.scoreBand);
  const bandTone = severityColor(SCORE_BANDS[report.scoreBand].tone);
  const select = (finding: Finding) => setSelected(finding.id);
  const withdrawn = report.research.withdrawn ?? [];
  const analysedAt = Date.parse(report.meta.analyzedAt);
  const analysedOn = frenchDate(Number.isNaN(analysedAt) ? null : analysedAt);

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
          <p className="mt-5 mb-0 max-w-[68ch] text-lg leading-relaxed">{report.summary}</p>
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

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-12">
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
                segments={segments.get(block.id) ?? []}
                selected={selected}
                onSelect={select}
              />
            ))}
          </article>
        </section>

        <section
          aria-labelledby="constats-titre"
          className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <h2 id="constats-titre" className="m-0 text-base font-semibold">
            {findings.length === 0 ? 'Constats' : `${findings.length} constat${findings.length > 1 ? 's' : ''}`}
          </h2>
          {findings.length === 0 ? (
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
                  selected={selected === finding.id}
                  onSelect={select}
                />
              ))}
            </div>
          )}

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

      <p className="m-0 max-w-[68ch] text-sm text-muted">
        Analyse effectuée via Squiggle, {report.meta.model}, consignes v{report.meta.promptVersion}
        {analysedOn ? `, le ${analysedOn}` : ''}. Elle porte sur le texte collé : l’adresse source, si vous en avez
        donné une, n’a pas été consultée.
      </p>
    </div>
  );
}
