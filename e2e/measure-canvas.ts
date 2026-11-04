import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto('http://localhost:5173/pattern/trousers');
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
	const svg = document.querySelector('svg[data-testid="pattern-canvas"]') as SVGSVGElement;
	const sr = svg.getBoundingClientRect();
	const pieces = [...document.querySelectorAll('svg[data-testid="pattern-canvas"] g.piece')].map((g) => {
		const r = g.getBoundingClientRect();
		return {
			id: g.getAttribute('data-piece-id'),
			top: Math.round(r.top),
			bottom: Math.round(r.bottom),
			left: Math.round(r.left),
			right: Math.round(r.right)
		};
	});
	return {
		svg: { top: Math.round(sr.top), bottom: Math.round(sr.bottom), h: Math.round(sr.height) },
		viewportH: window.innerHeight,
		pieces
	};
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
