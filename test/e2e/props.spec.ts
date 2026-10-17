// The component's own surface: props that replace Archify's toolbar controls,
// visibility toggles, URL modes, callbacks, multiple instances, cleanup,
// errors and exports.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { REFERENCE_DIR, diff, fixtureUrl, hidePropOwnedChrome, injectEarlyStyle, referenceUrl, settle } from './support';

test.use({ reducedMotion: 'reduce' });

const EXAMPLE = 'web-app.architecture.json';

async function open(page: Page, query = '', variant = 'classic', theme = 'dark') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixtureUrl(EXAMPLE, variant, theme, query));
  await settle(page, 'component');
  return errors;
}

async function setProps(page: Page, props: Record<string, unknown>, instance = 'a') {
  await page.evaluate(([value, which]) => window.setFixtureProps!(value as never, which as string), [props, instance] as const);
  await page.waitForTimeout(700);
}

async function events(page: Page, type: string) {
  return page.evaluate((kind) => (window.archifyEvents || []).filter((event) => event.type === kind).map((event) => event.value), type);
}

async function compareWithReference(page: Page, variant: string, theme: string, options: { init?: (p: Page) => Promise<void>; act?: (p: Page) => Promise<void> } = {}) {
  const reference = await page.context().newPage();
  await hidePropOwnedChrome(reference);
  if (options.init) await options.init(reference);
  await reference.goto(referenceUrl(EXAMPLE, variant, theme));
  await settle(reference, 'reference');
  if (options.act) await options.act(reference);
  await page.bringToFront();
  const result = diff(await reference.screenshot(), await page.screenshot(), path.resolve('test-results', 'props', `${test.info().title.replace(/[^a-z0-9]+/gi, '-')}.png`));
  await reference.close();
  return result.pixels;
}

const htmlAttr = (page: Page, name: string) => page.evaluate((attribute) => document.querySelector('[data-react-archify-host]')!.shadowRoot!.querySelector('.archify-html')!.getAttribute(attribute), name);

test('variant prop switches the visual preset live', async ({ page }) => {
  const errors = await open(page);
  expect(await htmlAttr(page, 'data-preset')).toBe('classic');
  for (const variant of ['signal-flow', 'blueprint', 'editorial']) {
    await setProps(page, { variant });
    expect(await htmlAttr(page, 'data-preset')).toBe(variant);
    expect(await page.locator('.diagram-container > svg').getAttribute('data-preset')).toBe(variant);
  }
  await setProps(page, { variant: 'blueprint' });
  expect(await compareWithReference(page, 'blueprint', 'dark')).toBe(0);
  expect(errors).toEqual([]);
});

test('variant defaults to the authored preset', async ({ page }) => {
  await page.goto(`/?fixture=${EXAMPLE}&theme=dark`);
  await settle(page, 'component');
  expect(await htmlAttr(page, 'data-preset')).toBe('classic');
});

test('theme prop switches light and dark live', async ({ page }) => {
  await open(page, '', 'classic', 'dark');
  expect(await htmlAttr(page, 'data-theme')).toBe('dark');
  await setProps(page, { theme: 'light' });
  expect(await htmlAttr(page, 'data-theme')).toBe('light');
  expect(await compareWithReference(page, 'classic', 'light')).toBe(0);
  await setProps(page, { theme: 'dark' });
  expect(await htmlAttr(page, 'data-theme')).toBe('dark');
});

test('theme system follows prefers-color-scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, '', 'classic', 'system');
  expect(await htmlAttr(page, 'data-theme')).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  expect(await htmlAttr(page, 'data-theme')).toBe('dark');
});

test('the theme toggle and style menu are not shown, and T/S do nothing', async ({ page }) => {
  await open(page);
  await expect(page.locator('#btn-theme')).toBeHidden();
  await expect(page.locator('#btn-preset')).toBeHidden();
  await page.locator('.header h1').click();
  await page.keyboard.press('t');
  await page.keyboard.press('s');
  await page.waitForTimeout(300);
  expect(await htmlAttr(page, 'data-theme')).toBe('dark');
  expect(await htmlAttr(page, 'data-preset')).toBe('classic');
});

