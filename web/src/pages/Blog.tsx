import { SquiggleMark } from '../components/Iso';
import { H1, LEAD, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, TITLE } from '../components/Landing';
import { BLOG_PATH, FEED_PATH, SHOWN, ancre, blogCounter, blogPath, dateLongue, type Article, type Bloc, type Texte } from '../blog';
import { count } from '../count';
import { notion, typo } from '../glossaire';
import { Link } from '../router';
import { ExempleFigure, NotionCard } from './Glossaire';

const H2 = 'm-0 font-display text-2xl leading-tight font-semibold tracking-[-0.01em]';
const H3 = 'm-0 font-display text-xl leading-snug font-semibold';
const BODY = `m-0 text-lg leading-relaxed text-pretty ${MEASURE}`;
const BOX = `grid gap-3 rounded-card border border-border bg-surface p-5 md:p-6 ${MEASURE}`;

function Dates({ item }: { item: Article }) {
  return (
    <p className="m-0 text-base text-muted">
      <time dateTime={item.publie}>{dateLongue(item.publie)}</time>
      {item.misAJour ? (
        <>
          {', mis à jour le '}
          <time dateTime={item.misAJour}>{dateLongue(item.misAJour)}</time>
        </>
      ) : null}
    </p>
  );
}

/** Shown only on the dev server, the one place a draft can be read. */
function Brouillon() {
  return (
    <p className="m-0 w-fit rounded-control border border-borderControl px-3 py-1 text-base text-muted">
      Brouillon : cet article n’est pas publié.
    </p>
  );
}

