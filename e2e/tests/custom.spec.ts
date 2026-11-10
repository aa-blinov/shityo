import {test,expect,apiCreateClient,apiSnapshot} from './fixtures';

const piece={id:'piece-1',name:'Деталь',outline:[{x:0,y:0},{x:200,y:0},{x:200,y:300},{x:0,y:300}],cut:1,seam_allowance_mm:10,mirrored:false,notches:[],grainline:null,internal_lines:[]};

test('пользователь собирает выкройку с нуля, сохраняет и экспортирует',async({page})=>{
 await page.goto('/pattern/custom');
 await expect(page.getByTestId('custom-editor')).toBeVisible();
 await expect(page.getByTestId('custom-canvas')).toBeVisible();
 await expect(page.getByTestId('custom-piece-piece-1')).toBeVisible();

 await page.getByRole('button',{name:'Добавить деталь',exact:true}).click();
 await expect(page.getByTestId('custom-piece-piece-2')).toBeVisible();

 await page.locator('#custom-name').fill('Пробная выкройка');
 await page.locator('#custom-name').blur();
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(page.getByText('Выкройка сохранена.')).toBeVisible();

 const response=await page.request.post('/api/custom/export/svg',{data:{pieces:[piece],paper:{page:'A4',orientation:'portrait',calibration:true}}});
 expect(response.ok()).toBeTruthy();
 expect(await response.text()).toContain('<svg');
});

test('деталь подгоняется по меркам клиента',async({page})=>{
 const client=await apiCreateClient(page,'Анна');
 const snapshot=await apiSnapshot(page,client.id,'Основные',{half_hip:50,garment_length:100});
 await page.goto('/pattern/custom');
 await expect(page.getByTestId('custom-editor')).toBeVisible();

 await page.locator('#binding-width').selectOption('half_hip');
 await page.locator('#binding-width-factor').fill('1');
 await page.locator('#binding-width-factor').blur();
 await page.locator('#binding-height').selectOption('garment_length');
 await page.locator('#binding-height-factor').fill('1');
 await page.locator('#binding-height-factor').blur();

 await page.locator('#custom-client').selectOption(client.id);
 await page.locator('#custom-client-snapshot').selectOption(snapshot.id);
 await page.getByRole('button',{name:'Подогнать по меркам',exact:true}).click();
 await expect(page.getByText('Детали подогнаны по меркам клиента.')).toBeVisible();
 await expect(page.getByText('Сейчас: 50.0 × 100.0 см')).toBeVisible();
});

test('сервер отклоняет контур с нулевой площадью',async({request})=>{
 const response=await request.post('/api/custom/generate',{data:{pieces:[{...piece,outline:[{x:0,y:0},{x:10,y:0},{x:20,y:0}]}]}});
 expect(response.status()).toBe(400);
 expect(await response.text()).toContain('Площадь');
});

test('основа переносится в конструктор со срезами и сверкой швов', async ({ page }) => {
	await page.goto('/pattern/shirt');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('section-pieces').locator('summary').click();
	await page.getByTestId('open-in-custom').click();
	await expect(page).toHaveURL(/\/pattern\/custom\?project=/);
	await expect(page.getByTestId('custom-piece-front')).toBeVisible();
	await expect(page.getByTestId('custom-piece-collar-stand')).toBeVisible();
	// Бок, плечо, окат против двух пройм, стойка против горловины, отлёт против стойки.
	const seams = page.getByTestId('custom-seam');
	await expect(seams).toHaveCount(5);
	// Основа проверена: все пары сходятся, задуманная посадка перенесена.
	for (const diff of await page.getByTestId('custom-seam-diff').allTextContents()) expect(diff).toBe('сходится');
	await expect(page.getByTestId('custom-dart').first()).toBeAttached();
	// Сервер принимает перенесённые детали: вытачки, сгиб, петли.
	await page.getByRole('button', { name: 'Проверить на сервере', exact: true }).click();
	await expect(page.getByText('Сервер принял геометрию.')).toBeVisible();
});

