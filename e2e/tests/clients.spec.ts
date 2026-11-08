import { test, expect, type Page } from '@playwright/test';

/** Сценарии ателье и швеи-одиночки: клиент - его проекты - стадия заказа. */

async function addClient(page: Page, name: string) {
	await page.goto('/account');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
	await page.getByTestId('board-new-client').fill(name);
	await page.getByTestId('board-new-client').press('Enter');
	await expect(page.getByTestId('board-group').filter({ hasText: name })).toBeVisible();
}

test('project started for a client stays with that client even from a typical size', async ({ page }) => {
	await addClient(page, 'Анна К.');
	await page.getByTestId('board-new-project').first().click();
	await expect(page.getByTestId('project-start')).toBeVisible();
	// Чьи мерки и чей заказ - разные решения: мерки типового размера.
	await page.getByTestId('start-source').locator('[data-value="size"]').click();
	await page.getByTestId('start-submit').click();
	await expect(page.getByTestId('project-client')).toHaveValue(/.+/);
	await page.goto('/account');
	const group = page.getByTestId('board-group').filter({ hasText: 'Анна К.' });
	await expect(group.locator('.project')).toHaveCount(1);
});

test('new project from the catalog is not silently given the first client', async ({ page }) => {
	await addClient(page, 'Борис');
	await page.goto('/pattern/tee?new=1');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByTestId('project-start')).toBeVisible();
	await page.getByTestId('start-submit').click();
	await expect(page.getByTestId('project-client')).toHaveValue('');
});

test('changing the stage in the board keeps the project measurements', async ({ page }) => {
	await addClient(page, 'Вера');
	await page.getByTestId('board-new-project').first().click();
	await page.getByTestId('start-submit').click();
	await page.getByTestId('measurement-bust').fill('104');
	await page.getByTestId('measurement-bust').blur();
	await expect(page.getByTestId('project-status')).toContainText('несохранённые');
	await page.getByTestId('project-save').click();
	await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
	await page.goto('/account');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
	await page.locator('.project select.stage').first().selectOption('toile');
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shityo.design-projects.v1')!));
	expect(saved[0].stage).toBe('toile');
	expect(saved[0].measurements.bust).toBe(104);
});

test('one damaged project does not hide the others or block saving', async ({ page }) => {
	await page.goto('/pattern/tee?new=1');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('start-submit').click();
	await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
	await page.evaluate(() => {
		const all = JSON.parse(localStorage.getItem('shityo.design-projects.v1')!);
		all.push({ version: 1, id: 'broken', name: 'Битый', model: 'tee', updated: 'not a date' });
		localStorage.setItem('shityo.design-projects.v1', JSON.stringify(all));
	});
	await page.goto('/account');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
	await page.getByTestId('board-filter').locator('[data-value="all"]').click();
	await expect(page.locator('.project')).toHaveCount(1);
	// Повреждённая запись не стирается молча при следующем сохранении.
	await page.locator('.project-name').first().click();
	await page.getByTestId('measurement-bust').fill('101');
	await page.getByTestId('measurement-bust').blur();
	await expect(page.getByTestId('project-status')).toContainText('несохранённые');
	await page.getByTestId('project-save').click();
	await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
	const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('shityo.design-projects.v1')!));
	expect(raw.some((p: { id: string }) => p.id === 'broken')).toBe(true);
});

test('turning autosave off survives a reload', async ({ page }) => {
	await page.goto('/pattern/tee?new=1');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('start-submit').click();
	await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
	await page.getByTestId('section-versions').locator('summary').click();
	await page.getByTestId('autosave-toggle').uncheck();
	await page.reload();
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	// Открытый проект показывает панель мерок; проверка - по кнопке ].
	await page.getByTestId('toggle-inspector').click();
	const toggle = page.getByTestId('autosave-toggle');
	if (!(await toggle.isVisible())) await page.getByTestId('section-versions').locator('summary').click();
	await expect(page.getByTestId('autosave-toggle')).not.toBeChecked();
});

test('deleting a client asks first', async ({ page }) => {
	await addClient(page, 'Галина');
	await page.goto('/pattern/tee?new=1');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('start-skip').click();
	let asked = false;
	page.on('dialog', (dialog) => {
		asked = true;
		void dialog.dismiss();
	});
	await page.getByText('Мерки клиента').click();
	await page.getByRole('button', { name: 'Галина' }).click();
	await page.getByTestId('client-delete').click();
	expect(asked).toBe(true);
	await page.goto('/account');
	await expect(page.getByTestId('board-group').filter({ hasText: 'Галина' })).toBeVisible();
});

test('the seam comparison toggles A and B on and off', async ({ page }) => {
	await page.goto('/pattern/tee');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	const firstRow = page.locator('.seam-row').first();
	const a = firstRow.locator('.badge').first();
	await a.click();
	await expect(a).toHaveAttribute('aria-pressed', 'true');
	await a.click();
	await expect(a).toHaveAttribute('aria-pressed', 'false');
	const b = page.locator('.seam-row').nth(1).locator('.badge').nth(1);
	await b.click();
	await expect(b).toHaveAttribute('aria-pressed', 'true');
	await b.click();
	await expect(b).toHaveAttribute('aria-pressed', 'false');
});
