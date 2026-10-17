// The process object the vendored renderers read. render.ts sets argv and env
// for the duration of one synchronous render step.
const processShim = {
  argv: ['node', 'archify'],
  env: {},
  exitCode: undefined,
  platform: 'browser',
  cwd: () => '/',
  exit(code) {
    throw new Error(`archify: renderer requested process exit (${code})`);
  },
  on() { return processShim; },
  once() { return processShim; },
  nextTick(callback, ...args) { queueMicrotask(() => callback(...args)); },
  stdout: { write() { return true; } },
  stderr: { write() { return true; }, once() {} },
};

export default processShim;
