import type { ReactNode } from 'react';

import { tone } from '../components/Exemple';
import { ExternalMark, SquiggleMark } from '../components/Iso';
import {
  H1,
  LEAD,
  MEASURE,
  PAGE,
  PRIMARY_BUTTON,
  QUIET_LINK,
  SECONDARY_BUTTON,
  Section,
  TITLE,
} from '../components/Landing';
import {
  FAMILLES,
  NOTIONS,
  famille,
  glossaryPath,
  howReported,
  notion,
  typo,
  type Notion,
  type Reference,
  type Segments,
} from '../glossaire';
import { Link } from '../router';

const H2 = 'm-0 font-display text-2xl leading-tight font-semibold tracking-[-0.01em]';

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/** A notion as a card: its name and what it is, the whole card one link. */
export function NotionCard({ item }: { item: Notion }) {
  return (
    <Link
      to={glossaryPath(item.slug)}
      className="grid h-full content-start gap-2 rounded-card border border-border bg-surface p-5 transition-colors duration-160 ease-out hover:border-accent"
    >
      <span className="font-display text-xl leading-snug font-semibold tracking-[-0.01em] text-foreground">
        {item.nom}
      </span>
      <span className="text-base leading-snug text-muted">{typo(item.resume)}</span>
    </Link>
  );
}

function References({ items }: { items: readonly Reference[] }) {
  return (
    <ul className="m-0 grid list-none gap-3 p-0 text-base leading-snug text-muted">
      {items.map(({ texte, url }) => (
        <li key={texte}>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-borderControl underline-offset-4 transition-colors duration-160 ease-out hover:text-accentInk hover:decoration-accentInk"
            >
              {typo(texte)}
              <ExternalMark />
            </a>
          ) : (
            typo(texte)
          )}
        </li>
      ))}
    </ul>
  );
}

const GENERAL_REFERENCES: Reference[] = [
  { texte: 'Aristote, Réfutations sophistiques : le premier inventaire des raisonnements qui ont l’air justes et ne le sont pas.' },
  { texte: 'Normand Baillargeon, Petit cours d’autodéfense intellectuelle, Lux, 2005.' },
  { texte: 'Déclaration des devoirs et des droits des journalistes, dite charte de Munich, 1971.' },
];

