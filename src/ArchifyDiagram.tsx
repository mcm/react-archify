import { useEffect, useImperativeHandle, useInsertionEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { ArchifyRenderError, renderArchify } from './engine/render';
import { ViewerHost, type ViewerHostOptions } from './runtime/host';
import type { ArchifyApi, ArchifyDocument, NotesPlacement, RenderOptions, RenderResult, ThemeMode, Variant } from './types';

export interface ArchifyDiagramProps {
  /** An Archify JSON document (object or JSON text), any of the ten diagram types. */
  diagram?: ArchifyDocument | string;
  /**
   * A finished Archify HTML artifact (for example `archify render` output).
   * Use this for documents that need CLI-only steps, such as repository
   * source evidence verified against a local checkout. Ignored when
   * `diagram` is set.
   */
  html?: string;
  /** Visual preset. Defaults to the document's `meta.visual_preset`, else `classic`. */
  variant?: Variant;
  /** Color scheme. Defaults to `system`. */
  theme?: ThemeMode;
  /** Show the maximize (presentation stage) button. Defaults to `true`. */
  showMaximize?: boolean;
  /** Show the Export menu. Defaults to `true`. */
  showExport?: boolean;
  /**
   * Where "Notes & Index" sits. Defaults to `bottom`, as in Archify. The right
   * rail needs a component at least 1280px wide; narrower boxes keep it below.
   */
  notesPlacement?: NotesPlacement;
  /** Collapse (or expand) the right-rail notes. Leave unset to let Archify decide by available width. */
  notesCollapsed?: boolean;
  /**
   * Mirror view state (focus, route, lens, presentation) into the page URL,
   * as standalone Archify does. Off by default so embedding never rewrites the
   * host page's address.
   */
  urlState?: boolean;
  /** Controlled view hash, e.g. `#focus=api` or `#route=web~db`. Pair with `onViewChange`. */
  view?: string;
  /** Initial view hash when `view` is not controlled. */
  defaultView?: string;
  /** Called when the reader changes the view (focus, route, lens, reach). */
  onViewChange?: (view: string) => void;
  /** Called when the maximize stage opens or closes. */
  onMaximizeChange?: (maximized: boolean) => void;
  /**
   * Archify's single-key shortcuts (R route, L lens, M map, +/-/0 zoom, E
   * export, F maximize, / find). Inside the component they always work; with
   * nothing focused they go to the diagram the reader last used. Defaults to `true`.
   */
  keyboardShortcuts?: boolean;
  /** Keep reader preferences (motion, rail collapse) in localStorage across diagrams. Defaults to `false`. */
  persistPreferences?: boolean;
  /** Quality gates, as `archify --quality`. */
  qualityProfile?: RenderOptions['qualityProfile'];
  /** fetch used to verify digest-pinned remote brand marks. */
  brandFetch?: RenderOptions['brandFetch'];
  /** Called after the document renders, with Archify's output. */
  onRender?: (result: RenderResult) => void;
  /** Called with the viewer handle once it is interactive. */
  onReady?: (api: ArchifyApi) => void;
  /** Called when the document is rejected or cannot render. */
  onError?: (error: Error) => void;
  /** Shown while the document renders. */
  fallback?: ReactNode;
  /** Shown when rendering fails. Defaults to Archify's diagnostics. */
  errorFallback?: ReactNode | ((error: Error) => ReactNode);
  className?: string;
  style?: CSSProperties;
  id?: string;
  /** Imperative viewer handle. */
  ref?: Ref<ArchifyApi | null>;
}

type RenderState =
  | { status: 'idle' }
  | { status: 'rendering' }
  | { status: 'ready'; html: string }
  | { status: 'error'; error: Error };

const ROOT_ATTRIBUTE = 'data-react-archify-root';
const ROOT_CSS = `:where([${ROOT_ATTRIBUTE}]) { display: block; position: relative; width: 100%; height: 720px; }
[${ROOT_ATTRIBUTE}] > [data-react-archify-host] { position: absolute; inset: 0; width: 100%; height: 100%; }
[${ROOT_ATTRIBUTE}] > [data-react-archify-overlay] { position: absolute; inset: 0; overflow: auto; }`;

function useRootStyle() {
  useInsertionEffect(() => {
    if (document.querySelector('style[data-react-archify-root-style]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-react-archify-root-style', '');
    style.textContent = ROOT_CSS;
    document.head.prepend(style);
  }, []);
}

function DefaultError({ error }: { error: Error }) {
  const diagnostics = error instanceof ArchifyRenderError ? error.diagnostics : [];
  return (
    <div role="alert" style={{ font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace', padding: 16, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>
      <strong>Archify could not render this diagram.</strong>
      {'\n'}
      {diagnostics.length ? diagnostics.map((diagnostic) => `• ${diagnostic.message}`).join('\n') : error.message}
    </div>
  );
}

export function ArchifyDiagram(props: ArchifyDiagramProps) {
  const {
    diagram,
    html,
    variant,
    theme = 'system',
    showMaximize = true,
    showExport = true,
    notesPlacement = 'bottom',
    notesCollapsed,
    urlState = false,
    view,
    defaultView,
    onViewChange,
    onMaximizeChange,
    keyboardShortcuts = true,
    persistPreferences = false,
    qualityProfile,
    brandFetch,
    onRender,
    onReady,
    onError,
    fallback = null,
    errorFallback,
    className,
    style,
    id,
    ref,
  } = props;

  useRootStyle();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerHost | null>(null);
  const apiRef = useRef<ArchifyApi | null>(null);
  const [state, setState] = useState<RenderState>({ status: 'idle' });

  // Callbacks are read through a ref so a new closure never remounts the viewer.
  const callbacks = useRef({ onViewChange, onMaximizeChange, onRender, onReady, onError });
  callbacks.current = { onViewChange, onMaximizeChange, onRender, onReady, onError };

  const diagramKey = useMemo(() => (diagram === undefined ? undefined : typeof diagram === 'string' ? diagram : JSON.stringify(diagram)), [diagram]);

  useEffect(() => {
    if (diagramKey === undefined) {
      setState(html ? { status: 'ready', html } : { status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'rendering' });
    renderArchify(diagramKey, { qualityProfile, brandFetch })
      .then((result) => {
        if (cancelled) return;
        callbacks.current.onRender?.(result);
        setState({ status: 'ready', html: result.html });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        callbacks.current.onError?.(error);
        setState({ status: 'error', error });
      });
    return () => { cancelled = true; };
  }, [diagramKey, html, qualityProfile, brandFetch]);

  const hostOptions = (renderedHtml: string): ViewerHostOptions => ({
    html: renderedHtml,
    theme,
    variant,
    showMaximize,
    showExport,
    notesPlacement,
    notesCollapsed,
    urlState,
    initialView: view ?? defaultView,
    keyboardShortcuts,
    persistPreferences,
    onViewChange: (hash) => callbacks.current.onViewChange?.(hash),
    onMaximizeChange: (maximized) => callbacks.current.onMaximizeChange?.(maximized),
    onReady: (api) => {
      apiRef.current = api;
      callbacks.current.onReady?.(api);
    },
  });

  const readyHtml = state.status === 'ready' ? state.html : null;
  const latestOptions = useRef(hostOptions);
  latestOptions.current = hostOptions;

  // Mount a viewer per rendered document (and per URL mode, which the viewer
  // reads once at startup).
  useEffect(() => {
    const element = hostRef.current;
    if (!element || readyHtml === null) return;
    let viewer: ViewerHost;
    try {
      viewer = new ViewerHost(element, latestOptions.current(readyHtml));
    } catch (error) {
      callbacks.current.onError?.(error as Error);
      setState({ status: 'error', error: error as Error });
      return;
    }
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      if (viewerRef.current === viewer) viewerRef.current = null;
      apiRef.current = null;
    };
  }, [readyHtml, urlState]);

  // Everything else updates the live viewer in place.
  useEffect(() => {
    if (readyHtml === null) return;
    viewerRef.current?.update(latestOptions.current(readyHtml));
  }, [readyHtml, theme, variant, showMaximize, showExport, notesPlacement, notesCollapsed, keyboardShortcuts, persistPreferences]);

  useEffect(() => {
    if (view !== undefined) viewerRef.current?.setView(view);
  }, [view, readyHtml]);

  useImperativeHandle(ref, () => ({
    get viewer() { return apiRef.current?.viewer ?? {}; },
    get shadowRoot() { return apiRef.current?.shadowRoot as ShadowRoot; },
    getView: () => apiRef.current?.getView() ?? '',
    setView: (hash: string) => apiRef.current?.setView(hash),
    maximize: () => apiRef.current?.maximize(),
    restore: () => apiRef.current?.restore(),
    isMaximized: () => apiRef.current?.isMaximized() ?? false,
    zoomIn: () => apiRef.current?.zoomIn(),
    zoomOut: () => apiRef.current?.zoomOut(),
    resetZoom: () => apiRef.current?.resetZoom(),
    export: (format) => apiRef.current ? apiRef.current.export(format) : Promise.reject(new Error('Archify viewer is not ready')),
    clearFocus: () => apiRef.current?.clearFocus(),
    waitForStableLayout: () => apiRef.current?.waitForStableLayout() ?? Promise.resolve(),
  }), []);

  let overlay: ReactNode = null;
  if (state.status === 'rendering') overlay = fallback;
  else if (state.status === 'error') {
    overlay = errorFallback === undefined
      ? <DefaultError error={state.error} />
      : typeof errorFallback === 'function' ? errorFallback(state.error) : errorFallback;
  }

  return (
    <div {...{ [ROOT_ATTRIBUTE]: '' }} className={className} style={style} id={id}>
      <div ref={hostRef} data-react-archify-host="" hidden={state.status === 'error'} />
      {overlay !== null && overlay !== undefined ? <div data-react-archify-overlay="">{overlay}</div> : null}
    </div>
  );
}
