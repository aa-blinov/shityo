import { test, expect, apiCreateClient, apiProject, apiProjects, apiSnapshot } from './fixtures';

/** Сценарии ателье: клиент - его мерки - его заказы - стадия. */

test('client registry adds a client and opens the card', async ({ page }) => {
	await page.goto('/clients');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
	await expect(page.getByText('Клиентов пока нет')).toBeVisible();
	await page.getByTestId('clients-new-name').fill('Анна Петрова');
	await page.getByTestId('clients-add').click();
	await expect(page).toHaveURL(/\/clients\/[a-f0-9-]+$/);
	await expect(page.getByTestId('client-name')).toHaveText('Анна Петрова');

	await page.locator('#client-card-phone').fill('+7 900 000-00-00');
	await page.getByTestId('client-card-save').click();
	await page.goto('/clients');
	const row = page.getByTestId('client-row').filter({ hasText: 'Анна Петрова' });
	await expect(row).toContainText('+7 900 000-00-00');
	await expect(row).toContainText('не снимали');
	await page.getByTestId('clients-search').fill('семенова');
	await expect(page.getByTestId('client-row')).toHaveCount(0);
	await page.getByTestId('clients-search').fill('петрова');
	await expect(page.getByTestId('client-row')).toHaveCount(1);
});

test('client card compares two measurement sets and flags orders built on old ones', async ({ page }) => {
	const client = await apiCreateClient(page, 'Вера');
	await apiSnapshot(page, client.id, 'Весна', { waist: 70, hip: 98 }, '2026-01-10T10:00:00Z');
	await apiProject(page, 'skirt-1', { name: 'Юбка на лето', model: 'skirt', clientId: client.id, measurements: { waist: 70, hip: 98 } });

	await page.goto(`/clients/${client.id}`);
	await expect(page.getByTestId('client-orders')).toContainText('Юбка на лето');
	await expect(page.getByTestId('order-outdated')).toHaveCount(0);

	// Новая съёмка с изменённой талией: поля заполнены прошлой съёмкой.
	await page.getByTestId('snapshot-new').click();
	await expect(page.getByTestId('snapshot-waist')).toHaveValue('70');
	await page.getByTestId('snapshot-waist').fill('72.5');
	await page.locator('#snapshot-label').fill('Осень');
	await page.getByTestId('snapshot-save').click();

	await expect(page.getByTestId('diff-waist')).toHaveText('+2.5');
	await expect(page.getByTestId('diff-hip')).toHaveText('0');
	await expect(page.getByTestId('order-outdated')).toBeVisible();

	// Заказ для этого клиента стартует с его карточки.
	await page.getByTestId('client-card-model').selectOption('trousers');
	await page.getByTestId('client-card-new-order').click();
	await expect(page).toHaveURL(new RegExp(`/pattern/trousers\\?new=1&client=${client.id}`));
	await expect(page.getByTestId('project-start')).toBeVisible();
});

test('project started for a client stays with that client even from a typical size', async ({ page }) => {
	const client = await apiCreateClient(page, 'Анна К.');
	await page.goto(`/pattern/tee?new=1&client=${client.id}`);
	await expect(page.getByTestId('project-start')).toBeVisible();
	// Чьи мерки и чей заказ - разные решения: мерки типового размера.
	await page.getByTestId('start-source').locator('[data-value="size"]').click();
	await page.getByTestId('start-submit').click();
	await expect(page.getByTestId('project-client')).toHaveValue(client.id);
	await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
	await page.goto(`/clients/${client.id}`);
	await expect(page.getByTestId('client-orders').locator('li')).toHaveCount(1);
});

test('new project from the catalog is not silently given the first client', async ({ page }) => {
	await apiCreateClient(page, 'Борис');
	await page.goto('/pattern/tee?new=1');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByTestId('project-start')).toBeVisible();
	await page.getByTestId('start-submit').click();
	await expect(page.getByTestId('project-client')).toHaveValue('');
});

test('orders registry filters by stage and changes it without touching measurements', async ({ page }) => {
	const client = await apiCreateClient(page, 'Галина');
	await apiProject(page, 'p-active', { name: 'Брюки в работе', model: 'trousers', clientId: client.id, stage: 'draft', measurements: { waist: 74 } });
	await apiProject(page, 'p-done', { name: 'Готовая юбка', model: 'skirt', stage: 'done' });

	await page.goto('/orders');
	await expect(page.getByTestId('order-row')).toHaveCount(1);
	await expect(page.getByTestId('order-row')).toContainText('Брюки в работе');
	await expect(page.getByTestId('order-row')).toContainText('Галина');
	await page.getByTestId('orders-stage').locator('[data-value="done"]').click();
	await expect(page.getByTestId('order-row')).toContainText('Готовая юбка');
	await page.getByTestId('orders-stage').locator('[data-value="all"]').click();
	await expect(page.getByTestId('order-row')).toHaveCount(2);
	await page.getByTestId('orders-search').fill('галина');
	await expect(page.getByTestId('order-row')).toHaveCount(1);

	await page.getByTestId('order-row').getByTestId('order-stage').selectOption('toile');
	await expect.poll(async () => (await apiProjects(page)).find((p) => p.id === 'p-active')?.stage).toBe('toile');
	expect((await apiProjects(page)).find((p) => p.id === 'p-active')?.measurements.waist).toBe(74);
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
	const client = await apiCreateClient(page, 'Дина');
	await page.goto(`/clients/${client.id}`);
	await expect(page.getByTestId('client-name')).toHaveText('Дина');
	let asked = false;
	page.on('dialog', (dialog) => {
		asked = true;
		void dialog.dismiss();
	});
	await page.getByTestId('client-card-delete').click();
	expect(asked).toBe(true);
	await page.goto('/clients');
	await expect(page.getByTestId('client-row').filter({ hasText: 'Дина' })).toBeVisible();
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
