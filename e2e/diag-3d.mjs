import { chromium } from '@playwright/test';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('console', (m) => console.log('CONSOLE:', m.type(), m.text().slice(0, 300)));
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 400)));

await p.goto('http://localhost:5173/pattern/tee');
await p.waitForSelector('[data-testid="pattern-canvas"]');
await p.waitForTimeout(1500);

await p.getByTestId('toggle-3d').click();
await p.waitForTimeout(4000);

console.log('canvas count:', await p.locator('canvas').count());
const canvas = p.locator('canvas').first();
const box = await canvas.boundingBox();
console.log('box:', JSON.stringify(box));

if (box) {
	const shot = await p.screenshot({ clip: box });
	const colors = new Set();
	for (let i = 0; i < shot.length; i += 997) colors.add(String(shot[i]));
	console.log('различных байт:', colors.size);
}

console.log('panel text:', (await p.getByTestId('preview-3d').innerText()).slice(0, 300));
await p.screenshot({ path: '../work/shots/ui/diag-3d.png' });
await b.close();