test('showMaximize=false hides the maximize button and disables F', async ({ page }) => {
  await open(page, '&maximize=0');
  await expect(page.locator('#btn-present')).toBeHidden();
  await page.locator('.header h1').click();
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  expect(await htmlAttr(page, 'data-present')).toBeNull();
  expect(await compareWithReference(page, 'classic', 'dark', {
    init: (reference) => injectEarlyStyle(reference, 'html body .toolbar #btn-present { display: none !important; }'),
  })).toBe(0);
  await setProps(page, { showMaximize: true });
  await expect(page.locator('#btn-present')).toBeVisible();
});

test('showExport=false hides the export menu and disables E', async ({ page }) => {
  await open(page, '&export=0');
  await expect(page.locator('#btn-export')).toBeHidden();
  await page.locator('.header h1').click();
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await expect(page.locator('#export-menu')).toBeHidden();
  expect(await compareWithReference(page, 'classic', 'dark', {
    init: (reference) => injectEarlyStyle(reference, 'html body .toolbar #btn-export { display: none !important; }'),
  })).toBe(0);
  await setProps(page, { showExport: true });
  await expect(page.locator('#btn-export')).toBeVisible();
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-menu')).toBeVisible();
});

test('turning showMaximize off while maximized restores the box', async ({ page }) => {
  await open(page, '&offset=1');
  await page.locator('#btn-present').click();
  await page.waitForTimeout(600);
  expect(await htmlAttr(page, 'data-present')).toBe('true');
  await setProps(page, { showMaximize: false });
  expect(await htmlAttr(page, 'data-present')).toBeNull();
  expect(await events(page, 'maximize')).toEqual([true, false]);
});

