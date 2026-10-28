/**
 * Installing the bookmark "Analyser avec Squiggle" on a phone.
 *
 * A phone browser has no extension, and a news app blocks copying, but the
 * site of the same paper lets the subscriber read the whole article. The
 * bookmark is a `javascript:` address (`virtual:favori`, built from
 * `src/favori/`): saved once, it reads the article in the page and opens it
 * on /analyser, with no selection and no copy. Neither phone browser installs
 * one in a tap, so the page gives the address to copy and the gestures to
 * save it, the reader's own phone first.
 */
import { useEffect, useRef, useState } from 'react';
import { BOOKMARKLET, FAVORI_ORIGIN } from 'virtual:favori';

import { PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON } from '../components/Landing';
import { Page } from '../components/Layout';
import { currentPhoneOs, type PhoneOs } from '../phone';
import { Link } from '../router';
import { ORIGIN } from '../seo';

const NAME = 'Analyser avec Squiggle';

/** The bookmark that opens this very site: production, staging, or a local build. */
export function bookmarkletFor(origin: string): string {
  return BOOKMARKLET.replace(FAVORI_ORIGIN, encodeURIComponent(origin));
}

const STEPS: Record<PhoneOs, { title: string; steps: string[]; use: string }> = {
  android: {
    title: 'Sur Android, avec Chrome',
    steps: [
      'Touchez « Copier le favori », ci-dessus.',
      'Touchez le menu ⋮, puis l’étoile ☆ : cette page devient un favori.',
      'Touchez « Modifier » dans le bandeau du bas (ou menu ⋮, Favoris, puis ⋮ à côté du favori et Modifier).',
      `Nommez-le « ${NAME} ». Dans le champ de l’adresse, effacez tout, puis appuyez longuement et Coller. Revenez en arrière pour enregistrer.`,
    ],
    use: `Sur la page d’un article, touchez la barre d’adresse, tapez « Analyser », puis touchez « ${NAME} » dans les suggestions. Chrome n’exécute pas un favori ouvert depuis la liste des favoris : passez par la barre d’adresse.`,
  },
  ios: {
    title: 'Sur iPhone, avec Safari',
    steps: [
      'Touchez « Copier le favori », ci-dessus.',
      'Touchez Partager, puis « Ajouter un signet », puis Enregistrer.',
      'Touchez Signets (le livre ouvert), puis Modifier, puis le signet que vous venez d’ajouter.',
      `Nommez-le « ${NAME} ». Dans le champ de l’adresse, effacez tout, puis touchez-le et Coller. Touchez OK.`,
    ],
    use: `Sur la page d’un article, touchez Signets, puis « ${NAME} ».`,
  },
};

function Steps({ os }: { os: PhoneOs }) {
  const { title, steps, use } = STEPS[os];
  return (
    <section aria-labelledby={`favori-${os}`} className="mt-12">
      <h2 id={`favori-${os}`} className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      <ol className="mt-4 mb-0 grid list-decimal gap-2 pl-6 text-lg leading-relaxed">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-4 mb-0 text-lg leading-relaxed">
        <strong className="font-semibold">Pour analyser :</strong> {use}
      </p>
    </section>
  );
}

export function Favori() {
  const [os] = useState(currentPhoneOs);
  const code = bookmarkletFor(typeof window === 'undefined' ? ORIGIN : window.location.origin);
  const [copied, setCopied] = useState<'ok' | 'manual' | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const dragLink = useRef<HTMLAnchorElement>(null);

  // React refuses a `javascript:` href, so the link to drag to a computer's bookmarks bar gets its own here.
  useEffect(() => {
    dragLink.current?.setAttribute('href', code);
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('ok');
    } catch {
      // No clipboard API: the address is shown, selected, for the reader's own Copy.
      setCopied('manual');
      requestAnimationFrame(() => field.current?.select());
    }
  }

  const order: PhoneOs[] = os === 'ios' ? ['ios', 'android'] : ['android', 'ios'];
  return (
    <Page
      title={`Le favori « ${NAME} »`}
      lead="Sur votre téléphone, l’article ouvert dans le navigateur s’analyse d’un geste : le favori lit son texte dans la page et l’ouvre dans Squiggle. Rien à sélectionner, rien à copier."
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" onClick={copy} className={`${PRIMARY_BUTTON} whitespace-nowrap max-sm:w-full`}>
          Copier le favori
        </button>
        {os ? null : (
          <a ref={dragLink} href="#favori" onClick={(event) => event.preventDefault()} className={SECONDARY_BUTTON}>
            {NAME}
          </a>
        )}
      </div>
      <p role="status" className="mt-3 mb-0 text-base text-muted">
        {copied === 'ok'
          ? 'Copié. Collez-le comme adresse du favori, à l’étape 4.'
          : copied === 'manual'
            ? 'Ce navigateur ne laisse pas copier d’ici : le favori est sélectionné ci-dessous, touchez Copier.'
            : os
              ? 'Puis suivez les quatre étapes ci-dessous, une seule fois.'
              : 'Sur un ordinateur, faites glisser le second bouton dans la barre des favoris. L’extension, elle, surligne le rapport dans la page.'}
      </p>
      {copied === 'manual' ? (
        <textarea
          ref={field}
          readOnly
          value={code}
          rows={4}
          aria-label="Adresse du favori"
          className="mt-3 w-full rounded-control border border-border bg-surface p-3 font-mono text-sm break-all"
        />
      ) : null}

      {order.map((item) => (
        <Steps key={item} os={item} />
      ))}

      <section aria-labelledby="favori-trajet" className="mt-12">
        <h2 id="favori-trajet" className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]">
          Ce que fait le favori
        </h2>
        <ul className="mt-4 mb-0 grid list-disc gap-2 pl-6 text-lg leading-relaxed">
          <li>
            Il lit l’article dans la page, comme l’extension, avec ce que vous pouvez y lire : un article payant est lu
            en entier si vous êtes abonné et connecté.
          </li>
          <li>Si le site n’affiche la fin d’un long article qu’au fil de la lecture, il fait défiler la page jusqu’au bout.</li>
          <li>
            Il ouvre Squiggle avec le texte dans la partie de l’adresse qui suit « # », que le navigateur n’envoie à
            aucun serveur. Le texte ne quitte votre téléphone que lorsque l’analyse est lancée, comme un texte collé.
          </li>
          <li>Il ne charge aucun code dans la page : tout ce qu’il fait est écrit dans l’adresse que vous copiez.</li>
        </ul>
        <p className="mt-4 mb-0 text-lg leading-relaxed">
          Le favori ne marche pas sur une page ?{' '}
          <Link to="/analyser" className={QUIET_LINK}>
            Collez le texte sur Squiggle
          </Link>{' '}
          : copiez un passage, puis « Ajouter la suite » pour les suivants.
        </p>
      </section>
    </Page>
  );
}
