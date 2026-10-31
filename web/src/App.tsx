import { useEffect } from 'react';

import { OWNER_PATH } from './api';
import { PAGE, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from './components/Landing';
import { Layout } from './components/Layout';
import { ModeEmploiPage } from './components/ModeEmploi';
import { navigate, usePath } from './router';
import { Accueil } from './pages/Accueil';
import { Analyser, analyserReadsReader } from './pages/Analyser';
import { Classe } from './pages/Classe';
import { Compte } from './pages/Compte';
import { Connexion } from './pages/Connexion';
import { Enseignants } from './pages/Enseignants';
import { Favori, FavoriEssai, favoriTried } from './pages/Favori';
import { Corrige, Fiche } from './pages/Feuilles';
import { ArticlePage, Blog } from './pages/Blog';
import { Exercices, Glossaire, NotionPage } from './pages/Glossaire';
import { FicheActivite, GrilleLecture } from './pages/Kit';
import { Cgv, Conditions, Confidentialite, MentionsLegales } from './pages/Legal';
import { Pilotage } from './pages/Pilotage';
import { Pont } from './pages/Pont';
import { Raccourci } from './pages/Raccourci';
import { Tableau } from './pages/Tableau';
import { Transparence } from './pages/Transparence';
import { BLOG_OPEN, BLOG_PATH, article } from './blog';
import { notion } from './glossaire';
import { SHORTCUT_PUBLISHED } from './shortcut';
import { titleFor } from './seo';

/** An old address that must keep working: emailed /magic-link links, the first /legal, /raccourci without its file. */
function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}

function NotFound() {
  return (
    <div className={`${PAGE} py-16 md:py-24`}>
      <p className="m-0 font-display text-base font-semibold text-accentInk tabular-nums">404</p>
      <h1 className={`${TITLE} mt-3`}>Page introuvable</h1>
      <p className="mt-3 text-lg text-muted">Le lien est peut-être ancien ou mal orthographié.</p>
      <div className="mt-8 flex flex-wrap gap-3 max-sm:flex-col max-sm:items-stretch">
        <a href="/" className={PRIMARY_BUTTON}>
          Revenir à l’accueil
        </a>
        <a href="/analyser" className={SECONDARY_BUTTON}>
          Analyser un article
        </a>
        <a href="/transparence" className={SECONDARY_BUTTON}>
          Transparence
        </a>
      </div>
    </div>
  );
}

/**
 * The public pages whose first render reads the reader's browser: the draft on
 * `/analyser`, the class session on `/classe`, the step reached on `/favori`. The build
 * cannot know them, so these are rendered afresh rather than hydrated (`src/main.tsx`)
 * when the reader has one. `/analyser` says whether they do: a reader who has none, as
 * on a first visit, gets the build's page, and its title stays the node first painted.
 */
const READER_STATE_PAGES: Record<string, () => boolean> = {
  '/analyser': analyserReadsReader,
  '/classe': () => true,
  '/favori': () => true,
};

/** Whether this reader's first render of `path` is their own, not the build's. Read in a browser only. */
export function rendersReaderState(path: string): boolean {
  return READER_STATE_PAGES[path]?.() ?? false;
}

/** `path` is given only by the build, which renders each public page outside a browser (`src/prerender.tsx`). */
export function App({ path: at }: { path?: string }) {
  const path = usePath(at);
  const route = path.split('?')[0];
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : '';

  useEffect(() => {
    document.title = titleFor(route);
  }, [route]);

  // The projector's window is the board alone: no header, no footer, nothing to click.
  if (route === '/classe/tableau') return <Tableau />;

  // The owner's metrics: the 404 to anyone else.
  if (route === OWNER_PATH) return <Pilotage fallback={<Layout><NotFound /></Layout>} />;

  let page;
  switch (route) {
    case '/':
    case '/tarifs':
      page = <Accueil />;
      break;
    case '/analyser':
      // The bookmark tried on /favori/essai: the guide says it works, and nothing is analysed.
      page = typeof window !== 'undefined' && favoriTried(window.location) ? <Redirect to="/favori?essai=ok" /> : <Analyser />;
      break;
    case '/raccourci':
      page = SHORTCUT_PUBLISHED ? <Raccourci /> : <Redirect to="/favori" />;
      break;
    case '/favori':
      page = <Favori />;
      break;
    case '/favori/essai':
      page = <FavoriEssai />;
      break;
    case '/enseignants':
      page = <Enseignants />;
      break;
    case '/enseignants/fiche-activite':
      page = <FicheActivite />;
      break;
    case '/enseignants/grille-lecture':
      page = <GrilleLecture />;
      break;
    case '/enseignants/exercices':
      page = <Exercices />;
      break;
    case '/classe':
      page = <Classe />;
      break;
    case '/classe/fiche':
      page = <Fiche />;
      break;
    case '/classe/corrige':
      page = <Corrige />;
      break;
    case '/classe/mode-emploi':
      page = <ModeEmploiPage />;
      break;
    case '/connexion':
      page = <Connexion />;
      break;
    case '/magic-link':
      page = <Redirect to={`/connexion${search}`} />;
      break;
    case '/compte':
    case '/account':
      page = <Compte />;
      break;
    case '/transparence':
      page = <Transparence />;
      break;
    case '/mentions-legales':
      page = <MentionsLegales />;
      break;
    case '/cgv':
      page = <Cgv />;
      break;
    case '/confidentialite':
      page = <Confidentialite />;
      break;
    case '/conditions':
      page = <Conditions />;
      break;
    case '/legal':
      // The address the first store submissions declared as the privacy policy.
      page = <Redirect to="/confidentialite" />;
      break;
    case '/pont':
      page = <Pont />;
      break;
    case '/glossaire':
      page = <Glossaire />;
      break;
    default: {
      const item = route.startsWith('/glossaire/') ? notion(route.slice('/glossaire/'.length)) : undefined;
      // Not a `case`: until an article is published, /blog is not a page (`BLOG_OPEN`).
      const post = route.startsWith(`${BLOG_PATH}/`) ? article(route.slice(BLOG_PATH.length + 1)) : undefined;
      if (item) page = <NotionPage item={item} />;
      else if (post) page = <ArticlePage item={post} />;
      else if (route === BLOG_PATH && BLOG_OPEN) page = <Blog />;
      else page = <NotFound />;
    }
  }

  // Inside the app, the header leads to the reader's account rather than to sign-in.
  const inApp = route === '/analyser' || route === '/compte' || route === '/account' || route === '/pont';
  // The home offers the app and the bookmark where each applies: no second invitation over it.
  const home = route === '/' || route === '/tarifs';
  return (
    <Layout account={inApp ? 'Mon compte' : 'Se connecter'} installHint={!home}>
      {page}
    </Layout>
  );
}
