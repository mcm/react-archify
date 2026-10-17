// Mounts one Archify viewer into a shadow root. The viewer markup, styles and
// script are Archify's own; this module supplies the browser environment they
// expect (a document, a window, a URL, storage) scoped to the component box.

import { bootViewer } from '../vendor/archify/runtime.js';
import { BODY_CLASS, FONT_CSS, ORIGINAL_CSS, ROOT_CLASS, SCOPED_CSS } from '../vendor/archify/styles.js';
import { installGeometry, RECT, registerOrigin, SCREEN_CTM, unregisterOrigin } from './geometry';
import { createPrivateUrl, createSyncedUrl, type UrlController } from './location';
import { InstanceStorage } from './storage';
import type { ArchifyApi, NotesPlacement, ThemeMode, Variant } from '../types';

export interface ViewerHostOptions {
  /** Filled Archify HTML document (renderer output or a CLI-built artifact). */
  html: string;
  theme: ThemeMode;
  variant: Variant | undefined;
  showMaximize: boolean;
  showExport: boolean;
  notesPlacement: NotesPlacement;
  notesCollapsed: boolean | undefined;
  urlState: boolean;
  initialView: string | undefined;
  keyboardShortcuts: boolean;
  persistPreferences: boolean;
  onViewChange?: (hash: string) => void;
  onMaximizeChange?: (maximized: boolean) => void;
  onReady?: (api: ArchifyApi) => void;
}

const HOST_ATTRIBUTE = 'data-react-archify-host';
const PRESENTING_ATTRIBUTE = 'data-archify-presenting';
const FRAME_CLASS = 'archify-frame';
const SCROLLER_CLASS = 'archify-scroller';
const HEAD_CLASS = 'archify-head';

// Host-page rules. The font faces must live in the document: @font-face is
// not honoured inside shadow trees. The maximize rule must beat the host's
// own styles on the element, hence !important.
const DOCUMENT_CSS = `${FONT_CSS}
[${HOST_ATTRIBUTE}][${PRESENTING_ATTRIBUTE}] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  transform: none !important;
  z-index: 2147483000 !important;
  overflow: hidden !important;
  background: transparent !important;
}
[${HOST_ATTRIBUTE}][${PRESENTING_ATTRIBUTE}]::backdrop { background: transparent; }
`;

// Shadow-root base: the frame plays the browser window (containing block for
// fixed chrome, container for viewport queries/units), the scroller plays the
// window scroll, and the wrapper elements play <html>, <head> and <body>.
const BASE_CSS = `
:host {
  all: initial;
  display: block;
  position: relative;
  width: 100%;
  height: 720px;
}
:host([hidden]) { display: none; }
.${FRAME_CLASS} {
  position: absolute;
  inset: 0;
  overflow: hidden;
  contain: layout paint;
  container: archify-viewport / size;
}
.${SCROLLER_CLASS} {
  position: absolute;
  inset: 0;
  overflow: auto;
}
.${ROOT_CLASS} {
  display: block;
  font-size: 16px;
  line-height: normal;
  text-align: start;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
.${BODY_CLASS} { display: block; }
.${HEAD_CLASS} { display: none !important; }
`;

// Chrome the props own. The theme toggle and style menu become props; the
// maximize button and export menu can be switched off.
const CONTROL_CSS = `
.${FRAME_CLASS} #btn-theme,
.${FRAME_CLASS} .preset-wrap { display: none !important; }
.${FRAME_CLASS}[data-hide-maximize] #btn-present { display: none !important; }
.${FRAME_CLASS}[data-hide-export] #btn-export,
.${FRAME_CLASS}[data-hide-export] .export-wrap { display: none !important; }
`;

let documentStyle: HTMLStyleElement | null = null;
let documentStyleUsers = 0;

function retainDocumentStyle() {
  documentStyleUsers += 1;
  if (documentStyle && documentStyle.isConnected) return;
  documentStyle = document.createElement('style');
  documentStyle.setAttribute('data-react-archify', '');
  documentStyle.textContent = DOCUMENT_CSS;
  document.head.appendChild(documentStyle);
}

