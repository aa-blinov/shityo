import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const OUT = '../work/shots/ui';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const shots: string[] = [];

async function shot(name: string): Promise<void> {
	await page.waitForTimeout(400);
	const file = `${OUT}/${name}.png`;
	await page.screenshot({ path: file });
	shots.push(name);
	console.log(`  скрин: ${name}`);
}

/**
 * Дождаться гидрации: до неё события на странице ещё не подписаны, и
 * щелчок по контролу не даст эффекта.
 *
 * Признак - метка `data-hydrated` на корневом элементе: её ставит
 * onMount оболочки, то есть она появляется после монтирования.
 */
async function waitForHydration(): Promise<void> {
	await page.waitForFunction(
		() => document.documentElement.dataset.hydrated === 'true',
		undefined,
		{ timeout: 15_000 }
	);
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
		console.log(`OK   ${name}`);
	} catch (err) {
		console.log(`FAIL ${name}: ${err instanceof Error ? err.message : err}`);
		errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
		await shot(`FAIL-${name.replace(/\W+/g, '-')}`);
	}
}

console.log('1. Каталог');
await page.goto(BASE);
await step('каталог открылся', async () => {
	await page.waitForSelector('[data-testid="model-card-tee"]', { timeout: 10_000 });
});
await shot('01-catalog');

console.log('2. Открытие футболки');
await step('переход в модель', async () => {
	await page.locator('[data-testid="model-card-tee"] a').first().click();
	await page.waitForURL(/\/pattern\/tee/, { timeout: 10_000 });
});
await step('детали отрисованы', async () => {
	await page.waitForSelector('svg[data-testid="pattern-canvas"] g.piece path.cut', {
		timeout: 10_000
	});
	const count = await page.locator('svg[data-testid="pattern-canvas"] g.piece').count();
	if (count < 3) throw new Error(`деталей ${count}, ожидалось 3+`);
	console.log(`     деталей: ${count}`);
});
await shot('02-tee');

console.log('3. Мерки');
await step('смена обхвата груди', async () => {
	const before = await page.getByTestId('front-width').innerText();
	await page.getByTestId('measurement-bust').fill('110');
	await page.getByTestId('measurement-bust').blur();
	await page.waitForTimeout(1200);
	const after = await page.getByTestId('front-width').innerText();
	if (before === after) throw new Error(`ширина не изменилась: ${before}`);
		console.log(`     ширина: ${before.trim()} -> ${after.trim()}`);
});
await shot('03-measurement-changed');

await step('возврат мерки', async () => {
	await page.getByTestId('measurement-bust').fill('96');
	await page.getByTestId('measurement-bust').blur();
	await page.waitForTimeout(900);
});

console.log('4. Параметры фасона');
await step('смена посадки на свободную', async () => {
	const select = page.getByTestId('param-fit');
	await select.selectOption('loose');
	await page.waitForTimeout(1200);
});
await shot('04-fit-loose');
await step('возврат посадки', async () => {
	await page.getByTestId('param-fit').selectOption('regular');
	await page.waitForTimeout(900);
});
await step('смена горловины на V', async () => {
	await page.getByTestId('param-neckline').selectOption('v');
	await page.waitForTimeout(1200);
});
await shot('05-neckline-v');
await step('возврат горловины', async () => {
	await page.getByTestId('param-neckline').selectOption('crew');
	await page.waitForTimeout(900);
});

console.log('5. Слои чертежа');
await step('выключение припуска', async () => {
	await page.getByRole('checkbox', { name: 'Припуск' }).uncheck();
	await page.waitForTimeout(500);
});
await shot('06-no-allowance');
await step('возврат припуска', async () => {
	await page.getByRole('checkbox', { name: 'Припуск' }).check();
	await page.waitForTimeout(400);
});
await step('выключение зерна', async () => {
	await page.getByRole('checkbox', { name: 'Долевая' }).uncheck();
	await page.waitForTimeout(500);
});
await shot('07-no-grain');
await step('возврат зерна', async () => {
	await page.getByRole('checkbox', { name: 'Долевая' }).check();
	await page.waitForTimeout(400);
});

