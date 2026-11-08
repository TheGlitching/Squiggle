import { tone } from '../components/Exemple';
import { SquiggleMark } from '../components/Iso';
import { H1, LEAD, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, Section } from '../components/Landing';
import { CONTACT_URL } from '../components/Layout';
import { count } from '../count';
import { CATEGORY_LABELS, findingTone, type DemoCategory, type SeverityLevel } from '../demo';
import { glossaryLink, typo } from '../glossaire';
import { dateLongue } from '../blog';
import DISCOURS from '../presidentielle.json';
import { Link } from '../router';

/**
 * Two made-up speeches and what one run of the tool found in each, as it came:
 * `presidentielle.json` holds its findings word for word. A finding's verdict and the
 * sources behind it are left out, because research on an invented text can land on
 * real parties, and the page says so. Fixing a finding's wording here would make the
 * page's one claim false: run the analysis again instead.
 */
type Discours = (typeof DISCOURS)[number];
type Constat = Discours['constats'][number];

const CATEGORIES = Object.keys(CATEGORY_LABELS) as DemoCategory[];

/** A speech's paragraph cut around the passages its findings quote; passages that overlap are one highlight. */
export function marked(paragraph: string, constats: readonly Constat[]): Array<string | [string]> {
  const spans = constats
    .flatMap(({ quote }) => {
      const start = paragraph.indexOf(quote);
      return start < 0 ? [] : [[start, start + quote.length]];
    })
    .sort((a, b) => a[0] - b[0]);
  const parts: Array<string | [string]> = [];
  let at = 0;
  for (const [start, end] of spans) {
    if (end <= at) continue;
    const from = Math.max(start, at);
    if (from > at) parts.push(paragraph.slice(at, from));
    parts.push([paragraph.slice(from, end)]);
    at = end;
  }
  if (at < paragraph.length) parts.push(paragraph.slice(at));
  return parts;
}

function AnalyseLink({ children }: { children: string }) {
  return (
    <Link to="/analyser" onClick={() => count('click_presidentielle_analyser')} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
      {children}
    </Link>
  );
}

