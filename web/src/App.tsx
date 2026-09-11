import { useEffect } from 'react';

import { Layout } from './components/Layout';
import { navigate, usePath } from './router';
import { Accueil } from './pages/Accueil';
import { Compte } from './pages/Compte';
import { Connexion } from './pages/Connexion';
import { Legal } from './pages/Legal';
import { Pont } from './pages/Pont';
import { Transparence } from './pages/Transparence';

/** Old emailed links pointed at /magic-link; keep them working. */
function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to);
  }, [to]);
  return null;
}

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-24 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="mt-3 text-muted">Le lien est peut-être ancien ou mal orthographié.</p>
      <a href="/" className="mt-6 inline-block rounded-lg bg-accent px-5 py-3 font-medium text-white hover:bg-accentHover">
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
    case '/legal':
      page = <Legal />;
      break;
    case '/pont':
      page = <Pont />;
      break;
    default:
      page = <NotFound />;
  }

  // The landing is its own full-bleed page, faithful to the approved
  // prototype: it carries its own slim header and has no site chrome.
  if (route === '/' || route === '/tarifs') return page;

  return <Layout>{page}</Layout>;
}