console.log('6. Выбор детали');
await step('выбор спинки', async () => {
	await page.locator('[data-testid="piece-item"]').nth(1).click();
	await page.waitForTimeout(500);
});
await shot('08-piece-selected');

console.log('7. Зум и панорама');
await step('приближение', async () => {
	const zoomText = page.locator('.canvas-toolbar .hint');
	const before = (await zoomText.innerText()).trim();
	await page.getByRole('button', { name: 'Приблизить' }).click();
	await page.getByRole('button', { name: 'Приблизить' }).click();
	await page.waitForTimeout(600);
	const after = (await zoomText.innerText()).trim();
	console.log(`     зум: ${before} -> ${after}`);
	if (before === after) throw new Error('зум не изменился');
});
await shot('09-zoom-in');
await step('вписать в окно', async () => {
	await page.getByRole('button', { name: 'Вписать в окно' }).click();
	await page.waitForTimeout(600);
});
await shot('10-zoom-fit');

console.log('8. Размерная сетка');
await step('применение размера 42', async () => {
	const before = await page.getByTestId('front-width').innerText();
	await page
		.locator('[data-testid="size-row"][data-size="42"] button')
		.click();
	await page.waitForTimeout(1400);
	const after = await page.getByTestId('front-width').innerText();
	if (before === after) throw new Error(`ширина не изменилась: ${before}`);
	console.log(`     ширина: ${before.trim()} -> ${after.trim()}`);
});
await shot('11-size-42');

console.log('9. Экспорт');
for (const format of ['svg', 'dxf', 'pdf'] as const) {
	await step(`экспорт ${format}`, async () => {
		const link = page.getByTestId(`export-${format}`);
		const href = await link.getAttribute('href');
		if (!href) throw new Error('нет ссылки');
		const url = new URL(href, BASE).toString();
		const response = await page.request.get(url);
		if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
		const body = await response.body();
		console.log(`     ${format}: ${body.length} байт, ${response.headers()['content-type']}`);
		if (body.length < 500) throw new Error('файл подозрительно мал');
		if (format === 'svg' && !body.toString().includes('<svg')) {
			throw new Error('в SVG нет тега <svg>');
		}
		if (format === 'pdf' && body.subarray(0, 4).toString() !== '%PDF') {
			throw new Error('PDF без сигнатуры %PDF');
		}
	});
}

console.log('10. 3D-превью');
await step('включение 3D', async () => {
	await page.getByTestId('toggle-3d').click();
	await page.waitForSelector('canvas', { timeout: 10_000 });
	await page.waitForTimeout(2500);
});
await shot('12-3d');
await step('3D не пустой', async () => {
	// WebGL-канвас не отдаёт 2d-контекст, поэтому сцену проверяем по
	// пикселям скриншота: пустая сцена - это одноцветная заливка.
	const canvas = page.locator('canvas').first();
	const box = await canvas.boundingBox();
	if (!box) throw new Error('канвас без размеров');
	const shotBuffer = await page.screenshot({ clip: box });
	const colors = new Set<string>();
	for (let i = 0; i < shotBuffer.length; i += 997) {
		colors.add(String(shotBuffer[i]));
	}
	if (colors.size < 8) throw new Error(`канвас почти одноцветный (${colors.size} значений)`);
	console.log(`     различных байт в области 3D: ${colors.size}`);
});
await step('выключение 3D', async () => {
	await page.getByTestId('toggle-3d').click();
	await page.waitForTimeout(800);
});

console.log('11. Остальные модели');
for (const model of ['shirt', 'trousers', 'skirt']) {
	await step(`модель ${model}`, async () => {
		await page.goto(`${BASE}/pattern/${model}`);
		await page.waitForSelector('svg[data-testid="pattern-canvas"] g.piece path.cut', {
			timeout: 10_000
		});
		await page.waitForTimeout(600);
	});
	await shot(`13-${model}`);
}

