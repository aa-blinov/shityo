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

test('сервер отклоняет контур с нулевой площадью',async({request})=>{
 const response=await request.post('/api/custom/generate',{data:{pieces:[{...piece,outline:[{x:0,y:0},{x:10,y:0},{x:20,y:0}]}]}});
 expect(response.status()).toBe(400);
 expect(await response.text()).toContain('Площадь');
});
