/**
 * The proof that the grid does not lean: two invented texts from opposite camps, what
 * the analysis said of each, and, in full view, where the two reports differ. The page
 * asks and shows; the reader concludes. The short form on the home page links here, and
 * this address is the one to put in a message.
 */
import type { ReactNode } from 'react';

import {
  ANALYSED_ON,
  MEME_GRILLE_PATH,
  ONLY_B,
  QUESTIONS,
  RUNS,
  TEXTS,
  type CampFinding,
  type CampText,
} from '../memeGrille';
import { tone } from '../components/Exemple';
import { H3, LEAD, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, Section, TITLE } from '../components/Landing';
import { CONTACT_URL } from '../components/Layout';
import {
  CATEGORY_LABELS,
  SCORE_BANDS,
  VERIFICATION_STATES,
  findingTone,
  scoreBand,
  severityToHighlightSeverity,
} from '../demo';
import { Link } from '../router';

const BODY = 'm-0 text-lg leading-relaxed text-foreground';

/** The site's French typography: the apostrophe, and no line break inside « » or before : ; ? %. The words stay as they came. */
const typo = (text: string) => text.replace(/'/g, '’').replace(/« /g, '«\u00a0').replace(/ ([»:;?%])/g, '\u00a0$1');

/**
 * A paragraph with each finding's passage marked. Passages can overlap (a finding on a
 * whole sentence, another on its first words): the first to start, then the longest, keeps
 * its mark; the card below still shows the other.
 */
function marked(text: string, findings: CampFinding[]): ReactNode[] {
  const spans = findings
    .flatMap((finding) => {
      const start = text.indexOf(finding.quote);
      return start < 0 ? [] : [{ start, end: start + finding.quote.length, finding }];
    })
    .sort((x, y) => x.start - y.start || y.end - x.end);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const { start, end, finding } of spans) {
    if (start < at) continue;
    parts.push(typo(text.slice(at, start)));
    parts.push(
      <mark
        key={start}
        className="hero-hl cursor-auto"
        style={tone(severityToHighlightSeverity(finding.severity, finding.category, finding.verification))}
      >
        {typo(text.slice(start, end))}
      </mark>,
    );
    at = end;
  }
  parts.push(typo(text.slice(at)));
  return parts;
}

/** A text as the reader would see it with the highlights, always labelled as invented. */
function Sheet({ text }: { text: CampText }) {
  return (
    <article
      aria-label={`Texte inventé, ${text.camp}`}
      className="rounded-card bg-paper px-5 py-7 text-paperInk sm:px-8 md:py-9"
    >
      <p className="m-0 text-base font-medium text-paperMuted">Texte inventé, {text.camp}</p>
      <p className="mt-2 mb-0 font-serif text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
        {marked(text.title, text.findings)}
      </p>
      {text.paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-5 mb-0 font-serif text-lg leading-[1.6]">
          {marked(paragraph, text.findings)}
        </p>
      ))}
    </article>
  );
}

/** One finding, in the example's card: its category, its state, its label, the passage, the reason. */
function Finding({ finding, camp }: { finding: CampFinding; camp?: string }) {
  const verification = VERIFICATION_STATES.find((state) => state.state === finding.verification);
  return (
    <div
      className="grid content-start gap-3 rounded-card border border-border bg-surface p-5"
      style={tone(findingTone(finding.severity, finding.category))}
    >
      {camp ? <p className="m-0 text-sm font-medium text-muted">Texte {camp}</p> : null}
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-(--sev-text)">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-(--sev-color)" />
          {CATEGORY_LABELS[finding.category]}
        </span>
        {verification ? (
          <span className={`inline-flex items-center rounded-md border px-2 py-1 text-sm font-medium ${verification.chip}`}>
            {verification.label}
          </span>
        ) : null}
      </p>
      <p className="m-0 font-display text-xl leading-tight font-semibold">{typo(finding.label)}</p>
      <p className="m-0 border-l-2 border-l-(--sev-color) pl-3 font-serif text-lg leading-snug text-muted italic">
        {`« ${typo(finding.quote)} »`}
      </p>
      <p className="m-0 text-base leading-relaxed text-foreground">{typo(finding.explanation)}</p>
    </div>
  );
}

function Score({ text }: { text: CampText }) {
  const band = SCORE_BANDS[scoreBand(text.score)];
  return (
    <p className="m-0 text-lg text-foreground">
      Texte {text.camp}&nbsp;: <strong className="font-semibold tabular-nums">{text.score} sur 100</strong>, {band.title.toLowerCase()}.
    </p>
  );
}

