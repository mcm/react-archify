// Visual parity: the component at a given box size must paint the same pixels
// as the standalone Archify artifact in a window of that size, for every
// example, visual preset and theme — at the top and scrolled to the end.
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { THEMES, VARIANTS, diff, examples, fixtureUrl, referenceUrl, settle } from './support';

const ONLY = process.env.PARITY_ONLY;
const cases = examples().filter((example) => !ONLY || example.includes(ONLY));

test.use({ reducedMotion: 'reduce' });

async function scrollToEnd(page: Page, scope: 'reference' | 'component') {
  await page.evaluate((which) => {
    if (which === 'reference') {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return;
    }
    const host = document.querySelector('[data-react-archify-host]')!;
    const scroller = host.shadowRoot!.querySelector('.archify-scroller')!;
    scroller.scrollTop = scroller.scrollHeight;
  }, scope);
  await page.waitForTimeout(400);
}

for (const example of cases) {
  for (const variant of VARIANTS) {
    for (const theme of THEMES) {
      test(`${example} · ${variant} · ${theme}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        const reference = await context.newPage();
        const component = await context.newPage();
        await reference.goto(referenceUrl(example, variant, theme));
        await component.goto(fixtureUrl(example, variant, theme));
        await settle(reference, 'reference');
        await settle(component, 'component');
        const name = `${example}.${variant}.${theme}`;
        const out = (suffix: string) => path.resolve('test-results', 'parity', `${name}.${suffix}.png`);
        const top = diff(await reference.screenshot(), await component.screenshot(), out('top'));
        await scrollToEnd(reference, 'reference');
        await scrollToEnd(component, 'component');
        const end = diff(await reference.screenshot(), await component.screenshot(), out('end'));
        await context.close();
        expect.soft(top.pixels, `top of ${name} differs (${top.size})`).toBe(0);
        expect.soft(end.pixels, `end of ${name} differs (${end.size})`).toBe(0);
      });
    }
  }
}
