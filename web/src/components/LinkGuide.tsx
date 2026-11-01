/**
 * What /analyser says, before any tap, to a reader who gave it a link to an
 * article: the way that works on this device, and why a link alone does not.
 *
 * Nothing here fetches the link. Squiggle reads the page the reader already
 * has open, with their subscription, which is also why a paywalled page is
 * analysed as far as they can read it and no further.
 */
import { useState, type ReactElement } from 'react';

import { count } from '../count';
import { installLabelFor, installUrlFor } from '../install';
import { browserLink, currentPhoneOs, type PhoneOs } from '../phone';
import { Link } from '../router';
import { SHORTCUT_PUBLISHED } from '../shortcut';
import { QUIET_LINK, SECONDARY_BUTTON } from './Landing';

/** The Android app is a file on a GitHub release; the newest "Squiggle for Android" is the one to take. */
export const ANDROID_RELEASES = 'https://github.com/TheGlitching/Squiggle/releases';

const WHY =
  'Squiggle ne va jamais chercher un article à partir de son adresse : il lit la page que vous avez ouverte, avec votre abonnement. Un mur payant n’est pas contourné, et les éditeurs sont respectés.';

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

function steps(os: PhoneOs | null, userAgent: string): Array<{ key: string; text: string; link: ReactElement }> {
  const bookmark = (lead: 'Avec' | 'Ou avec') => ({
    key: 'favori',
    text: os
      ? `${lead} le favori : ouvrez l’article dans ${os === 'ios' ? 'Safari' : 'Chrome'}, puis touchez « Analyser avec Squiggle » dans vos favoris.`
      : `${lead} le favori « Analyser avec Squiggle » : sur la page de l’article, un clic suffit.`,
    link: (
      <Link to="/favori" className={QUIET_LINK}>
        Installer le favori
      </Link>
    ),
  });
  if (os === 'android') {
    return [
      {
        key: 'appli',
        text: 'Avec l’application Squiggle : dans l’appli du journal ou dans Chrome, touchez Partager, puis Squiggle. Elle lit l’article avec votre connexion au journal.',
        link: (
          <a href={ANDROID_RELEASES} {...EXTERNAL} className={QUIET_LINK}>
            Télécharger l’application
          </a>
        ),
      },
      bookmark('Ou avec'),
    ];
  }
  if (os === 'ios') {
    return [
      ...(SHORTCUT_PUBLISHED
        ? [
            {
              key: 'raccourci',
              text: 'Avec le raccourci : dans Safari, sur l’article, touchez Partager, puis « Analyser avec Squiggle ».',
              link: (
                <Link to="/raccourci" className={QUIET_LINK}>
                  Ajouter le raccourci
                </Link>
              ),
            },
          ]
        : []),
      bookmark(SHORTCUT_PUBLISHED ? 'Ou avec' : 'Avec'),
    ];
  }
  const store = installUrlFor(userAgent);
  return [
    {
      key: 'extension',
      text: 'Avec l’extension Squiggle : ouvrez l’article, puis cliquez sur l’icône Squiggle. Elle lit la page comme vous la lisez.',
      link: store ? (
        <a href={store} {...EXTERNAL} className={QUIET_LINK}>
          {installLabelFor(store, userAgent)}
        </a>
      ) : (
        <Link to="/" className={QUIET_LINK}>
          Voir l’extension
        </Link>
      ),
    },
    bookmark('Ou avec'),
  ];
}

/** The guide, at the top of the page: `address` is the link in the field, `searching` while a report already made for it is looked up. */
export function LinkGuide({ address, searching }: { address: string; searching: boolean }) {
  const [os] = useState(currentPhoneOs);
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return (
    <section
      aria-labelledby="lien-titre"
      className="mt-6 grid max-w-2xl gap-3 rounded-card border border-border bg-accentSoft p-4 text-sm sm:p-5"
    >
      <h2 id="lien-titre" className="m-0 font-display text-lg font-semibold">
        Un lien ne suffit pas, voici le chemin qui marche
      </h2>
      <p className="m-0 text-muted">{WHY}</p>
      <ol className="m-0 grid list-decimal gap-2 pl-5">
        {steps(os, userAgent).map(({ key, text, link }) => (
          <li key={key}>
            {text}
            <span className="mt-1 block">{link}</span>
          </li>
        ))}
      </ol>
      <OpenInBrowser address={address} os={os} />
      {searching ? (
        <p role="status" className="m-0 text-muted">
          Recherche d’un rapport déjà fait pour ce lien…
        </p>
      ) : null}
    </section>
  );
}

/**
 * The article opened in the browser rather than in the publisher's app, which
 * would claim the link and block copying; the bookmark reads the page there.
 */
function OpenInBrowser({ address, os }: { address: string; os: PhoneOs | null }) {
  const href = browserLink(address, os, typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return (
    <a
      href={href}
      {...(os ? {} : EXTERNAL)}
      onClick={() => count('open_in_browser')}
      className={`${SECONDARY_BUTTON} w-full sm:w-auto sm:justify-self-start`}
    >
      {os ? 'Ouvrir dans le navigateur' : 'Ouvrir l’article'}
    </a>
  );
}