function Feuille({ item }: { item: Discours }) {
  return (
    <div className="rounded-card bg-paper px-5 py-7 text-paperInk sm:px-8">
      <p className="m-0 text-base font-medium text-paperMuted">Un discours inventé</p>
      <h3 className="mt-2 mb-0 font-serif text-2xl leading-tight font-semibold tracking-tight">{item.titre}</h3>
      {item.texte.map((paragraph) => (
        <p key={paragraph} className="mt-4 mb-0 font-serif text-lg leading-[1.6]">
          {marked(paragraph, item.constats).map((part, index) =>
            typeof part === 'string' ? (
              typo(part)
            ) : (
              <mark key={index} className="hero-hl cursor-default" style={tone('warning')}>
                {typo(part[0])}
              </mark>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function ConstatCard({ constat }: { constat: Constat }) {
  const category = constat.category as DemoCategory;
  const glossary = glossaryLink(constat as { label: string; category: DemoCategory });
  return (
    <li className="grid gap-2 border-t border-border pt-4" style={tone(findingTone(constat.severity as SeverityLevel, category))}>
      <p className="m-0 inline-flex items-center gap-2 text-sm font-semibold text-(--sev-text)">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-(--sev-color)" />
        {CATEGORY_LABELS[category]}
      </p>
      <p className="m-0 font-display text-xl leading-snug font-semibold">{typo(constat.label)}</p>
      <p className="m-0 border-l-2 border-l-(--sev-color) pl-3 font-serif text-lg leading-snug text-muted italic">
        {typo(`« ${constat.quote} »`)}
      </p>
      <p className="m-0 text-base leading-relaxed">{typo(constat.explanation)}</p>
      {glossary ? (
        <p className="m-0">
          <Link to={glossary.to} className={QUIET_LINK}>
            {glossary.label}
          </Link>
        </p>
      ) : null}
    </li>
  );
}

const QUESTIONS: ReadonlyArray<{ question: string; detail: string; vers: string; notion: string }> = [
  {
    question: 'Quelles options ont disparu ?',
    detail: '« Soit ceci, soit le désastre » : cherchez la troisième voie que le texte dit impossible.',
    vers: '/glossaire/faux-dilemme',
    notion: 'Le faux dilemme',
  },
  {
    question: 'D’où vient ce chiffre ?',
    detail: 'Un sondage a un institut, une date, une question. Un chiffrage a un document qu’on peut lire.',
    vers: '/glossaire/chiffre-sans-origine',
    notion: 'Le chiffre sans origine',
  },
  {
    question: 'Qui est ce témoin, et que prouve-t-il ?',
    detail: 'Une histoire touchante peut être vraie : elle ne dit pas combien de personnes vivent la même.',
    vers: '/glossaire/generalisation-hative',
    notion: 'La généralisation hâtive',
  },
  {
    question: 'Que dit-on de l’adversaire ?',
    detail: 'Lui prête-t-on des intentions plutôt que de discuter ses propositions ?',
    vers: '/glossaire/proces-d-intention',
    notion: 'Le procès d’intention',
  },
  {
    question: 'De quoi veut-on me faire peur ?',
    detail: 'Demain ceci, après-demain cela : chaque étape est-elle montrée, ou seulement annoncée ?',
    vers: '/glossaire/pente-savonneuse',
    notion: 'La pente savonneuse',
  },
  {
    question: 'Pour un programme : combien, et qui paie ?',
    detail: 'Une mesure sérieuse dit son coût, son financement et ce qui pourrait ne pas marcher.',
    vers: '/glossaire/affirmation-non-etayee',
    notion: 'L’affirmation non étayée',
  },
];

const [PREMIER, SECOND] = DISCOURS;
const howMany = (item: Discours, category: DemoCategory) => item.constats.filter((constat) => constat.category === category).length;

/** `/presidentielle`: how to read a speech or a programme, on two speeches from opposite sides. */
export function Presidentielle() {
  return (
    <>
      <div className={`${PAGE} pt-10 pb-16 md:pt-20 md:pb-24`}>
        <h1 className={`${H1} max-w-[18ch]`}>Présidentielle : lire un discours ou un programme</h1>
        <p className={`mt-6 ${LEAD} ${MEASURE}`}>
          {typo(
            'Deux discours inventés, de bords opposés, passés à la même grille. Aucun candidat, aucun parti : on regarde comment un texte cherche à convaincre, pas qui a raison.',
          )}
        </p>
        <div className="mt-8">
          <AnalyseLink>Analyser un discours</AnalyseLink>
        </div>
      </div>

      <Section
        id="discours"
        title="Les deux discours, et ce que Squiggle y relève"
        intro={typo(
          `Une analyse par texte, le ${dateLongue(PREMIER.analyseLe)}, sans en choisir une meilleure. Les constats sont reproduits mot pour mot.`,
        )}
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
          {DISCOURS.map((item) => (
            <div key={item.id} className="grid min-w-0 content-start gap-6">
              <Feuille item={item} />
              <ul aria-label={`Les constats sur « ${item.titre} »`} className="m-0 grid list-none gap-5 p-0">
                {item.constats.map((constat) => (
                  <ConstatCard key={constat.quote} constat={constat} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="comparaison" title="Côte à côte">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div role="region" aria-label="Le relevé des deux discours" tabIndex={0} className="min-w-0 self-start overflow-x-auto rounded-card border border-border">
            <table className="w-full border-collapse text-left text-base leading-snug">
              <caption className="sr-only">Nombre de constats par catégorie et note de chaque discours</caption>
              <thead className="bg-surface">
                <tr>
                  <th scope="col" className="border-b border-border px-3 py-3 font-semibold sm:px-4">
                    Constats
                  </th>
                  {DISCOURS.map((item) => (
                    <th key={item.id} scope="col" className="border-b border-border px-3 py-3 font-semibold sm:px-4">
                      {typo(item.titre)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((category) => (
                  <tr key={category} className="border-b border-border">
                    <th scope="row" className="px-3 py-3 font-semibold sm:px-4">
                      {CATEGORY_LABELS[category]}
                    </th>
                    {DISCOURS.map((item) => (
                      <td key={item.id} className="px-3 py-3 text-muted tabular-nums sm:px-4">
                        {howMany(item, category)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="px-3 py-3 font-semibold sm:px-4">
                    Note sur 100
                  </th>
                  {DISCOURS.map((item) => (
                    <td key={item.id} className="px-3 py-3 text-muted tabular-nums sm:px-4">
                      {item.score}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className={`grid content-start gap-4 text-lg leading-relaxed ${MEASURE}`}>
            <p className="m-0">
              {typo(
                'Ces discours sont construits en miroir, avec les mêmes procédés : c’est pour cela qu’on doit retrouver les mêmes constats. On les retrouve pour l’essentiel, sans que le résultat soit identique, et il faut le dire.',
              )}
            </p>
            <ul className="m-0 grid list-none gap-3 p-0 text-lg leading-snug">
              {[
                `${PREMIER.constats.length} constats d’un côté, ${SECOND.constats.length} de l’autre : le premier texte sépare l’enchaînement catastrophiste et l’appel à la peur, le second les réunit en un seul constat.`,
                'Le chiffrage du programme est jugé plus sévèrement dans le premier texte que dans le second.',
                `Les notes ont ${Math.abs(PREMIER.score - SECOND.score)} points d’écart.`,
                'Aucun point fort n’est relevé, ni d’un côté ni de l’autre, alors que chaque texte admet que son montant n’est pas garanti.',
              ].map((text) => (
                <li key={text} className="flex gap-3">
                  <SquiggleMark />
                  <span>{typo(text)}</span>
                </li>
              ))}
            </ul>
            <p className="m-0">
              {typo(
                'Une nouvelle analyse du même texte peut varier un peu. Le rapport complet indique aussi ce qu’une recherche a trouvé sur les faits et les sources consultées : nous ne le montrons pas ici, car ces textes sont inventés et la recherche peut tomber sur des responsables ou des partis réels.',
              )}
            </p>
            <p className="m-0">
              <a href={CONTACT_URL} className={QUIET_LINK}>
                Vous voyez un constat injuste, d’un côté ou de l’autre ? Dites-le-nous
              </a>
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="grille"
        title="La grille, pour n’importe quel discours"
        intro={typo('Six questions. Posez-les d’abord au camp que vous préférez : c’est là qu’on les oublie.')}
      >
        <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {QUESTIONS.map(({ question, detail, vers, notion }) => (
            <li key={question} className="grid content-start gap-2 rounded-card border border-border bg-surface p-5">
              <h3 className="m-0 font-display text-xl leading-snug font-semibold">{typo(question)}</h3>
              <p className="m-0 text-base leading-snug text-muted">{typo(detail)}</p>
              <p className="m-0">
                <Link to={vers} className={QUIET_LINK}>
                  {typo(notion)}
                </Link>
              </p>
            </li>
          ))}
        </ol>
        <div className={`mt-12 grid gap-4 rounded-card border border-border bg-surface p-5 md:p-6 ${MEASURE}`}>
          <p className="m-0 text-lg leading-relaxed">
            {typo('Un discours, un programme, un tract ? Collez le texte : Squiggle montre les passages à regarder et dit pourquoi. Il ne vous dit pas pour qui voter.')}
          </p>
          <p className="m-0">
            <AnalyseLink>Analyser un discours</AnalyseLink>
          </p>
        </div>
      </Section>
    </>
  );
}
