import { useEffect } from 'react';

import { PRIMARY_BUTTON } from './components/Landing';
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
    <div className="mx-auto w-full max-w-md px-4 py-24 text-center">
      <p className="font-mono text-base text-accentInk">404</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="mt-3 text-lg text-muted">Le lien est peut-être ancien ou mal orthographié.</p>
      <a href="/" className={`${PRIMARY_BUTTON} mt-6`}>
        Revenir à l’accueil
      </a>
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

  // The landing pages carry their own header and footer and have no site chrome.
  if (route === '/' || route === '/tarifs' || route === '/enseignants') return page;

  return <Layout>{page}</Layout>;
}