/** `/blog`: every article, newest first. */
export function Blog() {
  return (
    <div className={`${PAGE} pt-10 pb-16 md:pt-20 md:pb-24`}>
      <h1 className={`${H1} max-w-[14ch]`}>Le blog</h1>
      <p className={`mt-6 ${LEAD} ${MEASURE}`}>
        {typo(
          'Des méthodes de lecture : comment repérer, dans un article, ce qui le rend fragile. Chaque article part d’un exemple inventé et renvoie aux notions du glossaire.',
        )}
      </p>
      <ol className="mt-12 mb-0 grid list-none gap-4 p-0">
        {SHOWN.map((item) => (
          <li key={item.slug}>
            <Link
              to={blogPath(item.slug)}
              className="grid gap-2 rounded-card border border-border bg-surface p-5 transition-colors duration-160 ease-out hover:border-accent md:p-6"
            >
              <span className="text-base text-muted">
                <time dateTime={item.publie}>{dateLongue(item.publie)}</time>
                {item.brouillon ? ' · brouillon' : ''}
              </span>
              <span className="font-display text-2xl leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
                {typo(item.titre)}
              </span>
              <span className={`text-lg leading-snug text-muted ${MEASURE}`}>{typo(item.chapo)}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-10 mb-0">
        <a href={FEED_PATH} className={QUIET_LINK}>
          Suivre le blog par flux RSS
        </a>
      </p>
    </div>
  );
}

function Run({ texte }: { texte: Texte }) {
  if (typeof texte === 'string') return <>{typo(texte)}</>;
  return (
    <>
      {texte.map((part, index) =>
        typeof part === 'string' ? (
          typo(part)
        ) : (
          <Link
            key={index}
            to={part.vers}
            className="underline decoration-borderControl underline-offset-4 transition-colors duration-160 ease-out hover:text-accentInk hover:decoration-accentInk"
          >
            {typo(part.texte)}
          </Link>
        ),
      )}
    </>
  );
}

function Puces({ items }: { items: readonly Texte[] }) {
  return (
    <ul className={`m-0 grid list-none gap-4 p-0 text-lg leading-snug ${MEASURE}`}>
      {items.map((texte, index) => (
        <li key={index} className="flex gap-3">
          <SquiggleMark />
          <span>
            <Run texte={texte} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Block({ bloc, corps }: { bloc: Bloc; corps: readonly Bloc[] }) {
  if ('intertitre' in bloc)
    return (
      <h2 id={ancre(bloc.intertitre)} className={`${H2} mt-6 scroll-mt-24`}>
        {typo(bloc.intertitre)}
      </h2>
    );
  if ('sousTitre' in bloc) return <h3 className={`${H3} mt-2`}>{typo(bloc.sousTitre)}</h3>;
  if ('paragraphe' in bloc)
    return (
      <p className={BODY}>
        <Run texte={bloc.paragraphe} />
      </p>
    );
  if ('liste' in bloc) return <Puces items={bloc.liste} />;
  if ('etapes' in bloc)
    return (
      <ol className={`m-0 grid list-none gap-4 p-0 text-lg leading-snug ${MEASURE}`}>
        {bloc.etapes.map((texte, index) => (
          <li key={index} className="flex gap-3">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full border border-borderControl font-display text-base font-semibold text-accentInk"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">
              <Run texte={texte} />
            </span>
          </li>
        ))}
      </ol>
    );
  if ('encadre' in bloc) {
    const { titre, points } = bloc.encadre;
    return (
      <aside aria-label={typo(titre)} className={BOX}>
        <p className="m-0 font-display text-base font-semibold tracking-wide text-accentInk uppercase">{typo(titre)}</p>
        {points.length === 1 ? (
          <p className="m-0 text-lg leading-relaxed text-pretty">
            <Run texte={points[0]} />
          </p>
        ) : (
          <Puces items={points} />
        )}
      </aside>
    );
  }
  if ('tableau' in bloc) {
    const { legende, colonnes, lignes } = bloc.tableau;
    return (
      // A table wider than a phone scrolls inside its own frame, never the page.
      <div role="region" aria-label={typo(legende)} tabIndex={0} className={`max-w-full min-w-0 overflow-x-auto rounded-card border border-border ${MEASURE}`}>
        <table className="w-full border-collapse text-left text-base leading-snug max-sm:text-sm">
          <caption className="sr-only">{typo(legende)}</caption>
          <thead className="bg-surface">
            <tr>
              {colonnes.map((colonne) => (
                <th key={colonne} scope="col" className="border-b border-border px-3 py-3 sm:px-4 font-semibold">
                  {typo(colonne)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, index) => (
              <tr key={index} className="border-b border-border last:border-b-0">
                {ligne.map((cellule, cell) =>
                  cell === 0 ? (
                    <th key={cell} scope="row" className="px-3 py-3 sm:px-4 align-top font-semibold">
                      <Run texte={cellule} />
                    </th>
                  ) : (
                    <td key={cell} className="px-3 py-3 sm:px-4 align-top text-muted">
                      <Run texte={cellule} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if ('questions' in bloc)
    return (
      <div className={`grid gap-6 ${MEASURE}`}>
        {bloc.questions.map(({ question, reponse }) => (
          <div key={question} className="grid gap-2">
            <h3 className={H3}>{typo(question)}</h3>
            <p className="m-0 text-lg leading-relaxed text-pretty">
              <Run texte={reponse} />
            </p>
          </div>
        ))}
      </div>
    );
  if ('sommaire' in bloc) {
    const titres = corps.flatMap((other) => ('intertitre' in other ? [other.intertitre] : []));
    return (
      <nav aria-labelledby="sommaire-titre" className={BOX}>
        <p id="sommaire-titre" className="m-0 font-display text-base font-semibold tracking-wide text-muted uppercase">
          Sommaire
        </p>
        <ol className="m-0 grid list-none gap-2 p-0 text-lg leading-snug">
          {titres.map((titre) => (
            <li key={titre}>
              <a
                href={`#${ancre(titre)}`}
                className="underline decoration-borderControl underline-offset-4 transition-colors duration-160 ease-out hover:text-accentInk hover:decoration-accentInk"
              >
                {typo(titre)}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    );
  }
  return (
    <div className="my-4">
      <ExempleFigure exemple={bloc.exemple} />
    </div>
  );
}

/** `/blog/<article>`: the article, then the way to try it on a real one. */
export function ArticlePage({ item }: { item: Article }) {
  const notions = item.notions.map((slug) => notion(slug)!);
  const counter = blogCounter(item.slug);
  return (
    <div className={`${PAGE} py-12 md:py-20`}>
      <nav aria-label="Fil d’Ariane" className="text-base text-muted">
        <Link to={BLOG_PATH} className={QUIET_LINK}>
          Blog
        </Link>
      </nav>

      <article aria-labelledby="article-titre" className="mt-8 grid max-w-3xl content-start gap-6">
        <header className={`grid gap-5 ${MEASURE}`}>
          {item.brouillon ? <Brouillon /> : null}
          <h1 id="article-titre" className={TITLE}>
            {typo(item.titre)}
          </h1>
          <Dates item={item} />
          <p className="m-0 text-xl leading-relaxed text-pretty">{typo(item.chapo)}</p>
        </header>

        {item.corps.map((bloc, index) => (
          <Block key={index} bloc={bloc} corps={item.corps} />
        ))}

        <section
          aria-labelledby="analyser-titre"
          className={`mt-8 grid gap-4 rounded-card border border-border bg-surface p-5 md:p-6 ${MEASURE}`}
        >
          <h2 id="analyser-titre" className="m-0 font-display text-xl leading-normal font-semibold">
            {typo('Essayez sur l’article que vous lisez')}
          </h2>
          <p className="m-0 text-lg leading-relaxed">
            {typo('Collez son texte : Squiggle surligne les passages fragiles et explique pourquoi, en une à deux minutes.')}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 max-sm:flex-col max-sm:items-stretch">
            <Link to="/analyser" className={PRIMARY_BUTTON} onClick={counter ? () => count(counter) : undefined}>
              Analyser un article
            </Link>
            <a href="/#exemple" className={SECONDARY_BUTTON}>
              Voir un rapport d’exemple
            </a>
          </div>
        </section>
      </article>

      <section aria-labelledby="notions-titre" className="mt-16">
        <h2 id="notions-titre" className={H2}>
          Les notions de cet article
        </h2>
        <ul className="mt-6 mb-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {notions.map((neighbour) => (
            <li key={neighbour.slug}>
              <NotionCard item={neighbour} />
            </li>
          ))}
        </ul>
        <p className="mt-8 mb-0">
          <Link to={BLOG_PATH} className={QUIET_LINK}>
            Tous les articles du blog
          </Link>
        </p>
      </section>
    </div>
  );
}
