// Node built-ins with no browser equivalent. The renderer paths that need them
// (output files, repository verification, raw HTTP) are not reachable from the
// browser entry point; reaching one is a bug worth a clear error.
export function unavailable(name) {
  const fail = () => {
    throw new Error(`archify: ${name} is not available in the browser renderer`);
  };
  return new Proxy(fail, { get: (_target, key) => (key === 'then' ? undefined : fail) });
}
