export function setTimeout(delay, value) {
  return new Promise((resolve) => globalThis.setTimeout(() => resolve(value), delay));
}
