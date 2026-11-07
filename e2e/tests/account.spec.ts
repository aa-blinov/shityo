import {test,expect} from '@playwright/test';

test('личный кабинет сохраняет профиль и показывает сводку',async({page})=>{
 await page.goto('/account');
 await expect(page.getByRole('heading',{name:'Личный кабинет'})).toBeVisible();
 await page.locator('#account-name').fill('Мария');
 await page.locator('#account-organization').fill('Ателье Марии');
 await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.getByText('Профиль сохранён.')).toBeVisible();
 await page.reload();
 await expect(page.locator('#account-name')).toHaveValue('Мария');
 await expect(page.locator('#account-organization')).toHaveValue('Ателье Марии');
 await expect(page.getByText('Сводка')).toBeVisible();
});

test('главная не предлагает тарифы и ведёт в кабинет',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Тарифы'})).toHaveCount(0);
 await page.getByTestId('account-link').click();
 await expect(page).toHaveURL(/\/account/);
});
