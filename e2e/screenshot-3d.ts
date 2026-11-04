import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto('http://localhost:5173/pattern/tee');
await page.waitForTimeout(800);
await page.getByTestId('toggle-3d').click();
await page.waitForTimeout(2500);
await page.screenshot({ path: '../work/shots/tee-3d.png' });
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
const canvases = await page.locator('canvas').count();
console.log('canvas count:', canvases);
await browser.close();
