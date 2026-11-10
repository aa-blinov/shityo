import {test,expect,apiProjects} from './fixtures';
import {readFile} from 'node:fs/promises';

test('own design can be edited, undone, saved, reopened and exported',async({page},info)=>{
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('create-tee').click();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('start-skip').click();
 await page.locator('#project-name').fill('Футболка для Анны');
 await page.locator('#project-name').blur();
 const originalBust=await page.getByTestId('measurement-bust').inputValue();
 await page.getByTestId('measurement-bust').fill('110');
 await page.getByTestId('measurement-bust').blur();
 await page.getByTestId('project-undo').click();
 await expect(page.getByTestId('measurement-bust')).toHaveValue(originalBust);
 await page.getByTestId('project-redo').click();
 await expect(page.getByTestId('measurement-bust')).toHaveValue('110');
 await page.getByTestId('preset-loose').click();
 await expect(page.getByTestId('project-save')).toBeEnabled();
 await page.getByTestId('project-save').click();
 await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
 const downloadPromise=page.waitForEvent('download');
 await page.getByTestId('project-export').click();
 const download=await downloadPromise;
 const raw=await readFile((await download.path())!,'utf8');
 const project=JSON.parse(raw);
 expect(project.measurements.bust).toBe(110);expect(project.params.fit).toBe('loose');
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByRole('link',{name:'Футболка для Анны',exact:true}).click();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await expect(page.getByTestId('measurement-bust')).toHaveValue('110');
 await expect(page.getByTestId('preset-loose')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#project-name')).toHaveValue('Футболка для Анны');
 await page.screenshot({path:info.outputPath('own-design.png')});
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('project-import').setInputFiles({name:'model.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 await expect(page.getByRole('link',{name:'Футболка для Анны',exact:true})).toHaveCount(2);
});

test('invalid project import cannot overwrite saved designs',async({page})=>{
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('project-import').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"model":"tee","name":"bad"}')});
 await expect(page.getByRole('alert')).toContainText('недопустимые данные');
 expect(await apiProjects(page)).toHaveLength(0);
});

test('construction point edits affect geometry and can be reset',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('start-skip').click();
 await page.getByTestId('section-shape').locator('summary').click();
 const input=page.locator('#shape-armhole_depth');
 const original=Number(await input.inputValue());
 const path=page.locator('g[data-piece-id="front"] path.cut');const before=await path.getAttribute('d');
 await input.fill(String(original+.5));await input.blur();
 await expect(path).not.toHaveAttribute('d',before!);
 await expect(page.getByTestId('project-undo')).toBeEnabled();
 await page.getByRole('button',{name:'Сбросить правки точек'}).click();
 await expect(path).toHaveAttribute('d',before!);
});

test('renaming during validation cannot save a stale project name',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('start-skip').click();
 await page.locator('#project-name').fill('Первая версия');await page.locator('#project-name').blur();
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/generate',async route=>{await gate;await route.continue();});
 const request=page.waitForRequest('**/api/generate');
 await page.getByTestId('project-save').click();await request;
 await page.locator('#project-name').fill('Новая версия');await page.locator('#project-name').blur();
 release();
 await expect(page.getByTestId('project-status')).toContainText('изменилась во время проверки');
 expect(await apiProjects(page)).toHaveLength(0);
});

test('JSON backup remains available when drafting service is offline',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('start-skip').click();
 await page.locator('#project-name').fill('Оффлайн модель');await page.locator('#project-name').blur();
 await page.route('**/api/generate',route=>route.abort());
 await page.getByTestId('measurement-bust').fill('110');await page.getByTestId('measurement-bust').blur();
 await page.getByTestId('toggle-inspector').click();
 await expect(page.getByTestId('hidden-errors')).toContainText('Ошибки: 1');
 await expect(page.getByTestId('project-save')).toBeDisabled();
 const downloadPromise=page.waitForEvent('download');
 await page.getByTestId('project-export').click();
 const download=await downloadPromise;
 const project=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(project.name).toBe('Оффлайн модель');expect(project.measurements.bust).toBe(110);
});

test('switching drafting blocks cannot overwrite the previous project',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('start-skip').click();
 await page.locator('#project-name').fill('Исходная футболка');await page.locator('#project-name').blur();
 await page.getByTestId('project-save').click();
 await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
 await page.goto('/pattern/shirt');
 await expect(page).toHaveURL(/\/pattern\/shirt$/);
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.locator('#project-name').fill('Новая рубашка');await page.locator('#project-name').blur();
 await page.getByTestId('project-save').click();
 await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
 const saved=await apiProjects(page);
 expect(saved).toHaveLength(2);
 expect(saved.find((p:{model:string})=>p.model==='tee').name).toBe('Исходная футболка');
 expect(saved.find((p:{model:string})=>p.model==='shirt').name).toBe('Новая рубашка');
});


test('PDF/SVG/DXF files can be attached, saved, restored and deleted',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('start-skip').click();
 await page.locator('#project-name').fill('Файловая модель');await page.locator('#project-name').blur();
 const svg=Buffer.from('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"></svg>');
 await page.getByTestId('project-file-input').setInputFiles({name:'pattern.svg',mimeType:'image/svg+xml',buffer:svg});
 await expect(page.getByTestId('project-files')).toContainText('pattern.svg');
 await page.getByTestId('project-save').click();
 await expect(page.getByTestId('project-status')).toContainText('Проект сохранён');
 const downloadPromise=page.waitForEvent('download');
 await page.getByTestId('project-export').click();
 const download=await downloadPromise;
 const project=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(project.files).toHaveLength(1);
 expect(project.files[0].name).toBe('pattern.svg');
 expect(project.files[0].dataUrl).toMatch(/^data:image\/svg\+xml;/);
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByRole('link',{name:'Файловая модель',exact:true}).click();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 // Сохранённый проект открывается с панелью подгонки; файлы - в панели проверки.
 await page.getByTestId('toggle-inspector').click();
 await page.getByTestId('section-files').locator('summary').click();
 await expect(page.getByTestId('project-files')).toContainText('pattern.svg');
 await page.getByTestId('project-file-delete').click();
 await expect(page.getByTestId('project-files')).toContainText('Нет прикреплённых файлов');
 await page.getByTestId('project-save').click();
 await page.reload();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('toggle-inspector').click();
 await expect(page.getByTestId('project-files')).toContainText('Нет прикреплённых файлов');
});