function releaseDocumentStyle() {
  documentStyleUsers -= 1;
  if (documentStyleUsers <= 0 && documentStyle) {
    documentStyle.remove();
    documentStyle = null;
    documentStyleUsers = 0;
  }
}

let originalSheet: CSSStyleSheet | null = null;

function exportSheet(): CSSStyleSheet | null {
  if (originalSheet) return originalSheet;
  try {
    originalSheet = new CSSStyleSheet();
    originalSheet.replaceSync(ORIGINAL_CSS);
  } catch {
    originalSheet = null;
  }
  return originalSheet;
}

// ---- Keyboard ownership -----------------------------------------------------
// Standalone Archify listens to the whole page. Embedded, a key pressed with
// nothing focused goes to the viewer the reader last interacted with.

let keyboardOwner: ViewerHost | null = null;

// ---- Event routing ------------------------------------------------------------

type Options = AddEventListenerOptions | boolean | undefined;

// Events that only ever fire on the document itself.
const DOCUMENT_ONLY = new Set(['visibilitychange', 'fullscreenchange', 'fullscreenerror', 'selectionchange', 'readystatechange', 'pointerlockchange', 'copy', 'paste', 'cut']);
// Window events with no in-tree source.
const WINDOW_ONLY = new Set(['blur', 'focus', 'beforeprint', 'afterprint', 'pagehide', 'pageshow', 'beforeunload', 'unload', 'message', 'online', 'offline', 'storage', 'languagechange', 'orientationchange', 'deviceorientation', 'devicemotion']);
const KEYBOARD = new Set(['keydown', 'keyup', 'keypress']);

function captureFlag(options: Options): boolean {
  return typeof options === 'boolean' ? options : Boolean(options && options.capture);
}

interface Registration {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options: Options;
}

function invoke(listener: EventListenerOrEventListenerObject, thisArg: unknown, event: Event) {
  if (typeof listener === 'function') listener.call(thisArg, event);
  else listener.handleEvent(event);
}

export class ViewerHost {
  readonly host: HTMLElement;
  private options: ViewerHostOptions;
  private shadow!: ShadowRoot;
  private frame!: HTMLDivElement;
  private scroller!: HTMLDivElement;
  private htmlEl!: HTMLDivElement;
  private headEl!: HTMLDivElement;
  private bodyEl!: HTMLDivElement;
  private title = '';
  private registrations: Registration[] = [];
  private wrapped = new Map<string, Map<EventListenerOrEventListenerObject, EventListener>>();
  private timeouts = new Set<number>();
  private intervals = new Set<number>();
  private frames = new Set<number>();
  private observers = new Set<{ disconnect(): void }>();
  private mediaListeners: Array<[MediaQueryList, string, EventListenerOrEventListenerObject | ((event: MediaQueryListEvent) => void)]> = [];
  private resizeTarget = new EventTarget();
  private loadTarget = new EventTarget();
  private storage: InstanceStorage;
  private url!: UrlController;
  private archify: Record<string, any> | null = null;
  private api: ArchifyApi | null = null;
  private destroyed = false;
  private originalToggles: { theme?: () => void; present?: () => void; exportOpen?: (...args: unknown[]) => unknown } = {};
  private presentObserver: MutationObserver | null = null;
  private frameObserver: ResizeObserver | null = null;
  private lastHash = '';
  private systemThemeQuery: MediaQueryList | null = null;
  private onSystemTheme = () => this.applyTheme();
  private onDocumentPointer = (event: Event) => {
    if (event.composedPath().includes(this.host)) keyboardOwner = this;
    else if (keyboardOwner === this) keyboardOwner = null;
  };

  constructor(host: HTMLElement, options: ViewerHostOptions) {
    this.host = host;
    this.options = options;
    this.storage = new InstanceStorage({ pinned: this.pinnedPreferences(), persist: options.persistPreferences });
    installGeometry();
    retainDocumentStyle();
    this.mount();
  }