console.log('12. Мобильная ширина');
await step('узкий экран', async () => {
	await page.setViewportSize({ width: 420, height: 900 });
	await page.goto(`${BASE}/pattern/tee`);
	await page.waitForTimeout(900);
});
// Галерея иконок: набор lucide, который уже подключён к интерфейсу.
await page.goto(`${BASE}/icons`);
await page.waitForSelector('.icons button', { timeout: 10_000 });
await page.waitForTimeout(400);
await shot('13-icons');
await step('галерея иконок на месте', async () => {
	const count = await page.locator('.icons button').count();
	if (count < 50) throw new Error(`иконок в галерее ${count}, ожидалось больше 50`);
});

await shot('14-mobile');

console.log('13. Локализация');
await page.setViewportSize({ width: 1600, height: 1000 });
await page.goto(`${BASE}/pattern/tee`);
await page.waitForSelector('svg[data-testid="pattern-canvas"]');
await step('русский по умолчанию', async () => {
	const panel = await page.getByTestId('measure-panel').innerText();
	if (!/МЕРКИ/i.test(panel)) throw new Error(`панель мерок не на русском: ${panel.slice(0, 60)}`);
});
await waitForHydration();
await step('переключение на английский', async () => {
	await page.getByTestId('language-switch').selectOption('en');
	await page.waitForTimeout(600);
	const panel = await page.getByTestId('measure-panel').innerText();
	if (!/MEASUREMENTS/i.test(panel)) throw new Error(`панель не перевелась: ${panel.slice(0, 60)}`);
	const toolbar = await page.getByTestId('topbar').innerText();
	if (/Припуск|Долевая/.test(toolbar)) throw new Error(`в панели инструментов остался русский: ${toolbar}`);
});
await shot('15-english');
await step('язык переживает перезагрузку', async () => {
	await page.reload();
	await page.waitForSelector('svg[data-testid="pattern-canvas"]');
	await page.waitForTimeout(600);
	const panel = await page.getByTestId('measure-panel').innerText();
	if (!/MEASUREMENTS/i.test(panel)) throw new Error('язык не восстановился');
});
await step('замечания валидатора переведены', async () => {
	// Мерка вне диапазона: сервер отдаёт замечание с кодом, интерфейс
	// показывает его на языке интерфейса.
	await page.getByTestId('measurement-height').fill('400');
	await page.getByTestId('measurement-height').blur();
	await page.waitForTimeout(2000);
	const errors = await page.getByTestId('error-list').innerText();
	if (!/Height/.test(errors)) throw new Error(`замечание не переведено: ${errors}`);
	if (/[Ѐ-ӿ]/.test(errors)) throw new Error(`в замечании остались русские слова: ${errors}`);
});
await step('возврат на русский', async () => {
	await page.getByTestId('language-switch').selectOption('ru');
	await page.waitForTimeout(600);
	const panel = await page.getByTestId('measure-panel').innerText();
	if (!/МЕРКИ/i.test(panel)) throw new Error('русский не вернулся');
	const errors = await page.getByTestId('error-list').innerText();
	if (!/Рост/.test(errors)) throw new Error(`по-русски имя меры не подставлено: ${errors}`);
});
await step('возврат мерки', async () => {
	await page.getByTestId('measurement-height').fill('176');
	await page.getByTestId('measurement-height').blur();
	await page.waitForTimeout(1500);
});

console.log('14. Темы');
await step('светлая тема', async () => {
	await page.getByTestId('mode-toggle').click();
	await page.waitForTimeout(400);
	const mode = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));
	if (mode !== 'light') throw new Error(`режим ${mode}`);
});
await shot('16-light');
await step('смена палитры', async () => {
	await page.getByTestId('theme-switch').selectOption('catppuccin');
	await page.waitForTimeout(400);
	const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
	if (theme !== 'catppuccin') throw new Error(`тема ${theme}`);
});
await shot('17-catppuccin');
await step('возврат тёмной темы', async () => {
	await page.getByTestId('theme-switch').selectOption('gruvbox');
	await page.getByTestId('mode-toggle').click();
	await page.waitForTimeout(400);
});

console.log('\n=== ИТОГ ===');
console.log(`скринов: ${shots.length}`);
console.log(`проблем: ${errors.length}`);
for (const e of errors) console.log(`  - ${e}`);

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
