/**
 * What pdf.js 6 takes for granted and an older phone's browser lacks (Chrome
 * before 124, Safari before 17.4): served under /pdf/ beside it
 * (`vite.config.ts`), loaded before it by the page (`src/pdf.ts`) and by its
 * worker (`worker.mjs`). Each one stands only where the browser has none.
 */
Promise.withResolvers ??= function withResolvers() {
  let resolve;
  let reject;
  const promise = new this((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* values() {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}
