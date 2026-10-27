/**
 * The paper of the lesson: the student sheet (/classe/fiche), with the article's
 * sentences numbered as on the board and nothing of the analysis, and the
 * teacher's answer sheet (/classe/corrige), in the order chosen for the board.
 * Both look like A4 paper on screen and print on A4 (`@media print` in index.css).
 */
import { useMemo, type ReactNode } from 'react';

import { categoryOf, mention, Sentences } from '../components/Board';
import { tone } from '../components/Exemple';
import { PAGE, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from '../components/Landing';
import { deckOf, findingsOf, isTeacherNote, layoutOf, loadSeance, placeOf, questionFor, type Seance } from '../classe';
import { SCORE_BANDS, SEVERITY_LABELS, VERIFICATION_STATES, type SeverityLevel } from '../demo';
import { passageTone } from '../report';
import { Link } from '../router';

const VERIFICATION = Object.fromEntries(VERIFICATION_STATES.map((v) => [v.state, v.label]));

/** The grid's five domains, in a student's words: the reasons to tick on the sheet. */
export const REASONS = [
  'Chiffre ou fait sans source',
  'Raisonnement qui cloche',
  'Mot qui juge à la place des faits',
  'On ne sait pas qui parle',
  'Langue imprécise',
] as const;

const NO_ANSWERS = new Set<string>();

function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** A sheet of paper on screen, and the page itself once printed. */
function Paper({
  name,
  title,
  hint,
  children,
}: {
  name: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className={`${PAGE} py-8 sm:py-12 print:max-w-none print:p-0`}>
      <div className="mb-8 grid gap-4 print:hidden">
        <h1 className={TITLE}>{title}</h1>
        <p className="m-0 max-w-[60ch] text-lg leading-relaxed text-muted">{hint}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => window.print()} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Imprimer
          </button>
          <Link to="/classe" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Retour à la préparation
          </Link>
        </div>
      </div>
      <article
        aria-label={name}
        className="sheet mx-auto grid max-w-[210mm] content-start gap-4 rounded-sm bg-white px-5 py-8 text-[15px] leading-normal text-paperInk shadow-[0_1px_0_#c9c6bf,0_20px_50px_rgb(0_0_0/0.45)] sm:px-[14mm] sm:py-[14mm] print:max-w-none print:rounded-none print:p-0 print:shadow-none"
      >
        {children}
      </article>
    </div>
  );
}

function Missing() {
  return (
    <div className={`${PAGE} py-16 md:py-24`}>
      <h1 className={TITLE}>Aucune séance ouverte</h1>
      <p className="mt-3 mb-0 max-w-[55ch] text-lg leading-relaxed text-muted">
        La fiche et le corrigé viennent d’une séance préparée, ou d’un fichier de séance ouvert dans cet onglet.
      </p>
      <Link to="/classe" className={`${PRIMARY_BUTTON} mt-8`}>
        Ouvrir le mode classe
      </Link>
    </div>
  );
}

function Head({ left, right }: { left: string; right: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-paperEdge pb-3 text-paperMuted">
      <p className="m-0 font-display text-xl font-semibold text-paperInk">{left}</p>
      {right}
    </div>
  );
}

function Article({ seance }: { seance: Seance }) {
  const layout = useMemo(() => layoutOf(seance.blocks, findingsOf(seance)), [seance]);
  return (
    <div className="font-serif text-[17px] leading-[1.75]">
      {layout.blocks.map(({ block, runs }) => {
        const text = <Sentences runs={runs} shown={NO_ANSWERS} current={null} marks={null} />;
        return block.type === 'heading' ? (
          <h2 key={block.id} className="m-0 text-[26px] leading-tight font-semibold">
            {text}
          </h2>
        ) : (
          <p key={block.id} className="mt-3 mb-0">
            {text}
          </p>
        );
      })}
    </div>
  );
}

function Box() {
  return <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0 rounded-[2px] border border-paperMuted" />;
}

