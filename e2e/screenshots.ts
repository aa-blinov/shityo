import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto('http://localhost:5173/');
await page.waitForTimeout(700);
await page.screenshot({ path: '../work/shots/catalog.png', fullPage: true });

await page.goto('http://localhost:5173/pattern/tee');
await page.waitForTimeout(900);
await page.screenshot({ path: '../work/shots/tee.png', fullPage: true });

await page.goto('http://localhost:5173/pattern/trousers');
await page.waitForTimeout(900);
await page.screenshot({ path: '../work/shots/trousers.png', fullPage: true });

await page.goto('http://localhost:5173/pattern/shirt');
await page.waitForTimeout(900);
await page.screenshot({ path: '../work/shots/shirt.png', fullPage: true });

await browser.close();
console.log('screenshots written');
