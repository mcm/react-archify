// node:url subset used by the vendored renderers.
export function fileURLToPath(value) {
  const url = typeof value === 'string' ? new URL(value) : value;
  return decodeURIComponent(url.pathname);
}

export function pathToFileURL(value) {
  return new URL(`file://${encodeURI(value)}`);
}

export default { fileURLToPath, pathToFileURL };
