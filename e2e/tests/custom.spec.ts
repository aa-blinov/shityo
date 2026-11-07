import {test,expect} from '@playwright/test';

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
 await page.addInitScript(()=>{
  localStorage.setItem('shityo.clients.v1',JSON.stringify({
   clients:[{id:'11111111-1111-4111-8111-111111111111',name:'Анна',notes:'',createdAt:'2026-01-01T00:00:00.000Z'}],
   snapshots:[{id:'22222222-2222-4222-8222-222222222222',clientId:'11111111-1111-4111-8111-111111111111',label:'Основные',createdAt:'2026-01-01T00:00:00.000Z',values:{half_hip:50,garment_length:100}}]
  }));
  localStorage.removeItem('shityo.custom-projects.v1');
 });
 await page.goto('/pattern/custom');
 await expect(page.getByTestId('custom-editor')).toBeVisible();

 await page.locator('#binding-width').selectOption('half_hip');
 await page.locator('#binding-width-factor').fill('1');
 await page.locator('#binding-width-factor').blur();
 await page.locator('#binding-height').selectOption('garment_length');
 await page.locator('#binding-height-factor').fill('1');
 await page.locator('#binding-height-factor').blur();

 await page.locator('#custom-client').selectOption('11111111-1111-4111-8111-111111111111');
 await page.locator('#custom-client-snapshot').selectOption('22222222-2222-4222-8222-222222222222');
 await page.getByRole('button',{name:'Подогнать по меркам',exact:true}).click();
 await expect(page.getByText('Детали подогнаны по меркам клиента.')).toBeVisible();
 await expect(page.getByText('Сейчас: 50.0 × 100.0 см')).toBeVisible();
});

test('сервер отклоняет контур с нулевой площадью',async({request})=>{
 const response=await request.post('/api/custom/generate',{data:{pieces:[{...piece,outline:[{x:0,y:0},{x:10,y:0},{x:20,y:0}]}]}});
 expect(response.status()).toBe(400);
 expect(await response.text()).toContain('Площадь');
});
