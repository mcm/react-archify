// node:path for the vendored renderers (POSIX semantics, as in the browser
// there is no platform path flavour to honour).
import pathBrowserify from 'path-browserify';

export default pathBrowserify;
export const { resolve, join, dirname, basename, extname, relative, normalize, isAbsolute, sep, delimiter, parse, format } = pathBrowserify;
export const posix = pathBrowserify;
