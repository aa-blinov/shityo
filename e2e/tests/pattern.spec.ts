import { expect, test } from './fixtures';

/**
 * Сценарий пользователя: открыть приложение, выбрать модель, задать мерки,
 * увидеть перестроенные лекала, скачать экспорт.
 */
test('пользователь собирает футболку по меркам', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');

  // Главная страница с базовыми конструкциями.
  await expect(page.getByRole('heading', { level: 1, name: /конструктор/i })).toBeVisible();
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
  const before = await page.getByTestId('front-width').getAttribute('data-value');
  await page.getByTestId('measurement-bust').fill('110');
  await page.getByTestId('measurement-bust').blur();
  await page.waitForTimeout(800);
  const after = await page.getByTestId('front-width').getAttribute('data-value');
  expect(after).not.toBe(before);

  // Размерная сетка доступна.
  await expect(page.getByTestId('size-grid')).toBeVisible();

  // Экспорт SVG отдаётся сервером.
  const response = await page.request.get('/api/export/tee.svg');
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain('<svg');
});

test('пользователь собирает платье-футляр по полуобхватам', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');

  await page.getByTestId('model-card-dress').getByRole('link').click();
  await expect(page).toHaveURL(/\/pattern\/dress/);

  const piecePaths = page.locator('svg[data-testid="pattern-canvas"] g.piece path.cut');
  await expect(piecePaths.first()).toBeVisible();
  expect(await piecePaths.count()).toBeGreaterThanOrEqual(2);

  const pieceCount = await page.getByTestId('piece-item').count();
  expect(pieceCount).toBeGreaterThanOrEqual(2);

  // Меняем полуобхват груди - ширина переда должна вырасти.
  const before = await page.getByTestId('front-width').getAttribute('data-value');
  await page.getByTestId('measurement-half_bust').fill('52');
  await page.getByTestId('measurement-half_bust').blur();
  await page.waitForTimeout(800);
  const after = await page.getByTestId('front-width').getAttribute('data-value');
  expect(after).not.toBe(before);

  await expect(page.getByTestId('size-grid')).toBeVisible();

  const response = await page.request.get('/api/export/dress.svg');
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain('<svg');
});

test('пользователь собирает жилет по полуобхватам', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');

  await page.getByTestId('model-card-vest').getByRole('link').click();
  await expect(page).toHaveURL(/\/pattern\/vest/);

  const piecePaths = page.locator('svg[data-testid="pattern-canvas"] g.piece path.cut');
  await expect(piecePaths.first()).toBeVisible();
  expect(await piecePaths.count()).toBeGreaterThanOrEqual(2);

  const pieceCount = await page.getByTestId('piece-item').count();
  expect(pieceCount).toBeGreaterThanOrEqual(2);

  // Меняем полуобхват груди - ширина переда должна вырасти.
  const before = await page.getByTestId('front-width').getAttribute('data-value');
  await page.getByTestId('measurement-half_bust').fill('52');
  await page.getByTestId('measurement-half_bust').blur();
  await page.waitForTimeout(800);
  const after = await page.getByTestId('front-width').getAttribute('data-value');
  expect(after).not.toBe(before);

  await expect(page.getByTestId('size-grid')).toBeVisible();

  const response = await page.request.get('/api/export/vest.svg');
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain('<svg');
});

test('пользователь собирает пальто по полуобхватам', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');

  await page.getByTestId('model-card-coat').getByRole('link').click();
  await expect(page).toHaveURL(/\/pattern\/coat/);

  const piecePaths = page.locator('svg[data-testid="pattern-canvas"] g.piece path.cut');
  await expect(piecePaths.first()).toBeVisible();
  expect(await piecePaths.count()).toBeGreaterThanOrEqual(4);

  const pieceCount = await page.getByTestId('piece-item').count();
  expect(pieceCount).toBeGreaterThanOrEqual(4);

  // Меняем полуобхват груди - ширина переда должна вырасти.
  const before = await page.getByTestId('front-width').getAttribute('data-value');
  await page.getByTestId('measurement-half_bust').fill('54');
  await page.getByTestId('measurement-half_bust').blur();
  await page.waitForTimeout(800);
  const after = await page.getByTestId('front-width').getAttribute('data-value');
  expect(after).not.toBe(before);

  await expect(page.getByTestId('size-grid')).toBeVisible();

  const response = await page.request.get('/api/export/coat.svg');
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

test('худи собирается с капюшоном, резинками и карманом', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('model-card-hoodie')).toBeVisible();
  await expect(page.getByTestId('model-card-sweatshirt')).toBeVisible();
  await expect(page.getByTestId('model-card-jumper')).toBeVisible();

  await page.goto('/pattern/hoodie');
  await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
  for (const id of ['front', 'back', 'sleeve', 'waistband', 'cuff', 'hood', 'pocket']) {
    await expect(page.locator(`svg[data-testid="pattern-canvas"] g[data-piece-id="${id}"]`)).toHaveCount(1);
  }
  // Ростовые группы ГОСТ: рост выбирается отдельно от размера.
  await expect(page.getByTestId('size-heights').getByRole('button')).toHaveCount(8);
  await expect(page.getByTestId('size-designation')).toContainText('176-100-88');

  const response = await page.request.get('/api/export/hoodie.svg');
  expect(response.ok()).toBeTruthy();
});
