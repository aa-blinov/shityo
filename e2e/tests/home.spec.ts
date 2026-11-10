import { apiCreateClient, apiProject, expect, test } from './fixtures';

/**
 * Главная для постоянного мастера и для первого визита: заказы в работе
 * встают наверх, вводный экран остаётся только для пустого ателье.
 */

test('первый визит: вводный экран, основы с эскизами и пустые проекты', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
	await expect(page.getByTestId('hero-cta')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Мои проекты' })).toBeVisible();
	await expect(page.getByTestId('model-pieces-tee')).toHaveText('3 детали');
	await expect(page.getByTestId('model-card-skirt').locator('svg path').first()).toBeVisible();
	await page.getByTestId('hero-cta').click();
	await expect(page.locator('#bases-title')).toBeFocused();
});

test('постоянный мастер видит заказы в работе первыми', async ({ page }) => {
	const client = await apiCreateClient(page, 'Анна Петрова');
	await apiProject(page, 'p-old', { name: 'Юбка на лето', model: 'skirt', clientId: client.id, stage: 'toile' });
	await apiProject(page, 'p-new', { name: 'Юбка в офис', model: 'skirt' });
	await apiProject(page, 'p-done', { name: 'Готовая юбка', model: 'skirt', stage: 'done' });
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');

	await expect(page.getByRole('heading', { name: 'В работе' })).toBeVisible();
	await expect(page.getByTestId('hero-cta')).toHaveCount(0);
	const rows = page.getByTestId('my-designs').locator('li');
	await expect(rows).toHaveCount(2);
	// Свежий проект сверху, у второго видны клиент и стадия.
	await expect(rows.nth(0)).toContainText('Юбка в офис');
	await expect(rows.nth(0)).toContainText('Без клиента');
	await expect(rows.nth(1)).toContainText('Анна Петрова');
	await expect(rows.nth(1)).toContainText('Макет и примерка');
	await expect(page.getByRole('link', { name: 'Готовая юбка' })).toHaveCount(0);

	// Блок заказов стоит выше каталога основ.
	const work = await page.getByTestId('my-designs').boundingBox();
	const bases = await page.locator('#bases').boundingBox();
	expect(work!.y).toBeLessThan(bases!.y);

	await page.getByRole('link', { name: 'Юбка на лето', exact: true }).click();
	await expect(page).toHaveURL(/\/pattern\/skirt\?project=p-old/);
});
