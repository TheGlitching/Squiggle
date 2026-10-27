import { CHROME_STORE_URL, FIREFOX_STORE_URL } from '@squiggle/shared';

/**
 * The store review request: asked once, under the report of the reader's
 * second finished analysis, when Squiggle has already served them twice.
 *
 * Everything stays in `chrome.storage.local`: a count of finished analyses and
 * whether the request was already made. Nothing is sent anywhere, so a reader
 * on their own key still never contacts our server. The background counts (it
 * is the one place every analysis finishes, whichever window shows it), the
 * panel asks.
 */
const STORAGE_KEY = 'squiggle_review_prompt';
export const REVIEW_AFTER_ANALYSES = 2;

interface ReviewPromptState {
  finalized: number;
  asked: boolean;
}

function store(): chrome.storage.LocalStorageArea | undefined {
  return typeof chrome !== 'undefined' ? chrome.storage?.local : undefined;
}

async function readState(area: chrome.storage.LocalStorageArea): Promise<ReviewPromptState> {
  const saved = (await area.get(STORAGE_KEY))[STORAGE_KEY] as Partial<ReviewPromptState> | undefined;
  return { finalized: Number(saved?.finalized) || 0, asked: saved?.asked === true };
}

/** One more analysis reached its report. Never throws: a count is not worth a failed analysis. */
export async function recordFinalizedAnalysis(): Promise<void> {
  const area = store();
  if (!area) return;
  try {
    // ponytail: read-then-write, so two analyses finishing in the same instant can count as one;
    // that only delays the request by one analysis.
    const state = await readState(area);
    if (state.asked) return;
    await area.set({ [STORAGE_KEY]: { ...state, finalized: state.finalized + 1 } });
  } catch {
    // storage unavailable: the request is simply never made
  }
}

/**
 * Whether to show the request under the report that just finished. A `true`
 * spends the single ask, so closing the card, following the link or ignoring
 * it all end the same way: it never comes back.
 */
export async function claimReviewPrompt(): Promise<boolean> {
  const area = store();
  if (!area) return false;
  try {
    const state = await readState(area);
    if (state.asked || state.finalized < REVIEW_AFTER_ANALYSES) return false;
    await area.set({ [STORAGE_KEY]: { ...state, asked: true } });
    return true;
  } catch {
    return false;
  }
}

/** The review page of the store this build was installed from. */
export function reviewStore(target: 'chrome' | 'firefox'): { url: string; name: string } {
  return target === 'firefox'
    ? { url: FIREFOX_STORE_URL, name: 'le site des modules Firefox' }
    : { url: `${CHROME_STORE_URL}/reviews`, name: 'le Chrome Web Store' };
}