  // ---- Public surface ---------------------------------------------------------

  update(next: ViewerHostOptions): void {
    const previous = this.options;
    this.options = next;
    if (this.destroyed) return;
    this.storage.configure({ pinned: this.pinnedPreferences(), persist: next.persistPreferences });
    this.applyChromeFlags();
    if (previous.theme !== next.theme) this.applyTheme();
    if (previous.variant !== next.variant) this.applyVariant();
    if (previous.notesPlacement !== next.notesPlacement) this.applyNotesPlacement();
    if (previous.notesCollapsed !== next.notesCollapsed && next.notesCollapsed !== undefined) this.applyNotesCollapsed();
    if (!next.showMaximize && this.archify?.presentation?.active()) this.archify.presentation.exit();
    if (!next.showExport && this.archify?.exportMenu?.isOpen()) this.archify.exportMenu.close(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (keyboardOwner === this) keyboardOwner = null;
    for (const registration of this.registrations) {
      registration.target.removeEventListener(registration.type, registration.listener, registration.options);
    }
    this.registrations = [];
    for (const id of this.timeouts) window.clearTimeout(id);
    for (const id of this.intervals) window.clearInterval(id);
    for (const id of this.frames) window.cancelAnimationFrame(id);
    for (const observer of this.observers) observer.disconnect();
    for (const [query, type, listener] of this.mediaListeners) {
      if (type === 'legacy') query.removeListener(listener as (event: MediaQueryListEvent) => void);
      else query.removeEventListener(type, listener as EventListener);
    }
    this.systemThemeQuery?.removeEventListener('change', this.onSystemTheme);
    this.presentObserver?.disconnect();
    this.frameObserver?.disconnect();
    document.removeEventListener('pointerdown', this.onDocumentPointer, true);
    document.removeEventListener('focusin', this.onDocumentPointer, true);
    this.url?.destroy();
    this.setPresenting(false);
    unregisterOrigin(this.shadow);
    this.shadow.replaceChildren();
    releaseDocumentStyle();
  }

  // ---- Mounting -----------------------------------------------------------------

  private mount(): void {
    this.shadow = this.host.shadowRoot ?? this.host.attachShadow({ mode: 'open' });
    this.shadow.replaceChildren();
    this.host.setAttribute(HOST_ATTRIBUTE, '');

    const parsed = new DOMParser().parseFromString(this.options.html, 'text/html');
    this.title = parsed.title;

    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${SCOPED_CSS}\n${CONTROL_CSS}`;
    this.frame = document.createElement('div');
    this.frame.className = FRAME_CLASS;
    this.frame.setAttribute('part', 'frame');
    this.scroller = document.createElement('div');
    this.scroller.className = SCROLLER_CLASS;
    this.htmlEl = document.createElement('div');
    this.htmlEl.className = ROOT_CLASS;
    for (const attribute of Array.from(parsed.documentElement.attributes)) {
      this.htmlEl.setAttribute(attribute.name, attribute.value);
    }
    this.headEl = document.createElement('div');
    this.headEl.className = HEAD_CLASS;
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = BODY_CLASS;
    for (const attribute of Array.from(parsed.body.attributes)) {
      if (attribute.name === 'class') this.bodyEl.className = `${BODY_CLASS} ${attribute.value}`;
      else this.bodyEl.setAttribute(attribute.name, attribute.value);
    }

    // Data islands (locale catalog, source evidence) keep their IDs; code and
    // styles do not come along: the viewer code and CSS are bundled.
    const fonts = document.createElement('style');
    fonts.id = 'archify-fonts';
    fonts.media = 'not all';
    fonts.textContent = FONT_CSS;
    this.headEl.appendChild(fonts);
    const keep = (node: Node) => {
      if (!(node instanceof Element)) return true;
      if (node.localName === 'style' || node.localName === 'link' || node.localName === 'meta' || node.localName === 'title' || node.localName === 'base') return false;
      if (node.localName === 'script') {
        const type = (node.getAttribute('type') || '').toLowerCase();
        return type === 'application/json' || type === 'application/ld+json';
      }
      return true;
    };
    for (const node of Array.from(parsed.head.childNodes)) {
      if (node instanceof Element && keep(node)) this.headEl.appendChild(document.importNode(node, true));
    }
    for (const node of Array.from(parsed.body.childNodes)) {
      if (!keep(node)) continue;
      const imported = document.importNode(node, true);
      if (imported instanceof Element) imported.querySelectorAll('script').forEach((script) => { if (!keep(script)) script.remove(); });
      this.bodyEl.appendChild(imported);
    }

    this.htmlEl.append(this.headEl, this.bodyEl);
    this.scroller.appendChild(this.htmlEl);
    this.frame.appendChild(this.scroller);
    this.shadow.append(style, this.frame);
    registerOrigin(this.shadow, () => {
      const rect = this.frame.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    });

    this.applyChromeFlags();
    this.url = this.options.urlState
      ? createSyncedUrl(() => this.emitViewChange())
      : createPrivateUrl(this.options.initialView ?? '', () => this.emitViewChange());
    this.lastHash = this.url.hash();

    this.frameObserver = new ResizeObserver(() => this.resizeTarget.dispatchEvent(new Event('resize')));
    this.frameObserver.observe(this.frame);
    document.addEventListener('pointerdown', this.onDocumentPointer, true);
    document.addEventListener('focusin', this.onDocumentPointer, true);
    this.presentObserver = new MutationObserver(() => this.syncPresenting());
    this.presentObserver.observe(this.htmlEl, { attributes: true, attributeFilter: ['data-present'] });

    this.boot();
  }

  private boot(): void {
    const archify = bootViewer({
      globals: this.createGlobals(),
      rect: RECT,
      screenCTM: SCREEN_CTM,
      originX: () => this.frame.getBoundingClientRect().left,
      originY: () => this.frame.getBoundingClientRect().top,
    }) as Record<string, any>;
    this.archify = archify;
    this.guardShortcuts();
    this.applyTheme();
    this.applyVariant();
    this.syncPresenting();
    // The standalone script runs before window load; replay it.
    this.trackFrame(() => {
      if (this.destroyed) return;
      this.loadTarget.dispatchEvent(new Event('load'));
    });
    this.api = this.createApi();
    this.options.onReady?.(this.api);
  }

  // ---- Props -> viewer ---------------------------------------------------------

  private pinnedPreferences(): Record<string, string | null> {
    const pinned: Record<string, string | null> = {
      'archify-rail-placement': this.options.notesPlacement,
    };
    if (this.options.theme !== 'system') pinned['archify-theme'] = this.options.theme;
    else pinned['archify-theme'] = null;
    if (this.options.notesCollapsed !== undefined) pinned['archify-rail-collapsed'] = this.options.notesCollapsed ? '1' : '0';
    return pinned;
  }

  private applyChromeFlags(): void {
    this.frame.toggleAttribute('data-hide-maximize', !this.options.showMaximize);
    this.frame.toggleAttribute('data-hide-export', !this.options.showExport);
  }

  private desiredTheme(): 'light' | 'dark' {
    if (this.options.theme !== 'system') return this.options.theme;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  private applyTheme(): void {
    if (this.options.theme === 'system' && !this.systemThemeQuery) {
      this.systemThemeQuery = window.matchMedia('(prefers-color-scheme: light)');
      this.systemThemeQuery.addEventListener('change', this.onSystemTheme);
    } else if (this.options.theme !== 'system' && this.systemThemeQuery) {
      this.systemThemeQuery.removeEventListener('change', this.onSystemTheme);
      this.systemThemeQuery = null;
    }
    const toggle = this.originalToggles.theme;
    if (toggle && this.htmlEl.getAttribute('data-theme') !== this.desiredTheme()) toggle();
  }

  private applyVariant(): void {
    const preset = this.archify?.preset;
    if (!preset) return;
    const target = this.options.variant ?? preset.authored;
    if (preset.current() !== target) preset.apply(target);
  }

  private applyNotesPlacement(): void {
    const button = this.shadow.getElementById('rail-placement');
    if (!button) return;
    const placement = this.htmlEl.getAttribute('data-reader-rail');
    const atBottom = placement === 'bottom';
    if ((this.options.notesPlacement === 'bottom') !== atBottom) (button as HTMLElement).click();
  }

  private applyNotesCollapsed(): void {
    const placement = this.htmlEl.getAttribute('data-reader-rail');
    if (this.options.notesCollapsed && (placement === 'true' || placement === 'overlay')) {
      (this.shadow.getElementById('rail-collapse') as HTMLElement | null)?.click();
    } else if (!this.options.notesCollapsed && placement === 'collapsed') {
      (this.shadow.getElementById('rail-reveal') as HTMLElement | null)?.click();
    }
  }

  // Theme and style shortcuts (T, S) belong to the props; maximize (F) and
  // export (E) follow their visibility props.
  private guardShortcuts(): void {
    const archify = this.archify;
    if (!archify) return;
    if (archify.theme) {
      this.originalToggles.theme = archify.theme.toggle;
      archify.theme.toggle = () => {};
    }
    if (archify.preset) archify.preset.cycle = () => false;
    if (archify.presentation) {
      const toggle = archify.presentation.toggle;
      const enter = archify.presentation.enter;
      archify.presentation.toggle = (...args: unknown[]) => (this.options.showMaximize || archify.presentation.active() ? toggle(...args) : false);
      if (typeof enter === 'function') {
        archify.presentation.enter = (...args: unknown[]) => (this.options.showMaximize ? enter(...args) : false);
      }
    }
    if (archify.exportMenu) {
      const open = archify.exportMenu.open;
      archify.exportMenu.open = (...args: unknown[]) => (this.options.showExport ? open(...args) : false);
    }
  }

  private syncPresenting(): void {
    const presenting = this.htmlEl.getAttribute('data-present') === 'true' && this.htmlEl.getAttribute('data-embed') !== 'true';
    const was = this.host.hasAttribute(PRESENTING_ATTRIBUTE);
    this.setPresenting(presenting);
    if (was !== presenting) this.options.onMaximizeChange?.(presenting);
  }

  private setPresenting(presenting: boolean): void {
    const host = this.host as HTMLElement & { showPopover?: () => void; hidePopover?: () => void };
    if (presenting) {
      if (!host.hasAttribute(PRESENTING_ATTRIBUTE)) {
        host.setAttribute(PRESENTING_ATTRIBUTE, '');
        // The top layer escapes host-page stacking contexts and overflow.
        if (typeof host.showPopover === 'function') {
          host.setAttribute('popover', 'manual');
          try { host.showPopover(); } catch { /* already showing */ }
        }
      }
    } else if (host.hasAttribute(PRESENTING_ATTRIBUTE)) {
      if (host.hasAttribute('popover')) {
        try { host.hidePopover?.(); } catch { /* not showing */ }
        host.removeAttribute('popover');
      }
      host.removeAttribute(PRESENTING_ATTRIBUTE);
    }
  }

  private emitViewChange(): void {
    const hash = this.url.hash();
    if (hash === this.lastHash) return;
    this.lastHash = hash;
    this.options.onViewChange?.(hash);
  }

  /** Navigate the private URL (or the page URL with urlState) to a view hash. */
  setView(hash: string): void {
    const normalized = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : '';
    if (this.url.hash() === normalized) return;
    this.url.location.hash = normalized;
  }

  private createApi(): ArchifyApi {
    const archify = this.archify!;
    return {
      viewer: archify,
      getView: () => this.url.hash(),
      setView: (hash: string) => this.setView(hash),
      maximize: () => { if (!archify.presentation.active()) archify.presentation.toggle(); },
      restore: () => { if (archify.presentation.active()) archify.presentation.exit(); },
      isMaximized: () => Boolean(archify.presentation.active()),
      zoomIn: () => archify.view.zoomIn(),
      zoomOut: () => archify.view.zoomOut(),
      resetZoom: () => archify.view.reset(),
      export: (format) => archify.exportMenu.run(format),
      clearFocus: () => archify.focus?.clear?.({}),
      waitForStableLayout: () => (archify.readerLayout?.whenStable ? archify.readerLayout.whenStable() : Promise.resolve()),
      shadowRoot: this.shadow,
    };
  }

  // ---- Environment -------------------------------------------------------------

  private trackTimeout(callback: TimerHandler, delay?: number, ...args: unknown[]): number {
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      if (this.destroyed) return;
      if (typeof callback === 'function') callback(...args);
    }, delay);
    this.timeouts.add(id);
    return id;
  }

  private trackInterval(callback: TimerHandler, delay?: number, ...args: unknown[]): number {
    const id = window.setInterval(() => {
      if (this.destroyed) return;
      if (typeof callback === 'function') callback(...args);
    }, delay);
    this.intervals.add(id);
    return id;
  }

  private trackFrame(callback: FrameRequestCallback): number {
    const id = window.requestAnimationFrame((time) => {
      this.frames.delete(id);
      if (this.destroyed) return;
      callback(time);
    });
    this.frames.add(id);
    return id;
  }

  private trackObserver<T extends { new (...args: any[]): { disconnect(): void } }>(Base: T | undefined): T | undefined {
    if (typeof Base !== 'function') return Base;
    const observers = this.observers;
    return class extends Base {
      constructor(...args: any[]) {
        super(...args);
        observers.add(this);
      }
    };
  }

  private trackedMatchMedia(query: string): MediaQueryList {
    const list = window.matchMedia(query);
    const listeners = this.mediaListeners;
    return new Proxy(list, {
      get(target, key) {
        if (key === 'addEventListener') {
          return (type: string, listener: EventListenerOrEventListenerObject, options?: Options) => {
            target.addEventListener(type, listener, options);
            listeners.push([target, type, listener]);
          };
        }
        if (key === 'addListener') {
          return (listener: (event: MediaQueryListEvent) => void) => {
            target.addListener(listener);
            listeners.push([target, 'legacy', listener]);
          };
        }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  private register(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options: Options) {
    target.addEventListener(type, listener, options);
    this.registrations.push({ target, type, listener, options });
  }

  private unregister(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options: Options) {
    target.removeEventListener(type, listener, options);
    const capture = captureFlag(options);
    this.registrations = this.registrations.filter((entry) => !(entry.target === target && entry.type === type && entry.listener === listener && captureFlag(entry.options) === capture));
  }

  // In-tree events reach the listener through the shadow root, so targets are
  // real elements. Page events reach it through the document; events that
  // started inside this viewer are skipped there because the shadow root
  // already delivered them.
  private addTreeListener(source: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options: Options, thisArg: unknown) {
    const key = `${type}:${captureFlag(options)}`;
    if (!this.wrapped.has(key)) this.wrapped.set(key, new Map());
    const byListener = this.wrapped.get(key)!;
    if (byListener.has(listener)) return;
    const keyboard = KEYBOARD.has(type);
    const inner: EventListener = (event) => {
      if (keyboard && !this.options.keyboardShortcuts && !this.isEditingTarget(event)) return;
      invoke(listener, thisArg, event);
    };
    const outer: EventListener = (event) => {
      if (event.composedPath().includes(this.host)) return;
      if (keyboard) {
        if (!this.options.keyboardShortcuts || keyboardOwner !== this) return;
        const active = document.activeElement;
        if (active && active !== document.body && active !== document.documentElement) return;
      }
      invoke(listener, thisArg, event);
    };
    const pair = (() => {}) as unknown as EventListener;
    byListener.set(listener, pair);
    (pair as any).inner = inner;
    (pair as any).outer = outer;
    this.register(this.shadow, type, inner, options);
    this.register(source, type, outer, options);
  }

  private removeTreeListener(source: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options: Options) {
    const key = `${type}:${captureFlag(options)}`;
    const pair = this.wrapped.get(key)?.get(listener) as any;
    if (!pair) return;
    this.wrapped.get(key)!.delete(listener);
    this.unregister(this.shadow, type, pair.inner, options);
    this.unregister(source, type, pair.outer, options);
  }

  // Typing inside the viewer's own inputs (node finder) still works when
  // shortcuts are disabled.
  private isEditingTarget(event: Event): boolean {
    const target = event.composedPath()[0];
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  }

  private createGlobals(): Record<string, unknown> {
    const host = this;
    const shadow = this.shadow;
    const frame = this.frame;
    const scroller = this.scroller;
    const htmlEl = this.htmlEl;
    const bodyEl = this.bodyEl;
    const headEl = this.headEl;

    const documentOverrides: Record<PropertyKey, unknown> = {
      getElementById: (id: string) => shadow.getElementById(id),
      querySelector: (selector: string) => shadow.querySelector(selector),
      querySelectorAll: (selector: string) => shadow.querySelectorAll(selector),
      getElementsByClassName: (names: string) => htmlEl.getElementsByClassName(names),
      getElementsByTagName: (name: string) => htmlEl.getElementsByTagName(name),
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: Options) => {
        if (!listener) return;
        if (type === 'DOMContentLoaded') return;
        if (DOCUMENT_ONLY.has(type)) host.register(document, type, listener, options);
        else host.addTreeListener(document, type, listener, options, documentProxy);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: Options) => {
        if (DOCUMENT_ONLY.has(type)) host.unregister(document, type, listener, options);
        else host.removeTreeListener(document, type, listener, options);
      },
    };
    const documentGetters: Record<PropertyKey, () => unknown> = {
      documentElement: () => htmlEl,
      body: () => bodyEl,
      head: () => headEl,
      scrollingElement: () => scroller,
      activeElement: () => shadow.activeElement ?? bodyEl,
      title: () => host.title,
      styleSheets: () => {
        const sheets: CSSStyleSheet[] = [];
        const original = exportSheet();
        if (original) sheets.push(original);
        headEl.querySelectorAll('style').forEach((element) => {
          if (element.id !== 'archify-fonts' && element.sheet) sheets.push(element.sheet);
        });
        return sheets;
      },
      defaultView: () => windowProxy,
      location: () => host.url.location,
    };
    const documentProxy: Document = new Proxy(document, {
      get(target, key) {
        if (Object.prototype.hasOwnProperty.call(documentGetters, key)) return documentGetters[key as string]();
        if (Object.prototype.hasOwnProperty.call(documentOverrides, key)) return documentOverrides[key as string];
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, key, value) {
        if (key === 'title') return true;
        return Reflect.set(target, key, value, target);
      },
    });

    const windowOverrides: Record<PropertyKey, unknown> = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: Options) => {
        if (!listener) return;
        if (type === 'resize') host.register(host.resizeTarget, type, listener, options);
        else if (type === 'scroll') host.register(scroller, type, listener, options);
        else if (type === 'load') host.register(host.loadTarget, type, listener, options);
        else if (host.url.listen(type, listener, options)) return;
        else if (WINDOW_ONLY.has(type)) host.register(window, type, listener, options);
        else host.addTreeListener(window, type, listener, options, windowProxy);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: Options) => {
        if (type === 'resize') host.unregister(host.resizeTarget, type, listener, options);
        else if (type === 'scroll') host.unregister(scroller, type, listener, options);
        else if (type === 'load') host.unregister(host.loadTarget, type, listener, options);
        else if (host.url.unlisten(type, listener, options)) return;
        else if (WINDOW_ONLY.has(type)) host.unregister(window, type, listener, options);
        else host.removeTreeListener(window, type, listener, options);
      },
      scrollTo: (...args: [ScrollToOptions] | [number, number]) => {
        if (typeof args[0] === 'object') scroller.scrollTo(args[0]);
        else scroller.scrollTo(args[0] as number, args[1] as number);
      },
      scroll: (...args: [ScrollToOptions] | [number, number]) => {
        if (typeof args[0] === 'object') scroller.scrollTo(args[0]);
        else scroller.scrollTo(args[0] as number, args[1] as number);
      },
      scrollBy: (...args: [ScrollToOptions] | [number, number]) => {
        if (typeof args[0] === 'object') scroller.scrollBy(args[0]);
        else scroller.scrollBy(args[0] as number, args[1] as number);
      },
      matchMedia: (query: string) => host.trackedMatchMedia(query),
      setTimeout: (callback: TimerHandler, delay?: number, ...args: unknown[]) => host.trackTimeout(callback, delay, ...args),
      clearTimeout: (id?: number) => { if (id !== undefined) { window.clearTimeout(id); host.timeouts.delete(id); } },
      setInterval: (callback: TimerHandler, delay?: number, ...args: unknown[]) => host.trackInterval(callback, delay, ...args),
      clearInterval: (id?: number) => { if (id !== undefined) { window.clearInterval(id); host.intervals.delete(id); } },
      requestAnimationFrame: (callback: FrameRequestCallback) => host.trackFrame(callback),
      cancelAnimationFrame: (id: number) => { window.cancelAnimationFrame(id); host.frames.delete(id); },
      getComputedStyle: (element: Element, pseudo?: string | null) => window.getComputedStyle(element, pseudo),
      ResizeObserver: host.trackObserver(window.ResizeObserver),
      MutationObserver: host.trackObserver(window.MutationObserver),
      IntersectionObserver: host.trackObserver(window.IntersectionObserver),
    };
    const windowGetters: Record<PropertyKey, () => unknown> = {
      innerWidth: () => frame.clientWidth,
      innerHeight: () => frame.clientHeight,
      outerWidth: () => frame.clientWidth,
      outerHeight: () => frame.clientHeight,
      scrollX: () => scroller.scrollLeft,
      scrollY: () => scroller.scrollTop,
      pageXOffset: () => scroller.scrollLeft,
      pageYOffset: () => scroller.scrollTop,
      document: () => documentProxy,
      location: () => host.url.location,
      history: () => host.url.history,
      localStorage: () => host.storage,
      sessionStorage: () => host.storage,
      window: () => windowProxy,
      self: () => windowProxy,
    };
    const windowProxy: Window = new Proxy(window, {
      get(target, key) {
        if (Object.prototype.hasOwnProperty.call(windowGetters, key)) return windowGetters[key as string]();
        if (Object.prototype.hasOwnProperty.call(windowOverrides, key)) return windowOverrides[key as string];
        const value = Reflect.get(target, key, target);
        // Constructors (URL, Blob, Image...) must stay unbound.
        if (typeof value === 'function' && !/^[A-Z]/.test(String(key))) return value.bind(target);
        return value;
      },
      set(target, key, value) {
        return Reflect.set(target, key, value, target);
      },
    });

    return {
      document: documentProxy,
      window: windowProxy,
      localStorage: this.storage,
      sessionStorage: this.storage,
      history: this.url.history,
      location: this.url.location,
      navigator: window.navigator,
      matchMedia: windowOverrides.matchMedia,
      getComputedStyle: windowOverrides.getComputedStyle,
      setTimeout: windowOverrides.setTimeout,
      clearTimeout: windowOverrides.clearTimeout,
      setInterval: windowOverrides.setInterval,
      clearInterval: windowOverrides.clearInterval,
      requestAnimationFrame: windowOverrides.requestAnimationFrame,
      cancelAnimationFrame: windowOverrides.cancelAnimationFrame,
      ResizeObserver: windowOverrides.ResizeObserver,
      MutationObserver: windowOverrides.MutationObserver,
      IntersectionObserver: windowOverrides.IntersectionObserver,
      scrollTo: windowOverrides.scrollTo,
      addEventListener: windowOverrides.addEventListener,
      removeEventListener: windowOverrides.removeEventListener,
    };
  }
}
