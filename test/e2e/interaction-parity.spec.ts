// Interaction parity: the same reader actions on standalone Archify and on
// the component must leave the same pixels on screen. Selectors pierce the
// component's open shadow root, so every scenario drives both identically.
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { diff, hidePropOwnedChrome, fixtureUrl, referenceUrl, settle } from './support';


interface Scenario {
  name: string;
  example?: string;
  variant?: string;
  theme?: string;
  /** Extra query for both pages (reference reads ?..., component reads view etc). */
  referenceHash?: string;
  componentQuery?: string;
  referenceStorage?: Record<string, string>;
  viewport?: { width: number; height: number };
  act(page: Page): Promise<void>;
}

const pause = (page: Page, ms = 700) => page.waitForTimeout(ms);

// A click on the page header gives the diagram keyboard focus in both worlds.
async function engage(page: Page) {
  await page.locator('.header h1').click();
}

const SCENARIOS: Scenario[] = [
  { name: 'focus a node', act: async (page) => { await page.locator('[data-node-id="api"]').first().click(); await pause(page); } },
  { name: 'hover a node', act: async (page) => { await page.locator('[data-node-id="cache"]').first().hover(); await pause(page); } },
  { name: 'downstream reach', act: async (page) => {
    await page.locator('[data-node-id="cdn"]').first().click();
    await page.locator('#btn-reach-downstream').click();
    await pause(page);
  } },
  { name: 'route between two nodes', act: async (page) => {
    await page.locator('#btn-route-probe').click();
    await pause(page, 300);
    await page.locator('[data-node-id="users"]').first().click();
    await page.locator('[data-node-id="db"]').first().click();
    await pause(page);
  } },
  { name: 'route panel open', act: async (page) => { await page.locator('#btn-route-probe').click(); await pause(page); } },
  { name: 'lens panel open', act: async (page) => { await page.locator('#btn-semantic-lens').click(); await pause(page); } },
  { name: 'lens on one kind', act: async (page) => {
    await page.locator('#btn-semantic-lens').click();
    await pause(page, 300);
    await page.locator('#semantic-lens-kinds button').first().click();
    await pause(page);
  } },
  { name: 'zoom in twice', act: async (page) => {
    await page.locator('[data-view="in"]').click();
    await pause(page, 300);
    await page.locator('[data-view="in"]').click();
    await pause(page);
  } },
  { name: 'zoom out then reset', act: async (page) => {
    await page.locator('[data-view="out"]').click();
    await pause(page, 300);
    await page.locator('[data-view="reset"]').click();
    await pause(page);
  } },
  { name: 'pan a zoomed diagram', act: async (page) => {
    await page.locator('[data-view="in"]').click();
    await pause(page);
    const box = (await page.locator('.diagram-container').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 180, box.y + box.height / 2 - 90, { steps: 8 });
    await page.mouse.up();
    await pause(page);
  } },
  { name: 'node finder search', act: async (page) => {
    await page.locator('#btn-node-finder').click();
    await pause(page, 300);
    await page.keyboard.type('post');
    await pause(page);
  } },
  { name: 'guide panel', act: async (page) => { await page.locator('#btn-diagram-guide').click(); await pause(page); } },
  { name: 'export menu', act: async (page) => { await page.locator('#btn-export').click(); await pause(page); } },
  { name: 'maximize', act: async (page) => { await page.locator('#btn-present').click(); await pause(page, 1000); } },
  { name: 'maximize then escape', act: async (page) => {
    await page.locator('#btn-present').click();
    await pause(page, 600);
    await page.keyboard.press('Escape');
    await pause(page, 1000);
  } },
  { name: 'keyboard: overview map (M)', act: async (page) => { await engage(page); await page.keyboard.press('m'); await pause(page); } },
  { name: 'keyboard: route (R)', act: async (page) => { await engage(page); await page.keyboard.press('r'); await pause(page); } },
  { name: 'keyboard: zoom (+)', act: async (page) => { await engage(page); await page.keyboard.press('='); await pause(page); } },
  { name: 'notes moved to the right rail', act: async (page) => { await page.locator('#rail-placement').click(); await pause(page, 1000); } },
  { name: 'notes right then collapsed', act: async (page) => {
    await page.locator('#rail-placement').click();
    await pause(page, 800);
    await page.locator('#rail-collapse').click();
    await pause(page, 1000);
  } },
  { name: 'deep link focus', referenceHash: '#focus=api', componentQuery: '&view=%23focus%3Dapi', act: async (page) => { await pause(page); } },
  { name: 'deep link route', referenceHash: '#route=users~db', componentQuery: '&view=%23route%3Dusers~db', act: async (page) => { await pause(page); } },
  { name: 'notes right by preference', referenceStorage: { 'archify-rail-placement': 'right' }, componentQuery: '&notes=right', act: async (page) => { await pause(page); } },
  { name: 'sequence: focus participant', example: 'cache-miss-request.sequence.json', act: async (page) => {
    await page.locator('[data-node-id]').nth(1).click();
    await pause(page);
  } },
  { name: 'workflow: lens', example: 'agent-tool-call.workflow.json', variant: 'signal-flow', act: async (page) => {
    await page.locator('#btn-semantic-lens').click();
    await pause(page);
  } },
  { name: 'tree: collapse a branch', example: 'payment-platform.tree.json', act: async (page) => {
    await page.locator('[data-tree-toggle], .tree-toggle, [data-branch-toggle]').first().click();
    await pause(page, 1000);
  } },
  { name: 'erd: focus entity', example: 'orders.erd.json', theme: 'light', act: async (page) => {
    await page.locator('[data-node-id]').first().click();
    await pause(page);
  } },
  { name: 'motion live', act: async (page) => { await page.locator('#btn-motion').click(); await pause(page, 1000); } },
  { name: 'route journey step', act: async (page) => {
    await page.locator('#btn-route-probe').click();
    await pause(page, 300);
    await page.locator('[data-node-id="users"]').first().click();
    await page.locator('[data-node-id="db"]').first().click();
    await pause(page, 500);
    await page.locator('#route-journey-next').click();
    await pause(page, 500);
    await page.locator('#route-journey-next').click();
    await pause(page);
  } },
  { name: 'relationship list', act: async (page) => {
    await page.locator('[data-node-id="api"]').first().click();
    await pause(page, 300);
    await page.locator('#btn-focus-relations').click();
    await pause(page);
  } },
  { name: 'upstream reach', act: async (page) => {
    await page.locator('[data-node-id="db"]').first().click();
    await page.locator('#btn-reach-upstream').click();
    await pause(page);
  } },
  { name: 'guide action opens the map', act: async (page) => {
    await page.locator('#btn-diagram-guide').click();
    await pause(page, 300);
    await page.locator('[data-guide-action="map"]').click();
    await pause(page);
  } },
  { name: 'overview map navigation', act: async (page) => {
    await page.locator('[data-view="in"]').click();
    await pause(page, 300);
    await page.locator('[data-view="in"]').click();
    await pause(page, 300);
    await page.locator('#btn-overview-map').click();
    await pause(page, 300);
    const surface = (await page.locator('#overview-map-surface').boundingBox())!;
    await page.mouse.click(surface.x + surface.width * 0.8, surface.y + surface.height * 0.7);
    await pause(page);
  } },
  { name: 'tree: expand all', example: 'payment-platform.tree.json', act: async (page) => {
    await page.locator('[data-tree-toggle]').first().click();
    await pause(page, 500);
    await page.locator('[data-tree-expand-all]').first().click();
    await pause(page, 1000);
  } },
  { name: 'localized workflow (meta.locale)', example: 'holiday-planning.workflow.json', theme: 'light', act: async (page) => { await page.locator('#btn-diagram-guide').click(); await pause(page); } },
  { name: 'light theme focus', theme: 'light', variant: 'editorial', act: async (page) => { await page.locator('[data-node-id="lb"]').first().click(); await pause(page); } },
  { name: 'mobile viewport', viewport: { width: 390, height: 844 }, act: async (page) => { await pause(page); } },
  { name: 'mobile viewport focus', viewport: { width: 390, height: 844 }, act: async (page) => { await page.locator('[data-node-id="api"]').first().click(); await pause(page); } },
  { name: 'narrow viewport', viewport: { width: 700, height: 900 }, act: async (page) => { await pause(page); } },
  { name: 'narrow viewport export menu', viewport: { width: 700, height: 900 }, act: async (page) => { await page.locator('#btn-export').click(); await pause(page); } },
];

test.use({ reducedMotion: 'reduce' });

for (const scenario of SCENARIOS) {
  test(scenario.name, async ({ browser }) => {
    const example = scenario.example ?? 'web-app.architecture.json';
    const variant = scenario.variant ?? 'classic';
    const theme = scenario.theme ?? 'dark';
    const viewport = scenario.viewport ?? { width: 1440, height: 900 };
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const reference = await context.newPage();
    const component = await context.newPage();
    if (scenario.referenceStorage) {
      await reference.addInitScript((entries) => {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      }, scenario.referenceStorage);
    }
    await hidePropOwnedChrome(reference);
    await reference.goto(referenceUrl(example, variant, theme) + (scenario.referenceHash ?? ''));
        await component.goto(fixtureUrl(example, variant, theme, scenario.componentQuery ?? ''));
    await settle(reference, 'reference');
    await settle(component, 'component');
    await scenario.act(reference);
    await scenario.act(component);
    const slug = scenario.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const result = diff(await reference.screenshot(), await component.screenshot(), path.resolve('test-results', 'interaction', `${slug}.png`));
    await context.close();
    expect(result.pixels, `${scenario.name} differs (${result.size})`).toBe(0);
  });
}
