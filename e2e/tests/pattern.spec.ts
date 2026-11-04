import { expect, test } from '@playwright/test';

/**
 * Сценарий пользователя: открыть приложение, выбрать модель, задать мерки,
 * увидеть перестроенные лекала, скачать экспорт.
 */
test('пользователь собирает футболку по меркам', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');

  // Каталог моделей.
  await expect(page.getByRole('heading', { name: /каталог/i })).toBeVisible();
  const teeCard = page.getByTestId('model-card-tee');
  await expect(teeCard).toBeVisible();
  await teeCard.getByRole('link').click();

  await expect(page).toHaveURL(/\/pattern\/tee/);

  // Детали отрисованы: у каждой детали есть контур в SVG.
  const piecePaths = page.locator('svg[data-testid="pattern-canvas"] g.piece path.cut');
  await expect(piecePaths.first()).toBeVisible();
  expect(await piecePaths.count()).toBeGreaterThanOrEqual(3);

  const pieceCount = await page.getByTestId('piece-item').count();
  expect(pieceCount).toBeGreaterThanOrEqual(3);

  // Меняем обхват груди - ширина детали должна вырасти.
  const before = await page.getByTestId('front-width').innerText();
  await page.getByTestId('measurement-bust').fill('110');
  await page.getByTestId('measurement-bust').blur();
  await page.waitForTimeout(800);
  const after = await page.getByTestId('front-width').innerText();
  expect(after).not.toBe(before);

  // Размерная сетка доступна.
  await expect(page.getByTestId('size-grid')).toBeVisible();

  // Экспорт SVG отдаётся сервером.
  const response = await page.request.get('/api/export/tee.svg');
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain('<svg');
});

test('сервер отдаёт каталог и сгенерированные лекала', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBeTruthy();

  const catalog = await request.get('/api/catalog');
  expect(catalog.ok()).toBeTruthy();
  const items = (await catalog.json()).items as { id: string }[];
  expect(items.map((i) => i.id)).toContain('tee');

  const generated = await request.post('/api/generate', {
    data: { model: 'tee', measurements: {}, params: {} },
  });
  expect(generated.ok()).toBeTruthy();
  const body = await generated.json();
  expect(body.pieces.length).toBeGreaterThanOrEqual(3);
  expect(body.units).toBe('mm');
});
