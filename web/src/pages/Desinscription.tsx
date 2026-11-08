/**
 * Where the link at the foot of a commercial e-mail lands. Nothing is withdrawn
 * until the button is pressed: a mailbox's link scanner opens every address it
 * finds, and that must not unsubscribe anyone. No session is needed, the token
 * in the address is the whole credential.
 */
import { useState } from 'react';

import { messageForError, unsubscribe } from '../api';
import { PAGE, PRIMARY_BUTTON, TITLE } from '../components/Landing';
import { Link } from '../router';

export function Desinscription() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('t'));
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState('busy');
    setError(null);
    try {
      await unsubscribe(token ?? '');
      setState('done');
    } catch (err) {
      setError(messageForError(err));
      setState('idle');
    }
  }

  return (
    <div className={`${PAGE} py-12 md:py-20`}>
      <div className="max-w-[55ch]">
        <h1 className={TITLE}>Se désinscrire</h1>
        {state === 'done' ? (
          <p role="status" className="mt-3 mb-0 text-lg text-muted">
            C’est fait : vous ne recevrez plus nos exercices ni nos messages. Les e-mails nécessaires à votre compte,
            comme le code de connexion, continuent de partir.
          </p>
        ) : token ? (
          <>
            <p className="mt-3 mb-0 text-lg text-muted">
              Vous ne recevrez plus nos exercices ni nos messages. Les e-mails nécessaires à votre compte, comme le code
              de connexion, continuent de partir.
            </p>
            {error ? (
              <p
                role="alert"
                className="mt-6 mb-0 rounded-control border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk"
              >
                {error}
              </p>
            ) : null}
            <button
              onClick={() => void confirm()}
              disabled={state === 'busy'}
              className={`${PRIMARY_BUTTON} mt-8 max-sm:w-full disabled:opacity-60`}
            >
              Ne plus recevoir ces e-mails
            </button>
          </>
        ) : (
          <p className="mt-3 mb-0 text-lg text-muted">
            Ce lien est incomplet. Vous pouvez régler vos e-mails depuis{' '}
            <Link to="/compte" className="underline underline-offset-4 hover:text-foreground">
              votre compte
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
