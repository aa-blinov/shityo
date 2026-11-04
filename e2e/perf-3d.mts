import { chromium } from '@playwright/test';

/** Замер: сколько байт браузер грузит на странице лекала и после включения 3D. */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

let bytes = 0;
let requests = 0;
const byUrl: { url: string; size: number }[] = [];

page.on('response', async (res) => {
	const url = res.url();
	if (!url.includes('/_app/immutable/')) return;
	try {
		const body = await res.body();
		bytes += body.length;
		requests += 1;
		byUrl.push({ url: url.split('/').pop() ?? url, size: body.length });
	} catch {
		// ответ без тела (304 и подобные) - пропускаем
	}
});

await page.goto('http://localhost:5173/pattern/tee', { waitUntil: 'networkidle' });
console.log(`страница лекала: ${requests} файлов, ${(bytes / 1024).toFixed(0)} КБ`);
for (const item of byUrl.sort((a, b) => b.size - a.size).slice(0, 5)) {
	console.log(`   ${(item.size / 1024).toFixed(0)} КБ  ${item.url}`);
}

bytes = 0;
requests = 0;
byUrl.length = 0;
await page.getByTestId('toggle-3d').click();
await page.waitForTimeout(4000);
console.log(`после включения 3D: ${requests} файлов, ${(bytes / 1024).toFixed(0)} КБ`);
for (const item of byUrl.sort((a, b) => b.size - a.size).slice(0, 5)) {
	console.log(`   ${(item.size / 1024).toFixed(0)} КБ  ${item.url}`);
}

// Сколько кадров в секунду держит сцена с тканью.
const fps = await page.evaluate(`new Promise((resolve) => {
	let frames = 0;
	const start = performance.now();
	function tick() {
		frames += 1;
		if (performance.now() - start < 2000) requestAnimationFrame(tick);
		else resolve((frames / (performance.now() - start)) * 1000);
	}
	requestAnimationFrame(tick);
})`);
console.log(`кадров в секунду в 3D: ${fps.toFixed(0)}`);

await browser.close();
