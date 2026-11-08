import { test, expect } from '@playwright/test';

test('a term in the editor explains itself and leads to the guide', async ({ page }) => {
	await page.goto('/pattern/tee');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	const term = page.getByTestId('term-razmer');
	await term.hover();
	await expect(page.getByRole('tooltip')).toContainText('справочнике');
	// Справочник открывается в новой вкладке: правки в мастерской не теряются.
	const [guide] = await Promise.all([page.context().waitForEvent('page'), term.click()]);
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
