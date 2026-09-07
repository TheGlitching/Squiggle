/**
 * The Workers lib types `Response.json()` as `Promise<unknown>`; the test
 * suite deals in JSON all the time, so widen it for the test context.
 */
declare global {
  interface Response {
    json(): Promise<any>;
  }
}
export {};
