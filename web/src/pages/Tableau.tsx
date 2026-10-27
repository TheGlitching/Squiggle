/**
 * The window the projector shows (/classe/tableau). It holds nothing of its
 * own: it asks the desk, the teacher's window of the same browser, for the
 * session and the lesson's state, and shows exactly that. Its keys go back to
 * the desk, so a teacher whose screen is duplicated rather than extended can
 * run the whole lesson from this window alone, with the arrows or a remote.
 */
import { useEffect, useMemo, useState } from 'react';

import { Board } from '../components/Board';
import { BrandLockup } from '../components/Brand';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../components/Landing';
import { CHANNEL, findingsOf, keyOf, layoutOf, type ClassState, type Message, type Seance } from '../classe';

type View = { kind: 'waiting' } | { kind: 'live'; seance: Seance; state: ClassState } | { kind: 'ended' };

function useFullscreen(): [boolean, () => void] {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const enter = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return [full, enter];
}

export function Tableau() {
  const [view, setView] = useState<View>({ kind: 'waiting' });
  const [full, enterFullscreen] = useFullscreen();
  const linked = typeof BroadcastChannel !== 'undefined';

  useEffect(() => {
    if (!linked) return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      if (message.type === 'state') setView({ kind: 'live', seance: message.seance, state: message.state });
      if (message.type === 'end') setView({ kind: 'ended' });
    };
    ch.postMessage({ type: 'hello' } satisfies Message);

    const onKey = (event: KeyboardEvent) => {
      const key = keyOf(event);
      if (!key) return;
      event.preventDefault();
      ch.postMessage({ type: 'key', key } satisfies Message);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      ch.close();
    };
  }, [linked]);

  const layout = useMemo(
    () => (view.kind === 'live' ? layoutOf(view.seance.blocks, findingsOf(view.seance)) : null),
    [view],
  );

  if (view.kind === 'live' && layout) {
    return (
      <main className="board-frame relative h-dvh w-full">
        <h1 className="sr-only">Le tableau de la classe</h1>
        <Board seance={view.seance} layout={layout} state={view.state} />
        {full || view.state.black ? null : (
          <button
            type="button"
            onClick={enterFullscreen}
            className={`${SECONDARY_BUTTON} absolute top-3 right-3 bg-background`}
          >
            Plein écran
          </button>
        )}
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="grid max-w-[40rem] gap-6 text-center justify-items-center">
        <BrandLockup />
        {view.kind === 'ended' ? (
          <>
            <h1 className="m-0 font-display text-4xl leading-tight font-semibold tracking-tight">Séance terminée</h1>
            <p className="m-0 text-xl leading-relaxed text-muted">Vous pouvez fermer cette fenêtre.</p>
          </>
        ) : (
          <>
            <h1 className="m-0 font-display text-4xl leading-tight font-semibold tracking-tight">
              Cette fenêtre est le tableau
            </h1>
            <p className="m-0 text-xl leading-relaxed text-muted">
              {linked
                ? 'Elle attend la séance. Ouvrez-la sur squiggle.fr/classe, dans l’autre fenêtre de ce navigateur : le tableau s’affichera ici.'
                : 'Ce navigateur est trop ancien pour relier les deux fenêtres. Ouvrez la séance dans une version récente de Chrome, Edge, Firefox ou Safari.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {full ? null : (
                <button type="button" onClick={enterFullscreen} className={PRIMARY_BUTTON}>
                  Plein écran
                </button>
              )}
              <a href="/classe" className={SECONDARY_BUTTON}>
                Ouvrir le mode classe ici
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
