import React, { useState } from 'react';
import { describeHostedAccount, type HostedAccount } from '../../hosted/session';
import { ACCOUNT_URL } from '../../hosted/config';

/**
 * The hosted-mode card in the sidepanel: the trial promise when signed out, the
 * entitlement line when signed in, and the Firefox code field. Kept as its own
 * component so `main.tsx` does not grow a second state machine.
 */
export interface HostedAccountCardProps {
  account: HostedAccount | null;
  error: string | null;
  busy: boolean;
  /** Firefox cannot return from the web page by itself, so it shows the code field. */
  showCode: boolean;
  onSignIn: () => void;
  onRedeem: (code: string) => void;
  onSignOut: () => void;
}

export const HostedAccountCard: React.FC<HostedAccountCardProps> = ({
  account,
  error,
  busy,
  showCode,
  onSignIn,
  onRedeem,
  onSignOut,
}) => {
  const [code, setCode] = useState('');
  const view = account ? describeHostedAccount(account) : null;

  return (
    <div className="rounded-xl border border-[#E7E5E4] dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4">
      {account && view ? (
        <>
          <h2 className="text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
            {view.title}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#78716C] dark:text-[#A1A1AA]">
            {view.detail}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!view.canAnalyse && (
              <a
                href={ACCOUNT_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#1C1917] dark:bg-[#FAFAFA] px-3 py-2 text-xs font-semibold text-white dark:text-[#18181B]"
              >
                {view.needsSubscription ? 'S’abonner' : 'Mon compte'}
              </a>
            )}
            <button
              type="button"
              onClick={onSignOut}
              disabled={busy}
              className="rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] px-3 py-2 text-xs font-semibold text-[#57534E] dark:text-[#D4D4D8] disabled:opacity-40 hover:bg-[#F5F5F4] dark:hover:bg-[#27272A]"
            >
              Se déconnecter
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
            3 analyses offertes
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#78716C] dark:text-[#A1A1AA]">
            Sans clé d’API : connectez votre compte Squiggle, l’analyse tourne sur nos serveurs.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            disabled={busy}
            className="mt-3 w-full rounded-xl bg-[#1C1917] dark:bg-[#FAFAFA] px-3 py-2.5 text-sm font-semibold text-white dark:text-[#18181B] disabled:opacity-40"
          >
            {busy ? 'Ouverture…' : 'Se connecter'}
          </button>
        </>
      )}

      {showCode && !account && (
        <div className="mt-3 rounded-xl bg-[#F5F5F4] dark:bg-[#27272A] p-3">
          <label className="block text-xs text-[#57534E] dark:text-[#D4D4D8]">
            Sur la page ouverte, demandez un code puis saisissez-le ici&nbsp;:
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoComplete="off"
              placeholder="ABCD2345"
              aria-label="Code de connexion"
              className="mt-2 w-full rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#121214] px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-[#1C1917] dark:text-[#FAFAFA] outline-none focus:border-[#1C1917] dark:focus:border-[#FAFAFA]"
            />
          </label>
          <button
            type="button"
            onClick={() => onRedeem(code)}
            disabled={busy || code.trim().length < 4}
            className="mt-2 w-full rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] px-3 py-2.5 text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA] disabled:opacity-40 hover:bg-white dark:hover:bg-[#18181B]"
          >
            Valider le code
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
};