test('maximize fills the browser window from an embedded box, Escape restores', async ({ page }) => {
  await open(page, '&offset=1');
  const host = page.locator('[data-react-archify-host]');
  const before = (await host.boundingBox())!;
  expect(before.width).toBe(1100);
  await page.locator('#btn-present').click();
  await page.waitForTimeout(800);
  expect(await host.boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  // The stage is what Archify shows in a 1440x900 window.
  expect(await compareWithReference(page, 'classic', 'dark', {
    act: async (reference) => {
      await reference.locator('#btn-present').click();
      await reference.waitForTimeout(800);
    },
  })).toBe(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  expect(await host.boundingBox()).toEqual(before);
  expect(await events(page, 'maximize')).toEqual([true, false]);
});

test('notesPlacement switches between bottom and right live, as the placement button does', async ({ page }) => {
  await open(page);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe('bottom');
  await setProps(page, { notesPlacement: 'right' });
  await page.waitForTimeout(500);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe('true');
  expect(await compareWithReference(page, 'classic', 'dark', {
    act: async (reference) => {
      await reference.locator('#rail-placement').click();
      await reference.mouse.move(0, 0);
      await reference.waitForTimeout(1200);
    },
  })).toBe(0);
  await setProps(page, { notesPlacement: 'bottom' });
  await page.waitForTimeout(500);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe('bottom');
});

test('notesPlacement right starts where Archify starts, and the rail collapses and reopens', async ({ page }) => {
  await open(page, '&notes=right');
  const reference = await page.context().newPage();
  await reference.addInitScript(() => localStorage.setItem('archify-rail-placement', 'right'));
  await reference.goto(referenceUrl(EXAMPLE, 'classic', 'dark'));
  await settle(reference, 'reference');
  const initial = await reference.evaluate(() => document.documentElement.getAttribute('data-reader-rail'));
  await reference.close();
  expect(await htmlAttr(page, 'data-reader-rail')).toBe(initial);
  await page.locator(initial === 'collapsed' ? '#rail-reveal' : '#rail-collapse').click();
  await page.waitForTimeout(500);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe(initial === 'collapsed' ? 'true' : 'collapsed');
  await setProps(page, { notesCollapsed: true });
  await page.waitForTimeout(500);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe('collapsed');
  await setProps(page, { notesCollapsed: false });
  await page.waitForTimeout(500);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe('true');
  await page.locator('#rail-collapse').click();
  await page.waitForTimeout(500);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe('collapsed');
});

test('notesCollapsed=false opens the right rail from the start', async ({ page }) => {
  await open(page, '&notes=right');
  await setProps(page, { notesCollapsed: false });
  await page.waitForTimeout(500);
  expect(await htmlAttr(page, 'data-reader-rail')).toBe('true');
});

test('a narrow box keeps notes off the right rail, as Archify does in a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await open(page, '&notes=right');
  const reference = await page.context().newPage();
  await reference.setViewportSize({ width: 1000, height: 900 });
  await reference.addInitScript(() => localStorage.setItem('archify-rail-placement', 'right'));
  await reference.goto(referenceUrl(EXAMPLE, 'classic', 'dark'));
  await settle(reference, 'reference');
  const expected = await reference.evaluate(() => document.documentElement.getAttribute('data-reader-rail'));
  await reference.close();
  expect(expected).not.toBe('true');
  expect(await htmlAttr(page, 'data-reader-rail')).toBe(expected);
});

test('view state stays private by default and is reported through onViewChange', async ({ page }) => {
  await open(page);
  const url = page.url();
  await page.locator('[data-node-id="api"]').first().click();
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  expect(await events(page, 'view')).toContain('#focus=api');
  expect(await page.evaluate(() => window.archify!.getView())).toBe('#focus=api');
});

test('controlled view drives focus and routes', async ({ page }) => {
  await open(page);
  await setProps(page, { view: '#focus=db' });
  await expect(page.locator('#focus-label')).toHaveText('PostgreSQL');
  await setProps(page, { view: '#route=users~db' });
  await expect(page.locator('#route-probe')).toBeVisible();
  await expect(page.locator('#route-probe-path')).toContainText('PostgreSQL');
});

test('urlState mirrors view state into the page URL and reads it on load', async ({ page }) => {
  await open(page, '&url=1');
  await page.locator('[data-node-id="api"]').first().click();
  await page.waitForTimeout(500);
  expect(new URL(page.url()).hash).toBe('#focus=api');
  await page.reload();
  await settle(page, 'component');
  await expect(page.locator('#focus-label')).toHaveText('API Server');
});

test('two instances on one page are independent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?fixture=${EXAMPLE}&theme=dark&twice=1`);
  await page.waitForFunction(() => Object.keys(window.archifyApis || {}).length === 2);
  const a = page.locator('.fixture-a');
  const b = page.locator('.fixture-b');
  await b.locator('[data-node-id="db"]').first().click();
  await page.waitForTimeout(500);
  await expect(b.locator('#focus-label')).toHaveText('PostgreSQL');
  await expect(a.locator('#focus-chip')).toBeHidden();
  // Keyboard goes to the instance last used.
  await page.keyboard.press('Escape');
  await b.locator('.header h1').click();
  await page.keyboard.press('r');
  await page.waitForTimeout(400);
  await expect(b.locator('#route-probe')).toBeVisible();
  await expect(a.locator('#route-probe')).toBeHidden();
  await setProps(page, { variant: 'editorial' }, 'b');
  expect(await page.evaluate(() => document.querySelector('.fixture-a [data-react-archify-host]')!.shadowRoot!.querySelector('.archify-html')!.getAttribute('data-preset'))).toBe('classic');
  expect(errors).toEqual([]);
});

test('keys typed into the host page never reach the diagram', async ({ page }) => {
  await open(page, '&offset=1');
  await page.locator('.header h1').click();
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'host-input';
    document.body.prepend(input);
  });
  await page.locator('#host-input').click();
  await page.keyboard.type('rm=');
  await page.waitForTimeout(300);
  await expect(page.locator('#route-probe')).toBeHidden();
  await expect(page.locator('#host-input')).toHaveValue('rm=');
});

test('keyboardShortcuts=false disables single-key shortcuts but not typing in the finder', async ({ page }) => {
  await open(page);
  await setProps(page, { keyboardShortcuts: false });
  await page.locator('.header h1').click();
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  await expect(page.locator('#route-probe')).toBeHidden();
  await page.locator('#btn-node-finder').click();
  await page.keyboard.type('post');
  await expect(page.locator('#node-finder-input')).toHaveValue('post');
  await expect(page.locator('#node-finder-results')).toContainText('PostgreSQL');
});

