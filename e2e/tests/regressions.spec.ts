import { test, expect } from '@playwright/test';
for (const model of ['tee','shirt','trousers','skirt']) {
 test(`3D ${model}: rebuild and dispose`, async ({page},testInfo) => {
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.goto(`/pattern/${model}`);
  await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
  const toggle=page.getByTestId('toggle-3d');
  await toggle.click();
  await expect(page.locator('[data-testid="preview-3d"] canvas')).toHaveCount(1);
  await page.waitForTimeout(1000);
  const input=page.getByTestId(model==='skirt'||model==='trousers'?'measurement-waist':'measurement-bust');
  await input.fill('105'); await input.blur();
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-testid="preview-3d"] canvas')).toHaveCount(1);
  await page.screenshot({path:testInfo.outputPath(`${model}-3d.png`)});
  const preview=page.getByTestId('preview-3d');
  await preview.screenshot({path:testInfo.outputPath(`${model}-front.png`)});
  const box=(await preview.locator('canvas').boundingBox())!;
  const orbit=async(delta:number)=>{
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
   await page.mouse.down();
   await page.mouse.move(box.x+box.width/2+delta,box.y+box.height/2,{steps:15});
   await page.mouse.up();await page.waitForTimeout(100);
  };
  await orbit(box.height/8);
  await preview.screenshot({path:testInfo.outputPath(`${model}-quarter.png`)});
  await orbit(box.height*3/8);
  await preview.screenshot({path:testInfo.outputPath(`${model}-back.png`)});
  for(let i=0;i<3;i++){ await toggle.click(); await toggle.click(); }
  await expect(page.locator('[data-testid="preview-3d"] canvas')).toHaveCount(1);
  await expect(page.locator('.preview .error')).toHaveCount(0);
  expect(errors).toEqual([]);
 });
}

test('late generation cannot overwrite the latest measurement',async({page})=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.route('**/api/generate',async route=>{
  const body=route.request().postDataJSON();
  const response=await route.fetch();
  if(body.measurements.bust===110) await new Promise(r=>setTimeout(r,1400));
  await route.fulfill({response});
 });
 const input=page.getByTestId('measurement-bust');
 const firstRequest = page.waitForRequest(r=>r.url().endsWith('/api/generate') && r.postDataJSON().measurements.bust===110);
 await input.fill('110');await input.blur();
 await firstRequest;
 const latestResponse = page.waitForResponse(r=>r.url().endsWith('/api/generate') && r.request().postDataJSON().measurements.bust===120);
 await input.fill('120');await input.blur();
 await latestResponse;
 await expect(page.getByTestId('front-width')).toContainText('64');
 const width=(await page.getByTestId('front-width').textContent())??'';
 await page.waitForTimeout(1700);
 await expect(page.getByTestId('front-width')).toHaveText(width);
});

test('API validation errors remain visible',async({page})=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.route('**/api/generate',r=>r.fulfill({status:422,contentType:'application/json',body:JSON.stringify({detail:'regression invalid input'})}));
 await page.getByTestId('measurement-bust').fill('110');
 await page.getByTestId('measurement-bust').blur();
 await expect(page.getByText(/regression invalid input/).first()).toBeVisible();
 await expect(page.getByTestId('fixture-badge')).toHaveCount(0);
});


test('3D studio works on a narrow viewport',async({page},testInfo)=>{
 await page.setViewportSize({width:834,height:1194});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.locator('[data-testid="toggle-3d"]').evaluate((el) => (el as HTMLElement).click());
 const preview=page.getByTestId('preview-3d');
 await expect(preview.locator('canvas')).toHaveCount(1);
 await preview.scrollIntoViewIfNeeded();
 await page.waitForTimeout(1200);
 const box=(await preview.boundingBox())!;
 expect(box.width).toBeLessThanOrEqual(834);
 expect(box.height).toBeGreaterThanOrEqual(420);
 await preview.screenshot({path:testInfo.outputPath('studio-mobile.png')});
 await expect(preview.locator('.error')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('3D fabric: measured stretch and weight rebuild the drape', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 const errors: string[] = [];
 page.on('pageerror', (e) => errors.push(e.message));
 await page.goto('/pattern/hoodie');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
 await page.getByTestId('toggle-3d').click();
 const panel = page.getByTestId('fabric-panel');
 // Худи шьют из трикотажа: класс и его типовые параметры выбраны сами.
 await expect(panel.getByTestId('fabric-knit')).toHaveAttribute('aria-pressed', 'true');
 await expect(panel.getByTestId('fabric-stretch')).toHaveValue('15');
 await panel.getByTestId('fabric-heavy').click();
 await expect(panel.getByTestId('fabric-stretch')).toHaveValue('3');
 await expect(panel.getByTestId('fabric-weight')).toHaveValue('400');
 await panel.getByTestId('fabric-stretch').fill('30');
 await panel.getByTestId('fabric-stretch').blur();
 await expect(page.locator('[data-testid="preview-3d"] canvas')).toHaveCount(1);
 await page.waitForTimeout(1500);
 await expect(page.locator('[data-testid="preview-3d"] canvas')).toHaveCount(1);
 expect(errors).toEqual([]);
});

test('3D fabric: colour and finish repaint without rebuilding the drape', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 const errors: string[] = [];
 page.on('pageerror', (e) => errors.push(e.message));
 await page.goto('/pattern/trousers');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
 await page.getByTestId('toggle-3d').click();
 const preview = page.getByTestId('preview-3d');
 const panel = page.getByTestId('fabric-panel');
 // Брюки - из плотной костюмной: по умолчанию саржа.
 await expect(panel.getByTestId('finish-twill')).toHaveAttribute('aria-pressed', 'true');
 await expect(preview).toHaveAttribute('data-finish', 'twill');
 await preview.locator('canvas').evaluate((c) => c.setAttribute('data-scene', 'first'));
 await panel.getByTestId('colour-navy').click();
 await expect(panel.getByTestId('colour-navy')).toHaveAttribute('aria-pressed', 'true');
 await expect(preview).toHaveAttribute('data-colour', '#2c3a55');
 await panel.getByTestId('finish-check').click();
 await expect(preview).toHaveAttribute('data-finish', 'check');
 // Цвет и фактура перекрашивают ткань, а не пересчитывают драпировку.
 await expect(preview.locator('canvas[data-scene="first"]')).toHaveCount(1);
 await panel.getByTestId('colour-custom').fill('#aa3300');
 await expect(preview).toHaveAttribute('data-colour', '#aa3300');
 // Выбор переживает перезагрузку: швея сравнивает варианты ткани.
 await page.reload();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
 await page.getByTestId('toggle-3d').click();
 await expect(page.getByTestId('preview-3d')).toHaveAttribute('data-colour', '#aa3300');
 await expect(page.getByTestId('preview-3d')).toHaveAttribute('data-finish', 'check');
 expect(errors).toEqual([]);
});

// Прокручивается только основная область, сама страница - нет: иначе
// появляется второй скролл (так было из-за скрытого поля импорта файла).
test('pages scroll inside the main area only, without a second scrollbar', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	for (const url of ['/#bases', '/account', '/guide', '/pattern/tee']) {
		await page.goto(url);
		await page.waitForLoadState('networkidle');
		const size = await page.evaluate(() => ({ document: document.documentElement.scrollHeight, viewport: innerHeight }));
		expect(size.document, `${url}: document scrolls`).toBeLessThanOrEqual(size.viewport + 1);
	}
});
