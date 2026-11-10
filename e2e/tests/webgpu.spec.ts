import { test, expect, type Page } from './fixtures';

// Ткань и поле тела на видеокарте (WebGPU). Нужен Chromium с WebGPU и
// настоящий адаптер: без видеокарты тест пропускается, а превью работает
// на процессоре (это проверяют остальные тесты).
test.use({ channel: 'chromium', launchOptions: { args: ['--enable-unsafe-webgpu'] } });

async function hasAdapter(page: Page): Promise<boolean> {
	await page.goto('/');
	return page.evaluate(async () => {
		const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
		return !!gpu && !!(await gpu.requestAdapter());
	});
}

async function drape(page: Page, model: string, query = ''): Promise<{ backend: string | null; extent: number[] }> {
	await page.goto(`/pattern/${model}${query}`);
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('toggle-3d').click();
	const preview = page.getByTestId('preview-3d');
	await expect(preview).toHaveAttribute('data-settled', 'true', { timeout: 45_000 });
	const extent = (await preview.getAttribute('data-extent'))!.split(',').map(Number);
	return { backend: await preview.getAttribute('data-backend'), extent };
}

test('3D cloth runs on the GPU and matches the CPU drape', async ({ page }) => {
	test.setTimeout(120_000);
	test.skip(!(await hasAdapter(page)), 'no WebGPU adapter on this machine');
	const problems: string[] = [];
	page.on('pageerror', (e) => problems.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' || /WebGPU|shader|WGSL/i.test(m.text())) problems.push(m.text());
	});
	for (const model of ['tee', 'trousers', 'dress']) {
		const gpu = await drape(page, model);
		expect(gpu.backend, `${model}: cloth should run on the GPU`).toBe('gpu');
		const cpu = await drape(page, model, '?cloth=cpu');
		expect(cpu.backend).toBe('cpu');
		// На видеокарте ткань мельче и свободно оседает (на процессоре её
		// держат у собранной формы), но изделие то же: габариты совпадают в
		// пределах 6 см, а высота не меньше 85 % - ткань не сложилась.
		gpu.extent.forEach((v, i) => {
			expect(Math.abs(v - cpu.extent[i]), `${model}: extent ${i} gpu ${v} cpu ${cpu.extent[i]} mm`).toBeLessThan(60);
		});
		const height = (e: number[]) => e[3] - e[2];
		expect(height(gpu.extent), `${model}: GPU drape height`).toBeGreaterThan(height(cpu.extent) * 0.85);
	}
	expect(problems).toEqual([]);
});
