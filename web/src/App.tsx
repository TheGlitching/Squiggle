import { useEffect } from 'react';

import { PAGE, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from './components/Landing';
import { Layout } from './components/Layout';
import { ModeEmploiPage } from './components/ModeEmploi';
import { count, viewOf } from './count';
import { navigate, usePath } from './router';
import { Accueil } from './pages/Accueil';
import { Analyser } from './pages/Analyser';
import { Classe } from './pages/Classe';
import { Compte } from './pages/Compte';
import { Connexion } from './pages/Connexion';
import { Enseignants } from './pages/Enseignants';
import { Corrige, Fiche } from './pages/Feuilles';
import { Glossaire, NotionPage } from './pages/Glossaire';
import { FicheActivite, GrilleLecture } from './pages/Kit';
import { Cgv, Conditions, Confidentialite, MentionsLegales } from './pages/Legal';
import { Pont } from './pages/Pont';
import { Tableau } from './pages/Tableau';
import { Transparence } from './pages/Transparence';
import { notion } from './glossaire';
import { titleFor } from './seo';

/** An old address that must keep working: emailed /magic-link links, the first /legal. */
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

/** `path` is given only by the build, which renders each public page outside a browser (`src/prerender.tsx`). */
export function App({ path: at }: { path?: string }) {
  const path = usePath(at);
  const route = path.split('?')[0];
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : '';

  useEffect(() => {
    document.title = titleFor(route);
    const view = viewOf(route);
    if (view) count(view);
  }, [route]);

  // The projector's window is the board alone: no header, no footer, nothing to click.
  if (route === '/classe/tableau') return <Tableau />;

  let page;
  switch (route) {
    case '/':
    case '/tarifs':
      page = <Accueil />;
      break;
    case '/analyser':
      page = <Analyser />;
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
      page = item ? <NotionPage item={item} /> : <NotFound />;
    }
  }

  // Inside the app, the header leads to the reader's account rather than to sign-in.
  const inApp = route === '/analyser' || route === '/compte' || route === '/account' || route === '/pont';
  return <Layout account={inApp ? 'Mon compte' : 'Se connecter'}>{page}</Layout>;
}
