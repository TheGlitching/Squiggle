/**
 * The Chromium bridge landing page (`squiggle-auth.html`).
 *
 * The web app navigates here with `token`, `pub` and `keyId` (web/BRIDGE.md §2).
 * This page runs in the extension origin, so it can write the encrypted store;
 * it verifies the sent public key against the install's own before trusting
 * anything, then stows the token.
 */
import { SecureKeyStorage } from '../crypto/storage';
import { completeChromiumAuth } from './session';

const message = document.getElementById('message');
const detail = document.getElementById('detail');

function show(title: string, text: string, ok: boolean): void {
  if (message) message.textContent = title;
  if (detail) detail.textContent = text;
  document.body.dataset.state = ok ? 'ok' : 'error';
}

async function run(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? '';
  const pub = params.get('pub') ?? '';
  const keyId = params.get('keyId') ?? '';

  if (!token || !pub || !keyId) {
    show(
      'Lien incomplet',
      'Relancez la connexion depuis l’extension, dans les réglages.',
      false
    );
    return;
  }

  try {
    await completeChromiumAuth(new SecureKeyStorage(), { token, pub, keyId });
    show('Connexion réussie', 'Vous pouvez fermer cet onglet et revenir à Squiggle.', true);
    // Best effort: a tab the web app navigated is not always closable by script.
    window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* The success message stays on screen. */
      }
    }, 1200);
  } catch (err) {
    show(
      'Connexion impossible',
      err instanceof Error ? err.message : 'Réessayez depuis l’extension.',
      false
    );
  }
}

void run();
