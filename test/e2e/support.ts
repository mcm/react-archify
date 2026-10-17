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

export function diff(a: Buffer, b: Buffer, out?: string) {
  const left = PNG.sync.read(a);
  const right = PNG.sync.read(b);
  if (left.width !== right.width || left.height !== right.height) {
    return { pixels: Number.POSITIVE_INFINITY, ratio: 1, size: `${left.width}x${left.height} vs ${right.width}x${right.height}` };
  }
  const output = new PNG({ width: left.width, height: left.height });
  const pixels = pixelmatch(left.data, right.data, output.data, left.width, left.height, { threshold: 0.1 });
  if (out && pixels > 0) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, PNG.sync.write(output));
    fs.writeFileSync(out.replace(/\.png$/, '.reference.png'), a);
    fs.writeFileSync(out.replace(/\.png$/, '.component.png'), b);
  }
  return { pixels, ratio: pixels / (left.width * left.height), size: `${left.width}x${left.height}` };
}
