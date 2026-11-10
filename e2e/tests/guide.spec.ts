import { test, expect } from './fixtures';

test('a term in the editor explains itself and leads to the guide', async ({ page }) => {
	await page.goto('/pattern/tee');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	const term = page.getByTestId('term-razmer');
	await term.hover();
	await expect(page.getByRole('tooltip')).toBeVisible();
	// Щелчок открывает определение на месте, без ухода со страницы.
	await term.click();
	const card = page.getByTestId('term-card');
	await expect(card).toBeVisible();
	await expect(page).toHaveURL(/\/pattern\/tee/);
	await page.keyboard.press('Escape');
	await expect(card).toBeHidden();
	await term.click();
	// Полная статья - явной ссылкой в новой вкладке: правки в мастерской не теряются.
	const [guide] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId('term-more').click()]);
	await guide.waitForLoadState();
	await expect(guide).toHaveURL(/\/guide#razmer$/);
	await expect(guide.locator('#razmer')).toHaveClass(/active/);
	await expect(guide.locator('#razmer .source')).toHaveAttribute('href', /^https?:\/\//);
});

test('the guide searches definitions and every entry has a source', async ({ page }) => {
	await page.goto('/guide');
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
	const entries = page.getByTestId('guide-entry');
	expect(await entries.count()).toBeGreaterThan(50);
	for (const href of await page.locator('.card .source').evaluateAll((a) => a.map((e) => e.getAttribute('href')))) {
		expect(href).toMatch(/^https?:\/\//);
	}
	await page.getByTestId('guide-search').fill('окат');
	await expect(entries.first()).toBeVisible();
	expect(await entries.count()).toBeLessThan(10);
	await page.getByTestId('nav-guide').click();
	await expect(page).toHaveURL(/\/guide/);
});

test('block passports show every block passing its checks', async ({ page }) => {
	await page.goto('/guide');
	await page.getByTestId('guide-blocks').click();
	await expect(page).toHaveURL(/\/guide\/blocks$/);
	await expect(page.getByTestId('nav-guide')).toHaveAttribute('aria-current', 'page');
	const blocks = page.locator('details.block');
	await expect(blocks).toHaveCount(16, { timeout: 30_000 });
	await expect(page.locator('details.block[data-ok="false"]')).toHaveCount(0);
	await page.getByTestId('block-dress').locator('summary').click();
	await expect(page.getByTestId('block-dress')).toContainText('седьмого шейного позвонка');
});
