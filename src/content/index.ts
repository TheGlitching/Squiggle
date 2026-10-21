import { ContentScriptController } from './contentScript';

// The background injects this script on demand, and may do so again into a tab
// that already holds it (a read that timed out is retried). Two live controllers
// would answer every message twice and mount two overlays, so a second run is a no-op.
const MARK = '__squiggleContentScript';
const scope = globalThis as unknown as Record<string, unknown>;

if (!scope[MARK]) {
  scope[MARK] = true;
  new ContentScriptController().init();
}

export { ContentScriptController };