export function Fiche() {
  const seance = loadSeance();
  if (!seance) return <Missing />;
  const site = domainOf(seance.source);
  return (
    <Paper
      name="Fiche élève"
      title="Fiche élève"
      hint="À photocopier pour la classe. Elle numérote les phrases comme le tableau, et ne montre rien de l’analyse."
    >
      <Head left="Fiche élève" right={<span>Prénom ou groupe : ……………………… · Date : …………</span>} />
      <p className="m-0">
        <b>1.</b> Lisez l’article. <b>2.</b> Soulignez les phrases qui vous paraissent fragiles. <b>3.</b> Pour chacune,
        notez son numéro et cochez pourquoi.
      </p>
      <Article seance={seance} />
      <table className="w-full border-collapse text-[14px] break-inside-avoid">
        <thead>
          <tr>
            <th className="w-[12%] border border-paperEdge bg-paper px-2 py-1.5 text-left font-semibold">N°</th>
            <th className="border border-paperEdge bg-paper px-2 py-1.5 text-left font-semibold">Pourquoi ?</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4].map((row) => (
            <tr key={row}>
              <td className="border border-paperEdge">&nbsp;</td>
              <td className="border border-paperEdge px-2 py-1.5">
                <span className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {REASONS.map((reason) => (
                    <span key={reason} className="flex items-center gap-2">
                      <Box />
                      {reason}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0">Une phrase vous a fait douter sans savoir dire pourquoi ? Son numéro : ……</p>
      <p className="m-0 border-t border-paperEdge pt-3 text-[13px] text-paperMuted">
        {seance.title ? `« ${seance.title} »` : 'Article'}
        {site ? `, ${site}` : ''}, reproduit pour la classe. Fiche préparée avec Squiggle, squiggle.fr
      </p>
    </Paper>
  );
}

export function Corrige() {
  const seance = loadSeance();
  const layout = useMemo(() => (seance ? layoutOf(seance.blocks, findingsOf(seance)) : null), [seance]);
  if (!seance || !layout) return <Missing />;
  const band = SCORE_BANDS[seance.report.scoreBand];
  return (
    <Paper
      name="Corrigé"
      title="Corrigé"
      hint="Pour vous seul : les constats dans l’ordre de la séance, avec la question à poser pour chacun."
    >
      <Head
        left="Corrigé · enseignant"
        right={<span className="font-semibold tracking-wide text-[#b91c1c] uppercase">Ne pas distribuer</span>}
      />
      <p className="m-0 font-serif text-[22px] leading-tight font-semibold">{seance.title || 'Article sans titre'}</p>
      <p className="m-0">
        <b>
          {band.title}, {Math.round(seance.report.score)}/100.
        </b>{' '}
        {seance.report.summary}
      </p>
      <ol className="m-0 grid list-none gap-0 p-0">
        {deckOf(seance).map((finding, index) => {
          const verification = finding.verification ? VERIFICATION[finding.verification] : null;
          const place = placeOf(layout, finding);
          return (
            <li
              key={finding.id}
              style={tone(passageTone(finding))}
              className="grid gap-1 border-t border-[#e2e0da] py-2.5 break-inside-avoid"
            >
              <p className="m-0 flex items-center gap-2 font-semibold">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--sev-color) print:[print-color-adjust:exact]" />
                {index + 1}. {place ? `${place[0].toUpperCase()}${place.slice(1)} · ` : ''}
                {finding.label}
              </p>
              <p className="m-0 text-[13.5px] text-paperMuted">
                {categoryOf(finding)}
                {isTeacherNote(finding)
                  ? ' · votre remarque'
                  : finding.category === 'point-fort'
                    ? ''
                    : ` · ${SEVERITY_LABELS[finding.severity as SeverityLevel]}`}
                {verification ? ` · ${verification}` : ''} · « {finding.quote} »
              </p>
              <p className="m-0">{finding.explanation}</p>
              <p className="m-0 text-[#5b2fc0]">À poser : {questionFor(finding)}</p>
            </li>
          );
        })}
      </ol>
      <p className="m-0 border-t border-paperEdge pt-3 text-[13px] text-paperMuted">
        {mention(seance)}. Chaque constat cite sa phrase.
      </p>
    </Paper>
  );
}
