import { test, expect } from '@playwright/test';

/**
 * Каждое сочетание из справки работает. Мастер работает с клавиатуры, и
 * заявленная, но не работающая клавиша хуже, чем никакой.
 */
test('every shortcut listed in the help works', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/pattern/tee?new=1');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('start-skip').click();
	const canvas = page.getByTestId('pattern-canvas');
	await canvas.click({ position: { x: 5, y: 5 } });

	// ? - справка, Esc - закрыть.
	await page.keyboard.press('Shift+Slash');
	await expect(page.getByTestId('keys-dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('keys-dialog')).toHaveCount(0);

	// Кнопка клавиш справа вверху открывает ту же справку.
	await page.getByTestId('keys-toolbar').click();
	await expect(page.getByTestId('keys-dialog')).toBeVisible();
	await page.keyboard.press('Escape');

	// [ и ] - панели, \ - только чертёж.
	await expect(page.getByTestId('measure-panel')).toBeVisible();
	await page.keyboard.press('BracketLeft');
	await expect(page.getByTestId('measure-panel')).toHaveCount(0);
	await page.keyboard.press('BracketLeft');
	await expect(page.getByTestId('measure-panel')).toBeVisible();
	await expect(page.getByTestId('seam-inspector')).toBeVisible();
	await page.keyboard.press('BracketRight');
	await expect(page.getByTestId('seam-inspector')).toHaveCount(0);
	await page.keyboard.press('BracketRight');
	await page.keyboard.press('Backslash');
	await expect(page.locator('.side:not(.closed)')).toHaveCount(0);
	await page.keyboard.press('Backslash');
	await expect(page.locator('.side:not(.closed)')).toHaveCount(2);

	// 3 и 2 - примерка и чертёж.
	await page.keyboard.press('Digit3');
	await expect(page.getByTestId('toggle-3d')).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Digit2');
	await expect(page.getByTestId('toggle-2d')).toHaveAttribute('aria-pressed', 'true');

	// Ctrl+Z / Ctrl+Shift+Z - отмена и повтор правки мерки.
	const bust = page.getByTestId('measurement-bust');
	const before = await bust.inputValue();
	await bust.fill('110');
	await bust.blur();
	await expect(bust).toHaveValue('110');
	// Правка применяется после короткой паузы ввода - ждём, пока проект её увидит.
	await expect(page.getByTestId('project-undo')).toBeEnabled();
	await canvas.click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('Control+z');
	await expect(bust).toHaveValue(before);
	await page.keyboard.press('Control+Shift+z');
	await expect(bust).toHaveValue('110');

	// Отмена и повтор - иконки рядом с «Сохранить».
	await page.getByTestId('project-undo').click();
	await expect(bust).toHaveValue(before);
	await page.getByTestId('project-redo').click();
	await expect(bust).toHaveValue('110');

	// Ctrl+S сохраняет, Ctrl+P открывает печать.
	await page.locator('#project-name').fill('Клавиши');
	await page.locator('#project-name').blur();
	await page.keyboard.press('Control+s');
	await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
	await page.keyboard.press('Control+p');
	await expect(page.getByTestId('print-open')).toBeVisible();
});

test('single-key shortcuts do not fire while typing in a field', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/pattern/tee');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.locator('#project-name').fill('Платье [2]');
	await expect(page.getByTestId('measure-panel')).toBeVisible();
	await expect(page.getByTestId('toggle-2d')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#project-name')).toHaveValue('Платье [2]');
});

test('shortcuts work on the Russian keyboard layout', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/pattern/tee');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	// В русской раскладке клавиша S даёт «ы», [ - «х», а ? набирается Shift+7.
	const press = (key: string, code: string, extra: Record<string, boolean> = {}) =>
		page.evaluate(
			([k, c, e]) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: c, bubbles: true, cancelable: true, ...e })),
			[key, code, extra] as const
		);
	await press('х', 'BracketLeft');
	await expect(page.getByTestId('measure-panel')).toHaveCount(0);
	await press('х', 'BracketLeft');
	await expect(page.getByTestId('measure-panel')).toBeVisible();
	await press('?', 'Digit7', { shiftKey: true });
	await expect(page.getByTestId('keys-dialog')).toBeVisible();
	await press('Escape', 'Escape');
	await expect(page.getByTestId('keys-dialog')).toHaveCount(0);
	await press('р', 'KeyH', { ctrlKey: true });
	await press('з', 'KeyP', { ctrlKey: true });
	await expect(page.getByTestId('print-open')).toBeVisible();
});
