# react-archify

A React 19 component that renders [Archify](https://github.com/tt-a1i/archify)
diagrams with the complete Archify viewer. Give it any Archify JSON document
and you get the same pixels and the same interactions that a standalone
Archify artifact shows.

```tsx
import { ArchifyDiagram } from 'react-archify';
import webApp from './web-app.architecture.json';

export function Architecture() {
  return (
    <ArchifyDiagram
      diagram={webApp}
      variant="blueprint"
      theme="dark"
      notesPlacement="right"
      style={{ height: 800 }}
    />
  );
}
```

## What you get

Everything the Archify 3.1.0 viewer does, for all ten diagram types
(architecture, workflow, sequence, dataflow, lifecycle, ERD, class, tree,
timeline, waterfall):

- **All four visual presets**: Classic, Signal Flow, Blueprint and Editorial,
  in light and dark.
- **The legend**, with per-kind counts, and Archify's adaptive reader layout.
- **The bottom-right controls**: Route (path finding and Route Journey
  playback), Map (overview radar), Lens (semantic kind comparison), node
  finder, guide, and zoom out / reset / in with pan.
- **Notes & Index**: summary cards and the node index, on the right rail
  (collapsible) or below the diagram.
- Node focus with the semantic passport, upstream/downstream reach,
  relationship lens, hover intent traces, tree branch expand/collapse, ambient
  motion (Still/Live), the maximize stage, the Export menu (SVG, light/dark SVG,
  PNG, JPEG, WebP, WebM, share cards, copy), share links, keyboard shortcuts,
  and locales (`meta.locale`).

Compared with a standalone Archify artifact, a few things differ, as requested:

| Archify viewer | react-archify |
|---|---|
| Style dropdown | `variant` prop |
| Theme toggle | `theme` prop |
| Maximize button | shown unless `showMaximize={false}` |
| Export menu | shown unless `showExport={false}` |

## Props

| Prop | Type | Default | |
|---|---|---|---|
| `diagram` | `ArchifyDocument \| string` | — | Archify JSON (object or text), any diagram type. |
| `html` | `string` | — | A finished Archify HTML artifact (for example `archify render` output). Used when `diagram` is not set. |
| `variant` | `'classic' \| 'signal-flow' \| 'blueprint' \| 'editorial'` | `meta.visual_preset`, else `classic` | Visual preset. Updates live. |
| `theme` | `'light' \| 'dark' \| 'system'` | `'system'` | Color scheme. `system` follows `prefers-color-scheme`. Updates live. |
| `showMaximize` | `boolean` | `true` | Show the maximize (presentation stage) button. `F` follows it. |
| `showExport` | `boolean` | `true` | Show the Export menu. `E` follows it. |
| `notesPlacement` | `'right' \| 'bottom'` | `'bottom'` | Where Notes & Index sits. The right rail needs a box at least 1280px wide, as in Archify; narrower boxes keep it below. |
| `notesCollapsed` | `boolean` | — | Collapse or expand the right rail. Leave it unset to let Archify decide from the available width. |
| `urlState` | `boolean` | `false` | Mirror view state (`#focus=…`, `#route=…`, `#lens=…`, `?present=1`) into the page URL, as standalone Archify does. |
| `view` | `string` | — | Controlled view hash, such as `#focus=api` or `#route=web~db`. |
| `defaultView` | `string` | — | Initial view hash. |
| `onViewChange` | `(view: string) => void` | — | Called when the reader changes focus, route, lens or reach. |
| `onMaximizeChange` | `(maximized: boolean) => void` | — | |
| `keyboardShortcuts` | `boolean` | `true` | Archify's single-key shortcuts. See [Keyboard](#keyboard). |
| `persistPreferences` | `boolean` | `false` | Keep reader preferences (motion, rail collapse) in `localStorage` across diagrams, as Archify does. |
| `qualityProfile` | `'standard' \| 'showcase'` | from `meta` | Layout quality gates, like `archify --quality`. |
| `brandFetch` | `typeof fetch \| null` | `fetch` | Used to verify digest-pinned remote brand marks. |
| `onRender` | `(result: RenderResult) => void` | — | |
| `onReady` | `(api: ArchifyApi) => void` | — | |
| `onError` | `(error: Error) => void` | — | Archify rejections are `ArchifyRenderError` with `diagnostics`. |
| `fallback` | `ReactNode` | — | Shown while the document renders. |
| `errorFallback` | `ReactNode \| (error) => ReactNode` | Archify diagnostics | |
| `ref` | `Ref<ArchifyApi>` | — | Imperative handle. |
| `className`, `style`, `id` | | | Applied to the outer box. |

### Sizing

The component is a box, and Archify treats that box as its browser window.
The adaptive reader layout, the right rail threshold, the maximize stage and
the narrow-screen layouts all measure the box. Size it the way you would a
canvas. It defaults to `width: 100%; height: 720px`, and `className` or `style`
override that. Content that is taller than the box scrolls inside it, the way
an Archify page scrolls in a window.

Maximize puts the box in the top layer over the whole window, and Escape
restores it.

### Keyboard

Shortcuts work while focus is inside the diagram. When nothing on the page
has focus, keys go to the diagram the reader last clicked, so several diagrams
on one page never react together, and typing into your page's inputs never
triggers them. `T` (theme) and `S` (style) are disabled because those settings
are props now.

### Imperative API

```ts
interface ArchifyApi {
  viewer: Record<string, any>;     // Archify's own object: view, focus, routeProbe, semanticLens, radar, ...
  getView(): string;
  setView(hash: string): void;
  maximize(): void;
  restore(): void;
  isMaximized(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  export(format: 'svg' | 'svg-light' | 'svg-dark' | 'png' | 'jpeg' | 'webp' | 'webm'): Promise<unknown>;
  clearFocus(): void;
  waitForStableLayout(): Promise<unknown>;
  shadowRoot: ShadowRoot;
}
```

### Rendering without the component

```ts
import { renderArchify, renderArchifyHtml, ArchifyRenderError } from 'react-archify';

await renderArchifyHtml(doc);   // the standalone HTML file, byte-identical to `archify render`
await renderArchify(doc);       // validation + layout only; what the component mounts
```

## How it works

Rather than re-implementing Archify, react-archify runs Archify's own code.

- **Renderers.** `scripts/sync-archify.mjs` vendors Archify at a pinned
  commit. It wraps each of the ten CLI renderers into a `render()` function,
  points their `node:*` imports at small browser shims, and bundles the locale
  catalogs. A unit test renders every Archify example and checks that the HTML
  is byte-identical to the CLI's output.
- **Viewer.** The viewer's markup, stylesheet and script come straight from
  Archify's template. The component mounts them in a shadow root. The script
  runs against facades for `document`, `window`, `location`, `history` and
  `localStorage` that are scoped to the component: the box acts as the window,
  the shadow root acts as the document, and the URL and storage are private
  unless you opt in. The stylesheet's `html`/`body`/`:root` selectors map onto
  wrapper elements, viewport units and media queries map onto container
  units and container queries, and element rects, screen matrices and pointer
  coordinates are re-based on the box. Listeners, timers and observers are
  tracked and released on unmount.

Each Archify element keeps its ID inside the shadow root. Several diagrams on
one page therefore never collide, and the page's CSS cannot reach them.

### Parity tests

`npm run test:e2e` builds reference artifacts with the Archify CLI and
compares them with the component, pixel by pixel:

- all 25 Archify examples × 4 variants × 2 themes, at the top and scrolled to
  the end, in a 1440×900 window;
- a component box embedded at an offset in a scrolling page, compared with
  Archify in a window the size of the box;
- reader interactions on both (focus, hover, reach, routes, lens, zoom, pan,
  finder, guide, export menu, maximize, keyboard shortcuts, rail placement and
  collapse, deep links, narrow layouts);
- byte-identical SVG exports and pixel-identical PNG exports;
- the props: live variant, theme and notes changes, the visibility toggles,
  URL modes, controlled views, two instances on one page, unmount cleanup,
  errors, and `html` input.

## Limits

- **Repository source evidence.** Documents that cite repository sources
  (`meta.repository` plus `sources`) need a local Git checkout to verify, which
  a browser cannot provide. Render them with the Archify CLI
  (`--repo-root`) and pass the result as `html`.
- **Remote brand marks.** Built-in brand IDs need no network. Digest-pinned
  remote marks are re-fetched to verify them, as the CLI does. Most sites block
  cross-origin requests, so supply a proxying `brandFetch` or pass CLI output
  as `html`.
- **Server rendering.** The component renders an empty box on the server and
  mounts the viewer on the client.

## Development

```sh
npm install
npm run sync:archify   # re-vendor Archify (pinned in scripts/sync-archify.mjs)
npm run dev            # playground at http://localhost:5173
npm test               # renderer byte-parity (node --test)
npm run test:e2e       # visual/interaction parity (Playwright)
npm run build          # library build to dist/
```

Archify is MIT-licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
