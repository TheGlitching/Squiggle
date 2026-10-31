import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// No test reaches a network. A request no test stubbed (an audience counter
// fired by a click, say) fails here at once, as it would offline, instead of
// trying a real connection.
globalThis.fetch = async () => {
  throw new TypeError('No network in tests.');
};

// The whole suite runs its files in parallel workers, and a run on the analysis
// page chains several awaited steps: under that load, the default one-second
// wait for an element ran out on whichever test was slowest that time. The
// budget is how long to keep looking, not what is asserted.
configure({ asyncUtilTimeout: 3000 });
