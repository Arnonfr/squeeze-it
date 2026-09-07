import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  let submittedUrl = '';
  await page.route('**/api/analyze', async (route) => {
    submittedUrl = route.request().postDataJSON().url;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      siteName: 'Example', siteSummary: 'An example product.', coreValue: 'A clear value loop.', targetUser: 'Early users',
      observedFeatures: ['Core flow'], assumptions: ['Demand exists'], scannedUrl: submittedUrl, model: 'test-model',
      mvp: { oneLine: 'Test the core loop.', mustHave: ['Core flow'], cut: ['Everything else'], buildOrder: ['Build the loop'], successMetric: 'One successful use' },
    }) });
  });
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/squeeze-before.png' });
  await page.getByRole('button', { name: 'Open the juicer' }).hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.hover-hint')).opacity === '1');
  assert.equal(await page.locator('.asset--top').evaluate((node) => getComputedStyle(node).opacity), '1');
  await page.screenshot({ path: '/tmp/squeeze-hover.png' });
  await page.getByRole('button', { name: 'Open the juicer' }).click();
  await page.waitForSelector('.stage--open');
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => ({
    stage: document.querySelector('.hero')?.className,
    inputVisible: getComputedStyle(document.querySelector('.squeeze-form')).opacity,
    topTransform: getComputedStyle(document.querySelector('.asset--top')).transform,
    bottomTransform: getComputedStyle(document.querySelector('.asset--bottom')).transform,
    cylinderOpacity: getComputedStyle(document.querySelector('.cylinder')).opacity,
    inputBackground: getComputedStyle(document.querySelector('.input-row')).backgroundColor,
    inputFocused: document.activeElement?.id,
  }));

  console.log(JSON.stringify(state, null, 2));
  assert.match(state.stage ?? '', /stage--open/);
  assert.equal(state.inputVisible, '1');
  assert.equal(state.inputFocused, 'idea-url');
  assert.equal(state.cylinderOpacity, '0');
  assert.equal(state.inputBackground, 'rgba(0, 0, 0, 0)');
  assert.notEqual(state.topTransform, 'none');
  assert.notEqual(state.bottomTransform, 'none');
  await page.screenshot({ path: '/tmp/squeeze-after.png' });
  await page.locator('#idea-url').fill('example.com');
  await page.locator('#idea-url').press('Enter');
  await page.waitForSelector('.stage--done');
  assert.equal(submittedUrl, 'https://example.com');
  await page.getByRole('button', { name: 'Close and return' }).click();
  await page.waitForSelector('.stage--closed');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.squeeze-form')).opacity === '0');
} finally {
  await browser.close();
}
