import { useEffect, useState } from 'react';

import { getAccount, messageForError, verifyMagicLink } from '../api';
import { FigTrois } from '../components/FigTrois';
import { SignIn } from '../components/SignIn';
import { FREE_ANALYSES } from '../offer';
import { navigate, usePath } from '../router';

function searchOf(path: string): URLSearchParams {
  return new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
}

export function Connexion() {
  const path = usePath();
  const params = searchOf(path);
  const requestedNext = params.get('next');
  const next = requestedNext ?? '/compte';
  const linkCode = params.get('code');

  const [verifying, setVerifying] = useState(Boolean(linkCode));
  const [error, setError] = useState<string | null>(null);

  // A code in the URL is the emailed link: verify it straight away.
  useEffect(() => {
    if (!linkCode) return;
    let cancelled = false;
    // The emailed link opens in a new tab that has lost the page which asked
    // for the sign-in, so the destination comes back from the server.
    verifyMagicLink(linkCode)
      .then((result) => {
        if (!cancelled) navigate(result.next ?? next);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(messageForError(err));
        setVerifying(false);
      });
    return () => {
      cancelled = true;
    };
    // `next` is stable for a given URL; re-running on it would re-verify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode]);

  // Already signed in: skip the form.
  useEffect(() => {
    if (linkCode) return;
    getAccount()
      .then((account) => {
        if (account) navigate(next);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto grid w-full max-w-5xl items-center gap-12 px-5 py-10 sm:py-16 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
      <div>
        <h1 className="m-0 font-display text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">Connexion</h1>
        <p className="mt-3 mb-8 text-lg leading-relaxed text-muted">
          Pas de mot de passe : un code par e-mail, ou Google.
        </p>
        {verifying ? (
          <p role="status" className="m-0 text-lg text-muted">
            Connexion en cours…
          </p>
        ) : (
          <SignIn
            next={requestedNext ?? undefined}
            error={error}
            initialStep={error ? 'code' : 'email'}
            onSignedIn={(kept) => navigate(kept ?? next)}
          />
        )}
      </div>
      <div className="max-lg:hidden">
        <FigTrois />
        <p className="mt-6 mb-0 text-center text-lg text-muted">
          {FREE_ANALYSES} analyses offertes à l’inscription, sans carte bancaire.
        </p>
      </div>
    </div>
  );
}