test('unmount removes the viewer and its page-level listeners and styles', async ({ page }) => {
  const errors = await open(page);
  await setProps(page, { mounted: false });
  expect(await page.locator('[data-react-archify-host]').count()).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll('style[data-react-archify]').length)).toBe(0);
  await page.keyboard.press('r');
  await page.mouse.click(10, 10);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(500);
  await setProps(page, { mounted: true });
  await settle(page, 'component');
  await expect(page.locator('.diagram-container > svg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid JSON reports diagnostics', async ({ page }) => {
  await page.goto(`/?fixture=${EXAMPLE}&json=${encodeURIComponent('{"schema_version": 1,')}`);
  await expect(page.getByRole('alert')).toContainText('Input JSON could not be parsed');
  expect((await events(page, 'error')).length).toBe(1);
});

test('a document Archify rejects shows its validation diagnostics', async ({ page }) => {
  const bad = JSON.stringify({ schema_version: 1, diagram_type: 'architecture', meta: { title: 'Bad' }, components: [{ id: 'a', type: 'nope', label: 'A' }] });
  await page.goto(`/?fixture=${EXAMPLE}&json=${encodeURIComponent(bad)}`);
  await expect(page.getByRole('alert')).toContainText('Archify could not render this diagram');
  await expect(page.getByRole('alert')).toContainText('/components/0/type');
});

test('html input mounts a CLI-built artifact identically', async ({ page }) => {
  await open(page);
  const html = fs.readFileSync(path.join(REFERENCE_DIR, `${EXAMPLE}.classic.html`), 'utf8');
  await setProps(page, { diagram: undefined, html });
  await page.waitForFunction(() => (window.archifyEvents || []).filter((event) => event.type === 'ready').length >= 2);
  await settle(page, 'component');
  expect(await compareWithReference(page, 'classic', 'dark')).toBe(0);
});

for (const format of ['svg', 'svg-light', 'svg-dark']) {
  test(`export ${format} is byte-identical to Archify's`, async ({ page }) => {
    await open(page);
    const reference = await page.context().newPage();
    await reference.goto(referenceUrl(EXAMPLE, 'classic', 'dark'));
    await settle(reference, 'reference');
    const exportFrom = async (target: Page) => {
      await target.locator('#btn-export').click();
      const [download] = await Promise.all([target.waitForEvent('download'), target.locator(`#export-menu button[data-format="${format}"]`).click()]);
      return { name: download.suggestedFilename(), body: fs.readFileSync((await download.path())!, 'utf8') };
    };
    const expected = await exportFrom(reference);
    const actual = await exportFrom(page);
    expect(actual.name).toBe(expected.name);
    expect(actual.body).toBe(expected.body);
  });
}

test('export png matches Archify pixel for pixel', async ({ page }) => {
  await open(page);
  const reference = await page.context().newPage();
  await reference.goto(referenceUrl(EXAMPLE, 'classic', 'dark'));
  await settle(reference, 'reference');
  const exportFrom = async (target: Page) => {
    await target.locator('#btn-export').click();
    const [download] = await Promise.all([target.waitForEvent('download'), target.locator('#export-menu button[data-format="png"]').click()]);
    return fs.readFileSync((await download.path())!);
  };
  const result = diff(await exportFrom(reference), await exportFrom(page), path.resolve('test-results', 'props', 'export-png.png'));
  expect(result.pixels).toBe(0);
});

for (const [action, setup] of [
  ['route-share-card', async (target: Page) => {
    await target.locator('#btn-route-probe').click();
    await target.locator('[data-node-id="users"]').first().click();
    await target.locator('[data-node-id="db"]').first().click();
  }],
  ['reach-share-card', async (target: Page) => {
    await target.locator('[data-node-id="cdn"]').first().click();
    await target.locator('#btn-reach-downstream').click();
  }],
] as const) {
  test(`export ${action} matches Archify pixel for pixel`, async ({ page }) => {
    await open(page);
    const reference = await page.context().newPage();
    await reference.goto(referenceUrl(EXAMPLE, 'classic', 'dark'));
    await settle(reference, 'reference');
    const exportFrom = async (target: Page) => {
      await target.bringToFront();
      await setup(target);
      await target.waitForTimeout(600);
      await target.locator('#btn-export').click();
      const [download] = await Promise.all([target.waitForEvent('download'), target.locator(`#export-menu button[data-action="${action}"]`).click()]);
      return { name: download.suggestedFilename(), body: fs.readFileSync((await download.path())!) };
    };
    const expected = await exportFrom(reference);
    const actual = await exportFrom(page);
    expect(actual.name).toBe(expected.name);
    expect(diff(expected.body, actual.body, path.resolve('test-results', 'props', `${action}.png`)).pixels).toBe(0);
  });
}
