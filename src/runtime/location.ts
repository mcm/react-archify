// URL state. Archify keeps focus, routes, lenses and presentation in the page
// URL (hash and query). Embedded, that is opt-in: by default each instance
// keeps a private URL so it never rewrites the host page's address.

export interface UrlController {
  location: Location;
  history: History;
  /** Listener registration for 'hashchange'/'popstate', which the private URL fires itself. */
  listen(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): boolean;
  unlisten(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean): boolean;
  /** Current hash, for the onViewChange callback. */
  hash(): string;
  destroy(): void;
}

// Query parameters the props own: the theme is a prop, and embed mode would
// hide the viewer chrome the component exists to show.
const PROP_OWNED_PARAMS = ['theme', 'embed'];

function withoutPropParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of PROP_OWNED_PARAMS) params.delete(key);
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function createSyncedUrl(onChange: () => void): UrlController {
  const listeners: Array<[string, EventListenerOrEventListenerObject, AddEventListenerOptions | boolean | undefined]> = [];
  const location = new Proxy(window.location, {
    get(target, key) {
      if (key === 'search') return withoutPropParams(target.search);
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  const history = new Proxy(window.history, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === 'replaceState' || key === 'pushState') {
        return (...args: Parameters<History['replaceState']>) => {
          (value as History['replaceState']).apply(target, args);
          onChange();
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const hashListener = () => onChange();
  window.addEventListener('hashchange', hashListener);
  return {
    location,
    history,
    listen(type, listener, options) {
      if (type !== 'hashchange' && type !== 'popstate') return false;
      window.addEventListener(type, listener, options);
      listeners.push([type, listener, options]);
      return true;
    },
    unlisten(type, listener, options) {
      if (type !== 'hashchange' && type !== 'popstate') return false;
      window.removeEventListener(type, listener, options);
      return true;
    },
    hash: () => window.location.hash,
    destroy() {
      window.removeEventListener('hashchange', hashListener);
      for (const [type, listener, options] of listeners) window.removeEventListener(type, listener, options);
    },
  };
}

export function createPrivateUrl(initialHash: string, onChange: () => void): UrlController {
  const base = new URL(window.location.href);
  base.search = '';
  let url = new URL(base.href);
  url.hash = initialHash ? (initialHash.startsWith('#') ? initialHash : `#${initialHash}`) : '';
  const target = new EventTarget();

  function navigate(next: string | URL | null | undefined, notifyHash: boolean) {
    if (next === undefined || next === null) return;
    const previousHash = url.hash;
    url = new URL(String(next), url);
    onChange();
    if (notifyHash && url.hash !== previousHash) target.dispatchEvent(new Event('hashchange'));
  }

  const location = {
    get href() { return url.href; },
    set href(value: string) { navigate(value, true); },
    get origin() { return url.origin; },
    get protocol() { return url.protocol; },
    get host() { return url.host; },
    get hostname() { return url.hostname; },
    get port() { return url.port; },
    get pathname() { return url.pathname; },
    get search() { return url.search; },
    set search(value: string) { const next = new URL(url.href); next.search = value; navigate(next, false); },
    get hash() { return url.hash; },
    set hash(value: string) { const next = new URL(url.href); next.hash = value; navigate(next, true); },
    get ancestorOrigins() { return window.location.ancestorOrigins; },
    assign(value: string) { navigate(value, true); },
    replace(value: string) { navigate(value, true); },
    reload() {},
    toString() { return url.href; },
  } as unknown as Location;

  const history = {
    get length() { return 1; },
    get state() { return null; },
    scrollRestoration: 'manual',
    replaceState(_state: unknown, _title: string, next?: string | URL | null) { navigate(next, false); },
    pushState(_state: unknown, _title: string, next?: string | URL | null) { navigate(next, false); },
    back() {},
    forward() {},
    go() {},
  } as unknown as History;

  return {
    location,
    history,
    listen(type, listener, options) {
      if (type !== 'hashchange' && type !== 'popstate') return false;
      target.addEventListener(type, listener, options);
      return true;
    },
    unlisten(type, listener, options) {
      if (type !== 'hashchange' && type !== 'popstate') return false;
      target.removeEventListener(type, listener, options);
      return true;
    },
    hash: () => url.hash,
    destroy() {},
  };
}