test('конструктор отменяет и повторяет правки', async ({ page }) => {
	await page.goto('/pattern/custom');
	await expect(page.getByTestId('custom-editor')).toBeVisible();
	await page.getByTestId('custom-add-piece').click();
	await expect(page.getByTestId('custom-piece-piece-2')).toBeVisible();
	await page.getByTestId('custom-undo').click();
	await expect(page.getByTestId('custom-piece-piece-2')).toHaveCount(0);
	await page.getByTestId('custom-redo').click();
	await expect(page.getByTestId('custom-piece-piece-2')).toBeVisible();
	await page.locator('body').press('Control+z');
	await expect(page.getByTestId('custom-piece-piece-2')).toHaveCount(0);
});

test('вытачка уменьшает срез, сверка это показывает, сгиб ложится на вертикаль', async ({ page }) => {
	await page.goto('/pattern/custom');
	await expect(page.getByTestId('custom-editor')).toBeVisible();
	const points = page.locator('.point-list button');
	const addEdge = async (from: number, to: number, label: string) => {
		await page.locator('#edge-label').fill(label);
		await page.locator('#edge-from').fill(String(from));
		await page.locator('#edge-from').blur();
		await page.locator('#edge-to').fill(String(to));
		await page.locator('#edge-to').blur();
		await page.getByTestId('custom-add-edge').click();
	};
	// Верх первой детали - срез 60 см.
	await addEdge(1, 2, 'верх');
	await page.getByTestId('custom-add-piece').click();
	await addEdge(1, 2, 'верх');
	await page.locator('#seam-a').selectOption({ index: 1 });
	await page.locator('#seam-b').selectOption({ index: 2 });
	await page.getByTestId('custom-add-seam').click();
	await expect(page.getByTestId('custom-seam-diff')).toHaveText('сходится');

	// Вытачка 2 см посередине верха второй детали.
	await points.nth(0).click();
	await page.getByRole('button', { name: 'Добавить точку', exact: true }).click();
	await page.locator('#dart-width').fill('2');
	await page.locator('#dart-width').blur();
	await page.getByTestId('custom-add-dart').click();
	await expect(page.getByTestId('custom-piece-piece-2').getByTestId('custom-dart')).toBeAttached();
	await expect(page.getByTestId('custom-seam-diff')).toHaveText('расхождение 2.0 см');

	// Сгиб по левому краю: последняя точка и первая стоят одна под другой.
	await points.last().click();
	await page.getByTestId('custom-add-fold').click();
	await expect(page.getByTestId('custom-piece-piece-2').getByTestId('custom-fold')).toBeAttached();
	await points.nth(1).click();
	await page.getByTestId('custom-add-fold').click();
	await expect(page.getByRole('alert')).toContainText('вертикальному');
});

test('выкройка из основы собирается в 3D так же, как основа', async ({ page }) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/pattern/skirt?cloth=cpu');
	await expect(page.locator('.workspace')).toHaveAttribute('data-ready', 'true');
	await page.getByTestId('toggle-3d').click();
	const block = page.getByTestId('preview-3d');
	await expect(block).toHaveAttribute('data-settled', 'true', { timeout: 45_000 });
	const blockExtent = (await block.getAttribute('data-extent'))!.split(',').map(Number);
	await page.getByTestId('toggle-2d').click();
	await page.getByTestId('section-pieces').locator('summary').click();
	await page.getByTestId('open-in-custom').click();
	await expect(page).toHaveURL(/\/pattern\/custom\?project=/);
	await page.getByTestId('custom-3d').click();
	const preview = page.getByTestId('preview-3d');
	await expect(preview).toHaveAttribute('data-settled', 'true', { timeout: 45_000 });
	const extent = (await preview.getAttribute('data-extent'))!.split(',').map(Number);
	// Та же сборка: габариты совпадают в пределах 3 см.
	extent.forEach((v, i) => expect(Math.abs(v - blockExtent[i]), `extent ${i}`).toBeLessThan(30));
	expect(errors).toEqual([]);
});

test('поле конструктора приближается и возвращается к виду целиком', async ({ page }) => {
	await page.goto('/pattern/custom');
	await expect(page.getByTestId('custom-editor')).toBeVisible();
	await page.getByTestId('custom-zoom-in').click();
	await expect(page.getByTestId('custom-zoom')).toHaveText('125%');
	await page.getByTestId('custom-canvas').hover();
	await page.mouse.wheel(0, -200);
	await expect(page.getByTestId('custom-zoom')).not.toHaveText('125%');
	await page.getByTestId('custom-zoom-fit').click();
	await expect(page.getByTestId('custom-zoom')).toHaveText('100%');
});
