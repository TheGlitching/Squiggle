import '@testing-library/jest-dom/vitest';

// No test reaches a network. A request no test stubbed (an audience counter
// fired by a click, say) fails here at once, as it would offline, instead of
// trying a real connection.
globalThis.fetch = async () => {
  throw new TypeError('No network in tests.');
};
