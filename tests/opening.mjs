import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/squeeze-before.png' });
  await page.getByRole('button', { name: 'Open the juicer' }).click();
  await page.waitForSelector('.stage--open');
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => ({
    stage: document.querySelector('.hero')?.className,
    inputVisible: getComputedStyle(document.querySelector('.squeeze-form')).opacity,
    topTransform: getComputedStyle(document.querySelector('.asset--top')).transform,
    bottomTransform: getComputedStyle(document.querySelector('.asset--bottom')).transform,
    inputFocused: document.activeElement?.id,
  }));

  console.log(JSON.stringify(state, null, 2));
  assert.match(state.stage ?? '', /stage--open/);
  assert.equal(state.inputVisible, '1');
  assert.equal(state.inputFocused, 'idea-url');
  assert.notEqual(state.topTransform, 'none');
  assert.notEqual(state.bottomTransform, 'none');
  await page.screenshot({ path: '/tmp/squeeze-after.png' });
} finally {
  await browser.close();
}