/** `/glossaire`: every notion, by family. */
export function Glossaire() {
  return (
    <>
      <div className={`${PAGE} pt-10 pb-16 md:pt-20 md:pb-24`}>
        <h1 className={`${H1} max-w-[14ch]`}>Glossaire de l’esprit critique</h1>
        <p className={`mt-4 ${LEAD} ${MEASURE} font-semibold`}>Sophismes, biais et procédés, expliqués simplement</p>
        <p className={`mt-6 ${LEAD} ${MEASURE}`}>
          {typo(
            `Les ${NOTIONS.length} notions que nomment les rapports Squiggle, une par page : une définition simple, un exemple sur un article inventé, les signes qui la trahissent et une question pour en parler en classe.`,
          )}
        </p>
        <nav aria-label="Les familles du glossaire" className="mt-10">
          <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
            {FAMILLES.map(({ id, titre }) => (
              <li key={id}>
                {/* Plain anchors: a hash link must scroll. */}
                <a
                  href={`#${id}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control border border-borderControl px-4 py-2 text-base text-foreground transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk"
                >
                  {titre}
                  <span className="text-muted tabular-nums">{NOTIONS.filter((item) => item.famille === id).length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {FAMILLES.map(({ id, titre, intro }) => {
        const items = NOTIONS.filter((item) => item.famille === id);
        return (
          <Section key={id} id={id} title={titre} intro={typo(intro)}>
            {/* Four in a row rather than three and one left alone. */}
            <ul className={`m-0 grid list-none gap-4 p-0 sm:grid-cols-2 ${items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
              {items.map((item) => (
                <li key={item.slug}>
                  <NotionCard item={item} />
                </li>
              ))}
            </ul>
          </Section>
        );
      })}

      <Section id="usage" title="Un nom n’est pas un verdict">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-20">
          <div className={`grid content-start gap-4 text-lg leading-relaxed ${MEASURE}`}>
            <p className="m-0">
              {typo(
                'Nommer un procédé aide à le voir, et à en parler sans s’emporter. Cela ne dit pas que l’article est mauvais, ni que son auteur cherche à tromper : un bon article peut contenir une phrase fragile, et un procédé peut être involontaire.',
              )}
            </p>
            <p className="m-0">
              {typo(
                'Chaque constat d’un rapport Squiggle cite la phrase exacte qu’il vise. Vous pouvez donc toujours relire le passage et juger par vous-même.',
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 max-sm:flex-col max-sm:items-stretch">
              <Link to="/analyser" className={PRIMARY_BUTTON}>
                Analyser un article
              </Link>
              <Link to="/enseignants" className={SECONDARY_BUTTON}>
                En classe
              </Link>
            </div>
          </div>
          <div>
            <h3 className="m-0 text-base font-semibold">Pour aller plus loin</h3>
            <div className="mt-4">
              <References items={GENERAL_REFERENCES} />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

/** The passage an example highlights, painted as a fragile passage is in a report. */
function Run({ segments }: { segments: Segments }) {
  return (
    <>
      {segments.map((part, index) =>
        typeof part === 'string' ? (
          typo(part)
        ) : (
          <mark key={index} className="hero-hl cursor-default" style={tone('warning')}>
            {typo(part[0])}
          </mark>
        ),
      )}
    </>
  );
}

/** A made-up article on paper, its fragile passage highlighted, and what is wrong with it. */
export function ExempleFigure({ exemple }: { exemple: Notion['exemple'] }) {
  return (
    <figure className="m-0 grid gap-5">
      <div className="rounded-card bg-paper px-5 py-7 text-paperInk sm:px-8 md:px-10 md:py-9">
        <p className="m-0 text-base font-medium text-paperMuted">{exemple.rubrique}, un article inventé</p>
        <p className="mt-2 mb-0 font-serif text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
          <Run segments={exemple.titre} />
        </p>
        <p className="mt-4 mb-0 font-serif text-lg leading-[1.65] md:text-xl">
          <Run segments={exemple.texte} />
        </p>
      </div>
      <figcaption className={`grid gap-2 ${MEASURE}`}>
        <span className="text-base font-semibold">Ce qui cloche</span>
        <span className="text-lg leading-relaxed">{typo(exemple.lecture)}</span>
      </figcaption>
    </figure>
  );
}

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-5">
      <h2 id={id} className={H2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** `/glossaire/<notion>`: one notion, from its definition to the classroom question. */
export function NotionPage({ item }: { item: Notion }) {
  const { titre: familyTitle, id: familyId } = famille(item.famille);
  const neighbours = item.voisines.map((slug) => notion(slug)!);
  return (
    <div className={`${PAGE} py-12 md:py-20`}>
      <nav aria-label="Fil d’Ariane" className="text-base text-muted">
        <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0">
          <li>
            <Link to="/glossaire" className={QUIET_LINK}>
              Glossaire
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <a href={`/glossaire#${familyId}`} className={QUIET_LINK}>
              {familyTitle}
            </a>
          </li>
        </ol>
      </nav>

      <div className="mt-8 grid gap-14 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-20">
        <article aria-labelledby="notion-titre" className="grid content-start gap-14">
          <header className={`grid gap-5 ${MEASURE}`}>
            <h1 id="notion-titre" className={TITLE}>
              {item.nom}
            </h1>
            {item.aussi ? (
              <p className="m-0 text-base text-muted">
                {typo(`Autres noms : ${item.aussi.join(', ')}`)}
              </p>
            ) : null}
            {item.definition.map((text, index) => (
              <p key={index} className={`m-0 leading-relaxed text-pretty ${index === 0 ? 'text-xl' : 'text-lg text-muted'}`}>
                {typo(text)}
              </p>
            ))}
          </header>

          <Part id="exemple" title="Sur un article d’exemple">
            <ExempleFigure exemple={item.exemple} />
          </Part>

          <Part id="reperer" title="Comment le repérer">
            <ul className={`m-0 grid list-none gap-4 p-0 text-lg leading-snug ${MEASURE}`}>
              {item.reperer.map((text) => (
                <li key={text} className="flex gap-3">
                  <SquiggleMark />
                  <span>{typo(text)}</span>
                </li>
              ))}
            </ul>
          </Part>

          <Part id="rapport" title="Dans un rapport Squiggle">
            <div className={`grid gap-4 ${MEASURE}`}>
              <p className="m-0 text-lg leading-relaxed">{typo(howReported(item))}</p>
              <div className="mt-2 flex flex-wrap gap-3 max-sm:flex-col max-sm:items-stretch">
                <Link to="/analyser" className={PRIMARY_BUTTON}>
                  Analyser un article
                </Link>
                <a href="/#exemple" className={SECONDARY_BUTTON}>
                  Voir un rapport d’exemple
                </a>
              </div>
            </div>
          </Part>

          <Part id="classe" title="En classe">
            <div className={`grid gap-4 rounded-card border border-border bg-surface p-5 md:p-6 ${MEASURE}`}>
              <p className="m-0 font-display text-xl leading-normal font-semibold">{typo(item.question)}</p>
              <p className="m-0 text-base text-muted">
                {typo('Ensuite, passez à un vrai article : les élèves marquent ce qui leur paraît fragile, puis comparent avec le rapport.')}
              </p>
              <p className="m-0">
                <a href="/enseignants#exercice" className={QUIET_LINK}>
                  Essayer l’exercice
                </a>
              </p>
            </div>
          </Part>

          {item.references ? (
            <Part id="references" title="Pour aller plus loin">
              <div className={MEASURE}>
                <References items={item.references} />
              </div>
            </Part>
          ) : null}
        </article>

        <aside aria-labelledby="voisines-titre" className="lg:sticky lg:top-6 lg:self-start">
          <h2 id="voisines-titre" className="m-0 text-base font-semibold">
            Notions voisines
          </h2>
          <ul className="mt-4 mb-0 grid list-none gap-3 p-0">
            {neighbours.map((neighbour) => (
              <li key={neighbour.slug}>
                <NotionCard item={neighbour} />
              </li>
            ))}
          </ul>
          <p className="mt-6 mb-0">
            <Link to="/glossaire" className={QUIET_LINK}>
              {`Les ${NOTIONS.length} notions du glossaire`}
            </Link>
          </p>
          <p className="mt-2 mb-0">
            <a href={`/glossaire#${familyId}`} className={QUIET_LINK}>
              {`Toutes les notions : ${lowerFirst(familyTitle)}`}
            </a>
          </p>
        </aside>
      </div>
    </div>
  );
}
