import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { ARCHIFY_COMMIT } from '../../scripts/sync-archify.mjs';

export const VARIANTS = ['classic', 'signal-flow', 'blueprint', 'editorial'] as const;
export const THEMES = ['light', 'dark'] as const;
export const REFERENCE_DIR = path.resolve('test-results', 'reference', ARCHIFY_COMMIT.slice(0, 12));

export function checkoutDir() {
  return path.resolve('.archify-cache', ARCHIFY_COMMIT);
}

export function examples(): string[] {
  return fs.readdirSync(path.resolve('demo', 'examples'))
    .filter((file) => file.endsWith('.json'))
    .filter((file) => JSON.parse(fs.readFileSync(path.resolve('demo', 'examples', file), 'utf8')).diagram_type)
    .sort();
}

export function referenceUrl(example: string, variant: string, theme: string, extra = '') {
  return `file://${path.join(REFERENCE_DIR, `${example}.${variant}.html`)}?theme=${theme}${extra}`;
}

export function fixtureUrl(example: string, variant: string, theme: string, extra = '') {
  return `/?fixture=${encodeURIComponent(example)}&variant=${variant}&theme=${theme}${extra}`;
}

/** Wait until fonts are in and the reader layout stops changing. */
export async function settle(page: Page, scope: 'reference' | 'component') {
  if (scope === 'component') {
    await page.waitForFunction(() => Boolean(window.archify));
    await page.evaluate(() => window.archify!.waitForStableLayout());
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(600);
}

// Exact pixel comparison; `bounds` is the box around every differing pixel.
export function diff(a: Buffer, b: Buffer, out?: string) {
  const left = PNG.sync.read(a);
  const right = PNG.sync.read(b);
  if (left.width !== right.width || left.height !== right.height) {
    return { pixels: Number.POSITIVE_INFINITY, ratio: 1, bounds: null, size: `${left.width}x${left.height} vs ${right.width}x${right.height}` };
  }
  const output = new PNG({ width: left.width, height: left.height });
  const pixels = pixelmatch(left.data, right.data, output.data, left.width, left.height, { threshold: 0.1 });
  let bounds: { left: number; top: number; right: number; bottom: number } | null = null;
  if (pixels > 0) {
    // pixelmatch marks differing pixels red (255, 0, 0).
    for (let y = 0; y < left.height; y += 1) {
      for (let x = 0; x < left.width; x += 1) {
        const i = (y * left.width + x) * 4;
        if (output.data[i] !== 255 || output.data[i + 1] !== 0 || output.data[i + 2] !== 0) continue;
        if (!bounds) bounds = { left: x, top: y, right: x, bottom: y };
        else {
          bounds.left = Math.min(bounds.left, x);
          bounds.top = Math.min(bounds.top, y);
          bounds.right = Math.max(bounds.right, x);
          bounds.bottom = Math.max(bounds.bottom, y);
        }
      }
    }
  }
  if (out && pixels > 0) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, PNG.sync.write(output));
    fs.writeFileSync(out.replace(/\.png$/, '.reference.png'), a);
    fs.writeFileSync(out.replace(/\.png$/, '.component.png'), b);
  }
  return { pixels, ratio: pixels / (left.width * left.height), bounds, size: `${left.width}x${left.height}` };
}

type Rect = { x: number; y: number; width: number; height: number };

/** The bottom-right control bar's box on a page (component or reference). */
export async function controlBarRect(page: Page): Promise<Rect | null> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-react-archify-host]');
    const root = host?.shadowRoot ?? document;
    const nav = root.querySelector('.diagram-nav');
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

/**
 * Exact pixels, with one named exception. Standalone, Archify's page content
 * lives in Chrome's root-scroller layer; embedded, it lives in an element
 * scroller's layer, and Chrome snaps the control bar's backdrop-filter layer
 * one device pixel differently in some layouts, so its glyphs rasterize at a
 * different sub-pixel phase. Differences wholly inside that bar, at an
 * identical position on both pages, pass and are annotated on the test.
 */
export function expectParity(result: ReturnType<typeof diff>, label: string, bars: { reference: Rect | null; component: Rect | null }, annotate: (note: string) => void) {
  if (result.pixels === 0) return true;
  const { reference, component } = bars;
  if (!result.bounds || !reference || !component) return false;
  const same = ['x', 'y', 'width', 'height'].every((key) => Math.abs(reference[key as keyof Rect] - component[key as keyof Rect]) < 0.01);
  const inside = result.bounds.left >= reference.x - 1 && result.bounds.right <= reference.x + reference.width + 1
    && result.bounds.top >= reference.y - 1 && result.bounds.bottom <= reference.y + reference.height + 1;
  if (same && inside) {
    annotate(`${label}: ${result.pixels} px differ, all inside the control bar's composited layer (sub-pixel raster phase)`);
    return true;
  }
  return false;
}

// The documented differences: the theme toggle and the style menu are props.
// Hidden before Archify's script runs, so its chrome layout measures the
// toolbar the component shows.
export async function hidePropOwnedChrome(page: Page) {
  await injectEarlyStyle(page, 'html body .toolbar #btn-theme, html body .toolbar .preset-wrap { display: none !important; }');
}

/** Add a stylesheet as soon as <head> exists, ahead of every page script. */
export async function injectEarlyStyle(page: Page, css: string) {
  await page.addInitScript((text) => {
    const attach = () => {
      if (!document.head) return false;
      const style = document.createElement('style');
      style.textContent = text;
      document.head.appendChild(style);
      return true;
    };
    if (attach()) return;
    const observer = new MutationObserver(() => { if (attach()) observer.disconnect(); });
    observer.observe(document, { childList: true, subtree: true });
  }, css);
}
