import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('own design can be edited, undone, saved, reopened and exported',async({page},info)=>{
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('my-designs').locator('summary').click();
 await page.locator('#project-base').selectOption('tee');
 await page.getByRole('button',{name:'Создать модель',exact:true}).click();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.locator('#project-name').fill('Футболка для Анны');
 await page.locator('#project-name').blur();
 await page.getByTestId('measurement-bust').fill('110');
 await page.getByTestId('measurement-bust').blur();
 await page.getByTestId('project-undo').click();
 await expect(page.getByTestId('measurement-bust')).toHaveValue('96');
 await page.getByTestId('project-redo').click();
 await expect(page.getByTestId('measurement-bust')).toHaveValue('110');
 await page.getByTestId('param-fit').selectOption('loose');
 await expect(page.getByTestId('project-save')).toBeEnabled();
 await page.getByTestId('project-save').click();
 await expect(page.getByTestId('project-status')).toContainText('Модель сохранена');
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Скачать проект JSON'}).click();
 const download=await downloadPromise;
 const raw=await readFile((await download.path())!,'utf8');
 const project=JSON.parse(raw);
 expect(project.measurements.bust).toBe(110);expect(project.params.fit).toBe('loose');
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('my-designs').locator('summary').click();
 await page.getByRole('link',{name:'Футболка для Анны',exact:true}).click();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await expect(page.getByTestId('measurement-bust')).toHaveValue('110');
 await expect(page.getByTestId('param-fit')).toHaveValue('loose');
 await expect(page.locator('#project-name')).toHaveValue('Футболка для Анны');
 await page.screenshot({path:info.outputPath('own-design.png')});
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('my-designs').locator('summary').click();
 await page.getByTestId('project-import').setInputFiles({name:'model.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 await expect(page.getByRole('link',{name:'Футболка для Анны',exact:true})).toHaveCount(2);
});

test('invalid project import cannot overwrite saved designs',async({page})=>{
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('my-designs').locator('summary').click();
 await page.getByTestId('project-import').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"model":"tee","name":"bad"}')});
 await expect(page.getByRole('alert')).toContainText('недопустимые данные');
 expect(await page.evaluate(()=>localStorage.getItem('shityo.design-projects.v1'))).toBeNull();
});

test('construction point edits affect geometry and can be reset',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByText('Моделирование конструкции',{exact:true}).click();
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
 await page.locator('#project-name').fill('Первая версия');await page.locator('#project-name').blur();
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/generate',async route=>{await gate;await route.continue();});
 const request=page.waitForRequest('**/api/generate');
 await page.getByTestId('project-save').click();await request;
 await page.locator('#project-name').fill('Новая версия');await page.locator('#project-name').blur();
 release();
 await expect(page.getByTestId('project-status')).toContainText('изменилась во время проверки');
 expect(await page.evaluate(()=>localStorage.getItem('shityo.design-projects.v1'))).toBeNull();
});

test('JSON backup remains available when drafting service is offline',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.locator('#project-name').fill('Оффлайн модель');await page.locator('#project-name').blur();
 await page.route('**/api/generate',route=>route.abort());
 await page.getByTestId('measurement-bust').fill('110');await page.getByTestId('measurement-bust').blur();
 await expect(page.getByTestId('hidden-errors')).toContainText('Ошибки: 1');
 await expect(page.getByTestId('project-save')).toBeDisabled();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Скачать проект JSON'}).click();
 const download=await downloadPromise;
 const project=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(project.name).toBe('Оффлайн модель');expect(project.measurements.bust).toBe(110);
});

test('switching drafting blocks cannot overwrite the previous project',async({page})=>{
 await page.goto('/pattern/tee?new=1');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.locator('#project-name').fill('Исходная футболка');await page.locator('#project-name').blur();
 await page.getByTestId('project-save').click();
 await expect(page.getByTestId('project-status')).toContainText('Модель сохранена');
 await page.getByTestId('model-switch').selectOption('shirt');
 await expect(page).toHaveURL(/\/pattern\/shirt$/);
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('project-panel').locator('summary').click();
 await page.locator('#project-name').fill('Новая рубашка');await page.locator('#project-name').blur();
 await page.getByTestId('project-save').click();
 await expect(page.getByTestId('project-status')).toContainText('Модель сохранена');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('shityo.design-projects.v1')!));
 expect(saved).toHaveLength(2);
 expect(saved.find((p:{model:string})=>p.model==='tee').name).toBe('Исходная футболка');
 expect(saved.find((p:{model:string})=>p.model==='shirt').name).toBe('Новая рубашка');
});
