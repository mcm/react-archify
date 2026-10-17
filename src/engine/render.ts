// Runs Archify's own renderers in the browser. Each renderer module validates
// the document, lays it out and fills the template exactly as the CLI does;
// render() returns the HTML the CLI would have written to disk.

import { setBrowserBrandFetch } from '../vendor/archify/renderers/shared/brand-marks.mjs';
import { setBrowserInput } from '../vendor/archify/renderers/shared/cli.mjs';
import processShim from '../shims/process.js';
import { SHELL_TEMPLATE } from '../vendor/archify/template.js';
import type { ArchifyDiagnostic, ArchifyDocument, DiagramType, RenderOptions, RenderResult } from '../types';

type RendererModule = { render(): Promise<RenderResult> };

const RENDERERS: Record<DiagramType, () => Promise<RendererModule>> = {
  architecture: () => import('../vendor/archify/renderers/architecture/render-architecture.mjs'),
  workflow: () => import('../vendor/archify/renderers/workflow/render-workflow.mjs'),
  sequence: () => import('../vendor/archify/renderers/sequence/render-sequence.mjs'),
  dataflow: () => import('../vendor/archify/renderers/dataflow/render-dataflow.mjs'),
  lifecycle: () => import('../vendor/archify/renderers/lifecycle/render-lifecycle.mjs'),
  erd: () => import('../vendor/archify/renderers/erd/render-erd.mjs'),
  class: () => import('../vendor/archify/renderers/class/render-class.mjs'),
  tree: () => import('../vendor/archify/renderers/tree/render-tree.mjs'),
  timeline: () => import('../vendor/archify/renderers/timeline/render-timeline.mjs'),
  waterfall: () => import('../vendor/archify/renderers/waterfall/render-waterfall.mjs'),
};

export const DIAGRAM_TYPES = Object.keys(RENDERERS) as DiagramType[];

/** A document Archify rejected, with the renderer's structured diagnostics. */
export class ArchifyRenderError extends Error {
  readonly diagnostics: ArchifyDiagnostic[];

  constructor(message: string, diagnostics: ArchifyDiagnostic[] = [], options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ArchifyRenderError';
    this.diagnostics = diagnostics;
  }
}

// The renderers share module state (staged input, process shim, diagnostics),
// so renders run one at a time.
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function parseInput(diagram: ArchifyDocument | string): ArchifyDocument {
  if (typeof diagram !== 'string') return diagram;
  try {
    return JSON.parse(diagram);
  } catch (error) {
    const message = `Input JSON could not be parsed: ${(error as Error).message}`;
    throw new ArchifyRenderError(message, [{ code: 'input/json-parse', message }], { cause: error });
  }
}

async function renderWith(template: string, diagram: ArchifyDocument | string, options: RenderOptions): Promise<RenderResult> {
  const document = parseInput(diagram);
  const type = document?.diagram_type;
  const load = type ? RENDERERS[type] : undefined;
  if (!load) {
    const message = `Unknown diagram_type ${JSON.stringify(type)}; expected one of ${DIAGRAM_TYPES.join(', ')}.`;
    throw new ArchifyRenderError(message, [{ code: 'input/diagram-type', message }]);
  }
  const renderer = await load();
  return serialize(async () => {
    const env = processShim.env as Record<string, string | undefined>;
    const previousProfile = env.ARCHIFY_QUALITY_PROFILE;
    if (options.qualityProfile) env.ARCHIFY_QUALITY_PROFILE = options.qualityProfile;
    else delete env.ARCHIFY_QUALITY_PROFILE;
    processShim.argv = ['node', `render-${type}.mjs`];
    setBrowserInput({ diagram: document, template });
    setBrowserBrandFetch(options.brandFetch === undefined ? globalThis.fetch?.bind(globalThis) : options.brandFetch);
    try {
      return await renderer.render();
    } catch (error) {
      const diagnostics = (error as { archifyDiagnostics?: ArchifyDiagnostic[] })?.archifyDiagnostics;
      if (diagnostics) throw new ArchifyRenderError((error as Error).message, diagnostics, { cause: error });
      throw error;
    } finally {
      setBrowserInput(null);
      setBrowserBrandFetch(null);
      if (previousProfile === undefined) delete env.ARCHIFY_QUALITY_PROFILE;
      else env.ARCHIFY_QUALITY_PROFILE = previousProfile;
    }
  });
}

/**
 * Validate and lay out an Archify document. The result's HTML is the viewer
 * shell the component mounts; it carries no script or stylesheet.
 */
export function renderArchify(diagram: ArchifyDocument | string, options: RenderOptions = {}): Promise<RenderResult> {
  return renderWith(SHELL_TEMPLATE, diagram, options);
}

/**
 * Build the standalone Archify HTML file for a document, byte-identical to
 * `archify render`'s output.
 */
export async function renderArchifyHtml(diagram: ArchifyDocument | string, options: RenderOptions = {}): Promise<string> {
  const { FULL_TEMPLATE } = await import('../vendor/archify/full-template.js');
  return (await renderWith(FULL_TEMPLATE, diagram, options)).html;
}