/** The two sides of the home page's short form: the same passage of each text, and the question they raise. */
export function MemeGrilleApercu() {
  return (
    <>
      <ul className="m-0 grid list-none gap-8 p-0">
        {QUESTIONS.slice(3, 6).map(([question, a, b]) => (
          <li key={question}>
            <h3 className={H3}>{question}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 md:gap-6">
              {[
                [TEXTS.a, a] as const,
                [TEXTS.b, b] as const,
              ].map(([text, index]) => (
                <p key={text.camp} className="m-0 border-l-2 border-l-borderControl pl-3 font-serif text-lg leading-snug text-muted italic">
                  <span className="mb-1 block font-sans text-sm font-medium text-foreground not-italic">Texte {typo(text.camp)}</span>
                  {`« ${typo(text.findings[index].quote)} »`}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-8 mb-0">
        <Link to={MEME_GRILLE_PATH} className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`}>
          Comparer les deux rapports
        </Link>
      </p>
    </>
  );
}

export function MemeGrille() {
  const [a, b] = [TEXTS.a, TEXTS.b].map((text) => ({ ...text, camp: typo(text.camp) }));
  return (
    <>
      <div className={`${PAGE} pt-10 pb-12 md:pt-16 md:pb-16`}>
        <h1 className={TITLE}>Même grille, deux camps</h1>
        <p className={`mt-5 ${LEAD} ${MEASURE}`}>
          Deux textes inventés défendent des positions opposées sur l’impôt des grandes fortunes, avec la même
          construction, phrase pour phrase. Squiggle les a relus. Voici ses deux rapports, tels quels&nbsp;: à vous de juger.
        </p>
      </div>

      <Section
        id="textes"
        title="Les deux textes"
        intro="Leurs chiffres et leurs témoins sont inventés&nbsp;: ne les citez pas. Les passages surlignés sont ceux que Squiggle a relevés."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Sheet text={a} />
          <Sheet text={b} />
        </div>
      </Section>

      <Section id="questions" title="Les mêmes questions" intro="De chaque côté, le passage relevé et la raison donnée.">
        <ol className="m-0 grid list-none gap-12 p-0">
          {QUESTIONS.map(([question, indexA, indexB]) => (
            <li key={question}>
              <h3 className={H3}>{question}</h3>
              <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:gap-6">
                <Finding finding={a.findings[indexA]} camp={a.camp} />
                <Finding finding={b.findings[indexB]} camp={b.camp} />
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* The page's credibility rests on this section: what would make a reader doubt it is said here first. */}
      <Section id="differences" title="Ce qui diffère" intro="Les deux rapports ne sont pas identiques. Voici ce qui les sépare.">
        <div className="grid gap-2">
          <Score text={a} />
          <Score text={b} />
        </div>
        <h3 className={`${H3} mt-10`}>Deux constats de plus sur le texte {b.camp}</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:gap-6">
          {ONLY_B.map((index) => (
            <Finding key={index} finding={b.findings[index]} />
          ))}
        </div>
        <p className={`mt-6 ${BODY} ${MEASURE}`}>
          Le titre {a.camp} parle d’«&nbsp;injustice&nbsp;», le titre {b.camp} de «&nbsp;spoliation&nbsp;»&nbsp;: les deux mots
          ne pèsent peut-être pas le même poids. Le 78&nbsp;% du texte {b.camp} a été confronté à une vraie enquête, qui
          porte sur autre chose&nbsp;; celui du texte {a.camp} est resté «&nbsp;non sourcé&nbsp;» dans ce passage.
        </p>
        <p className={`mt-4 ${BODY} ${MEASURE}`}>
          Dans ces deux rapports, ni «&nbsp;pillage&nbsp;» ni «&nbsp;racket&nbsp;» ne sont relevés, et la nuance de la fin,
          identique dans les deux textes, n’est citée dans aucun des deux.
        </p>

        <h3 className={`${H3} mt-12`}>Et si on recommence&nbsp;?</h3>
        <p className={`mt-3 ${BODY} ${MEASURE}`}>
          Le même texte relu deux fois ne reçoit pas exactement le même rapport. Nous avons donc lancé chaque texte trois
          fois. Les rapports ci-dessus sont ceux du premier passage, le seul publié en détail.
        </p>
        <div className="mt-6 max-w-2xl overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <caption className="sr-only">Combien de fois chaque procédé a été relevé, sur trois passages</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-4 font-medium text-muted">
                  Relevé, sur 3 passages
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted">
                  Texte {a.camp}
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium text-muted">
                  Texte {b.camp}
                </th>
              </tr>
            </thead>
            <tbody>
              {RUNS.noted.map(([device, countA, countB]) => (
                <tr key={device} className="border-b border-lineSoft">
                  <th scope="row" className="py-2 pr-4 font-normal">
                    {device}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{countA}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{countB}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-2 pr-4 font-normal">
                  Les trois notes
                </th>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{RUNS.scores.a.join(', ')}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">{RUNS.scores.b.join(', ')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="methode" title="Comment ça a été fait">
        <ul className={`m-0 grid list-disc gap-3 pl-5 text-lg leading-snug ${MEASURE}`}>
          <li>Les deux textes ont été écrits et figés avant la première analyse, et n’ont plus changé ensuite.</li>
          <li>Analyse du {ANALYSED_ON}, avec le moteur et les réglages du site.</li>
          <li>Les rapports sont reproduits sans retouche&nbsp;; seule leur typographie suit celle du site.</li>
          <li>Les sources consultées ne sont pas reproduites&nbsp;: cette page ne cite aucun média.</li>
          <li>Un seul sujet ne prouve pas tout. Essayez la grille sur vos propres textes, de tous bords.</li>
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 max-sm:flex-col max-sm:items-stretch">
          <Link to="/analyser" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Analyser un article
          </Link>
          <a href={CONTACT_URL} className={`${QUIET_LINK} w-fit`}>
            Vous voyez un biais&nbsp;? Écrivez-nous
          </a>
        </div>
      </Section>
    </>
  );
}
