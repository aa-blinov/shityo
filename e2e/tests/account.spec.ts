import { test, expect, apiCreateClient, registerAtelier, PASSWORD } from './fixtures';

/** Ателье: вход, сотрудники и их роли, разделение ателье, перенос из браузера. */

/** Второй браузер с теми же настройками проекта, но без сессии. */
function freshContext() {
	const use = test.info().project.use;
	return { baseURL: use.baseURL, storageState: use.storageState };
}

test('without a session the app opens the sign-in page and returns after it', async ({ page, atelier }) => {
	await page.context().clearCookies();
	await page.goto('/clients');
	await expect(page).toHaveURL(/\/login\?next=%2Fclients/);
	await page.locator('#auth-email').fill(atelier.email);
	await page.locator('#auth-password').fill('неверный пароль');
	await page.getByTestId('auth-submit').click();
	await expect(page.getByRole('alert')).toContainText('Неверная почта или пароль');
	await page.locator('#auth-password').fill(atelier.password);
	await page.getByTestId('auth-submit').click();
	await expect(page).toHaveURL(/\/clients$/);
	await expect(page.getByTestId('nav-user')).toHaveText('Мастер проверки');

	await page.getByTestId('account-menu').click();
	await page.getByTestId('logout').click();
	await expect(page).toHaveURL(/\/login/);
	await page.goto('/orders');
	await expect(page).toHaveURL(/\/login\?next=%2Forders/);
});

test('a new atelier is registered from the sign-in page', async ({ page }) => {
	await page.context().clearCookies();
	await page.goto('/login');
	await page.getByTestId('auth-switch').click();
	await page.locator('#auth-atelier').fill('Ателье на Садовой');
	await page.locator('#auth-name').fill('Ирина');
	await page.locator('#auth-email').fill(`irina-${Date.now()}@example.com`);
	await page.locator('#auth-password').fill(PASSWORD);
	await page.getByTestId('auth-submit').click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByTestId('nav-atelier')).toHaveText('Ателье на Садовой');
});

test('the owner adds a tailor who sees the same clients but cannot manage staff', async ({ page, browser }) => {
	await apiCreateClient(page, 'Общая клиентка');
	await page.goto('/account');
	await expect(page.getByTestId('atelier-title')).toHaveText('Ателье проверки');
	const email = `olga-${Date.now()}@example.com`;
	await page.getByTestId('staff-name').fill('Ольга');
	await page.getByTestId('staff-email').fill(email);
	await page.getByTestId('staff-password').fill('временный-пароль');
	await page.getByTestId('staff-add').click();
	await expect(page.getByTestId('staff-row').filter({ hasText: 'Ольга' })).toBeVisible();

	const tailor = await browser.newContext(freshContext());
	const tailorPage = await tailor.newPage();
	await tailorPage.goto('/login');
	await tailorPage.locator('#auth-email').fill(email);
	await tailorPage.locator('#auth-password').fill('временный-пароль');
	await tailorPage.getByTestId('auth-submit').click();
	await expect(tailorPage.getByTestId('nav-atelier')).toHaveText('Ателье проверки');
	await tailorPage.goto('/clients');
	await expect(tailorPage.getByTestId('client-row')).toContainText('Общая клиентка');
	await tailorPage.goto('/account');
	await expect(tailorPage.getByTestId('staff-add')).toHaveCount(0);
	await expect(tailorPage.getByTestId('atelier-save')).toHaveCount(0);

	// Владелец закрывает доступ: мастер больше не входит.
	await page.getByTestId('staff-row').filter({ hasText: 'Ольга' }).getByTestId('staff-toggle').click();
	await tailorPage.goto('/clients');
	await expect(tailorPage).toHaveURL(/\/login/);
	await tailor.close();
});

test('two ateliers never see each other', async ({ page, browser }) => {
	await apiCreateClient(page, 'Клиентка первого ателье');
	const other = await browser.newContext(freshContext());
	const otherPage = await other.newPage();
	await otherPage.goto('/login');
	await registerAtelier(otherPage.request, 'Второе ателье');
	await otherPage.goto('/clients');
	await expect(otherPage.getByText('Клиентов пока нет')).toBeVisible();
	await other.close();
});

test('data left in this browser moves to the atelier once', async ({ page }) => {
	await page.addInitScript(() => {
		if (localStorage.getItem('e2e-seeded')) return;
		localStorage.setItem('e2e-seeded', '1');
		const client = '11111111-1111-4111-8111-111111111111';
		localStorage.setItem(
			'shityo.clients.v1',
			JSON.stringify({
				clients: [{ id: client, name: 'Старая клиентка', notes: '', createdAt: '2026-01-01T00:00:00.000Z' }],
				snapshots: [{ id: '22222222-2222-4222-8222-222222222222', clientId: client, label: 'Основные', createdAt: '2026-01-01T00:00:00.000Z', values: { waist: 70 } }]
			})
		);
		localStorage.setItem(
			'shityo.design-projects.v1',
			JSON.stringify([{ version: 1, id: 'old-1', name: 'Юбка из браузера', model: 'skirt', updated: '2026-02-01T10:00:00.000Z', measurements: {}, params: {}, overrides: {}, clientId: client, stage: 'toile' }])
		);
	});
	await page.goto('/');
	await expect(page.getByTestId('migration-banner')).toContainText('Проектов: 1, клиентов: 1');
	await page.getByTestId('migrate-run').click();
	await expect(page.getByTestId('migration-banner')).toContainText('Перенесено проектов: 1, клиентов: 1');

	await page.goto('/orders');
	await expect(page.getByTestId('order-row')).toContainText('Юбка из браузера');
	await expect(page.getByTestId('order-row')).toContainText('Старая клиентка');
	await page.goto('/');
	await expect(page.getByTestId('migration-banner')).toHaveCount(0);
});

test('atelier backup downloads as one JSON', async ({ page }) => {
	await apiCreateClient(page, 'Для копии');
	await page.goto('/account');
	const downloadPromise = page.waitForEvent('download');
	await page.getByTestId('account-export').click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('shityo-atelier.json');
});
