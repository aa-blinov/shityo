import { test, expect, apiCreateClient, apiProject } from './fixtures';

// Шапка одна на всех страницах, раздел подсвечен и на вложенных страницах,
// а стрелка назад ведёт туда, откуда открыли лекало.

test('an order opened from the registry leads back to orders', async ({ page }) => {
	await apiProject(page, 'nav-order', { name: 'Юбка для проверки', model: 'skirt' });
	await page.goto('/orders');
	await page.getByRole('link', { name: 'Юбка для проверки' }).click();
	await expect(page).toHaveURL(/from=\/orders/);
	await expect(page.getByTestId('nav-orders')).toHaveAttribute('aria-current', 'page');
	await expect(page.getByTestId('crumbs')).toContainText('Заказы');
	await page.getByTestId('crumbs-back').click();
	await expect(page).toHaveURL(/\/orders$/);
});

test('an order opened from a client card leads back to the card', async ({ page }) => {
	const client = await apiCreateClient(page, 'Клиентка навигации');
	await apiProject(page, 'nav-client', { name: 'Брюки клиентки', model: 'trousers', clientId: client.id });
	await page.goto(`/clients/${client.id}`);
	await expect(page.getByTestId('crumbs')).toContainText('Клиенты');
	await page.getByRole('link', { name: 'Брюки клиентки' }).click();
	await expect(page.getByTestId('nav-clients')).toHaveAttribute('aria-current', 'page');
	await expect(page.getByTestId('crumbs')).toContainText('Клиентка навигации');
	await page.getByTestId('crumbs-back').click();
	await expect(page).toHaveURL(new RegExp(`/clients/${client.id}$`));
});

test('a base opened from the catalog leads back to the catalog', async ({ page }) => {
	await page.goto('/pattern/skirt');
	await expect(page.getByTestId('nav-catalog')).toHaveAttribute('aria-current', 'page');
	await expect(page.getByTestId('crumbs')).toContainText('Основы');
});

test('the staff menu holds the atelier, its page and sign-out', async ({ page }) => {
	await page.goto('/orders');
	await expect(page.getByTestId('logout')).toBeHidden();
	await page.getByTestId('account-menu').click();
	await expect(page.getByTestId('nav-atelier')).toHaveText('Ателье проверки');
	await page.getByTestId('account-link').click();
	await expect(page).toHaveURL(/\/account$/);
	await expect(page.getByTestId('logout')).toBeHidden();
});

test('a new order started in the registry stays in orders', async ({ page }) => {
	await page.goto('/orders');
	await page.getByTestId('orders-model').selectOption('skirt');
	await page.getByTestId('orders-new').click();
	await expect(page).toHaveURL(/\/pattern\/skirt\?new=1&from=\/orders/);
	await expect(page.getByTestId('nav-orders')).toHaveAttribute('aria-current', 'page');
});

test('the from-scratch constructor lives among the bases', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('open-custom').click();
	await expect(page).toHaveURL(/\/pattern\/custom$/);
	await expect(page.getByTestId('nav-catalog')).toHaveAttribute('aria-current', 'page');
	await page.getByTestId('crumbs-back').click();
	await expect(page).toHaveURL(/\/$/);
});

test('the client of an order opens from the pattern', async ({ page }) => {
	const client = await apiCreateClient(page, 'Клиентка из лекала');
	await apiProject(page, 'nav-card', { name: 'Юбка клиентки', model: 'skirt', clientId: client.id });
	await page.goto('/pattern/skirt?project=nav-card');
	await expect(page.getByTestId('project-client')).toHaveValue(client.id);
	await page.getByTestId('project-client-card').click();
	await expect(page).toHaveURL(new RegExp(`/clients/${client.id}$`));
});
