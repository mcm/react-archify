/** Archify's four visual presets (the viewer's "Style" menu). */
export type Variant = 'classic' | 'signal-flow' | 'blueprint' | 'editorial';

/** Color scheme. `system` follows `prefers-color-scheme`, as standalone Archify does. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Where the "Notes & Index" panel sits: the right rail or below the diagram. */
export type NotesPlacement = 'right' | 'bottom';

export type DiagramType =
  | 'architecture'
  | 'workflow'
  | 'sequence'
  | 'dataflow'
  | 'lifecycle'
  | 'erd'
  | 'class'
  | 'tree'
  | 'timeline'
  | 'waterfall';

/** Export formats offered by the viewer's Export menu. */
export type ExportFormat = 'svg' | 'svg-light' | 'svg-dark' | 'png' | 'jpeg' | 'webp' | 'webm';

/**
 * An Archify JSON document (schema_version 1). See the Archify schemas for
 * each diagram type: https://github.com/tt-a1i/archify/tree/main/archify/schemas
 */
export interface ArchifyDocument {
  schema_version: 1;
  diagram_type: DiagramType;
  meta: {
    title: string;
    subtitle?: string;
    locale?: string;
    visual_preset?: Variant;
    quality_profile?: 'standard' | 'showcase';
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ArchifyDiagnostic {
  code: string;
  message: string;
  severity?: string;
  subject?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  supportedFixes?: string[];
  [key: string]: unknown;
}

export interface RenderOptions {
  /**
   * Layout quality gates, as `archify --quality`. Defaults to the document's
   * `meta.quality_profile` (advisory when absent), exactly like the CLI.
   */
  qualityProfile?: 'standard' | 'showcase';
  /**
   * fetch used to verify digest-pinned remote brand marks (`brand: { url,
   * sha256 }`). Defaults to `globalThis.fetch`; supply a proxying fetch when
   * the brand sites do not allow cross-origin requests. Built-in brand IDs
   * need no network.
   */
  brandFetch?: typeof fetch | null;
}

export interface RenderResult {
  /** The filled Archify HTML document. */
  html: string;
  diagramType: DiagramType;
  meta: ArchifyDocument['meta'];
  sourceEvidence: unknown;
}

/** Imperative handle exposed through `ref` and `onReady`. */
export interface ArchifyApi {
  /** The Archify viewer object (`Archify.view`, `Archify.focus`, `Archify.routeProbe`, ...). */
  viewer: Record<string, any>;
  /** Current view hash (`#focus=…`, `#route=…`, `#lens=…`, or empty). */
  getView(): string;
  /** Navigate to a view hash, as following an Archify share link would. */
  setView(hash: string): void;
  maximize(): void;
  restore(): void;
  isMaximized(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  /** Run an export, as choosing it from the Export menu would. */
  export(format: ExportFormat): Promise<unknown>;
  clearFocus(): void;
  /** Resolves once the adaptive reader layout has settled. */
  waitForStableLayout(): Promise<unknown>;
  shadowRoot: ShadowRoot;
}
