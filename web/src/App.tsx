import { useEffect } from 'react';

import { PAGE, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from './components/Landing';
import { Layout } from './components/Layout';
import { navigate, usePath } from './router';
import { Accueil } from './pages/Accueil';
import { Analyser } from './pages/Analyser';
import { Compte } from './pages/Compte';
import { Connexion } from './pages/Connexion';
import { Enseignants } from './pages/Enseignants';
import { Cgv, Conditions, Confidentialite, MentionsLegales } from './pages/Legal';
import { Pont } from './pages/Pont';
import { Transparence } from './pages/Transparence';

/** An old address that must keep working: emailed /magic-link links, the first /legal. */
function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to);
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

export function App() {
  const path = usePath();
  const route = path.split('?')[0];
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : '';

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
    default:
      page = <NotFound />;
  }

  // Inside the app, the header leads to the reader's account rather than to sign-in.
  const inApp = route === '/analyser' || route === '/compte' || route === '/account' || route === '/pont';
  return <Layout account={inApp ? 'Mon compte' : 'Se connecter'}>{page}</Layout>;
}
