import {test,expect} from '@playwright/test';

test('real library has sections, search and an empty state',async({page},info)=>{
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await expect(page.getByTestId('library-preset')).toHaveCount(85);
 await expect.poll(()=>page.locator('.preview-link img').first().evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
 await page.screenshot({path:info.outputPath('library-catalog.png')});
 await page.locator('#library-section').selectOption('skirts');
 await expect(page.getByTestId('library-preset')).toHaveCount(4);
 await page.locator('#library-section').selectOption('all');
 await page.getByTestId('library-search').fill('Simon');
 await expect(page.getByTestId('library-preset')).toHaveCount(2);
 await page.getByTestId('library-search').fill('несуществующая выкройка');
 await expect(page.getByTestId('library-preset')).toHaveCount(0);
 await page.getByRole('button',{name:'Сбросить поиск'}).click();
 await expect(page.getByTestId('library-preset')).toHaveCount(85);
});

test('Simon opens the real source with original sewn examples',async({page},info)=>{
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('library-search').fill('Simon');
 await page.getByTestId('preset-simon').click();
 await expect(page).toHaveURL(/\/library\/simon/);
 await expect(page.getByRole('heading',{level:1})).toContainText('Simon');
 await expect(page.getByText('Joost De Cock',{exact:true})).toBeVisible();
 const editor=await page.getByTestId('source-draft').getAttribute('href');
 expect(new URL(editor!).hostname).toBe('freesewing.eu');
 expect(decodeURIComponent(editor!)).toContain('"design":"simon"');
 await expect(page.getByTestId('source-example')).toHaveCount(3);
 await expect(page.getByTestId('source-example').first()).toHaveAttribute('href','https://freesewing.eu/showcase/yellow-button-simon/');
 await expect(page.locator('.photo img')).toBeVisible();
 await expect.poll(()=>page.locator('.photo img').evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
 await page.locator('.photo img').evaluate((img:HTMLImageElement)=>img.decode());
 await page.screenshot({path:info.outputPath('library-simon.png')});
 await page.getByTestId('source-example').last().scrollIntoViewIfNeeded();
 await expect.poll(()=>page.locator('.example-photo img').first().evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
 await page.screenshot({path:info.outputPath('library-examples.png')});
});

test('library fits a phone and switches language',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.locator('#library-section').selectOption('dresses');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.locator('.preset').first().scrollIntoViewIfNeeded();
 await expect.poll(()=>page.locator('.preview-link img').first().evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
 await page.locator('.preview-link img').first().evaluate((img:HTMLImageElement)=>img.decode());
 await page.screenshot({path:info.outputPath('library-mobile.png')});
 await page.locator('.settings > summary').click();
 await page.locator('#language-switch').selectOption('en');
 await expect(page.getByRole('heading',{name:'Pattern library',exact:true})).toBeVisible();
 await page.getByTestId('preset-sasha').click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Sasha');
 await expect(page.getByTestId('source-draft')).toContainText('Draft at FreeSewing');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('unknown source design returns 404',async({request})=>{
 expect((await request.get('/library/not-a-real-pattern')).status()).toBe(404);
});

test('search tolerates word order and typos, and filters real publishers',async({page},info)=>{
 await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-hydrated','true');
 await page.getByTestId('library-search').fill('shrit simon');
 await expect(page.getByTestId('library-preset')).toHaveCount(2);
 await page.getByTestId('library-search').fill('РУБАШКИ САЙМОН');
 await expect(page.getByTestId('library-preset')).toHaveCount(2);
 await page.getByTestId('library-search').fill('');
 await page.locator('#library-source').selectOption('tiana');
 await expect(page.getByTestId('library-preset')).toHaveCount(6);
 const thumbnail=page.locator('.preview-link img').first();
 await expect.poll(()=>thumbnail.evaluate((img:HTMLImageElement)=>{
  const selected=img.srcset.split(',').map(s=>s.trim().split(/\s+/)).find(([url])=>url===img.currentSrc);
  return selected?Number(selected[1].replace('w','')):Infinity;
 })).toBeLessThanOrEqual(360);
 await page.locator('#library-source').selectOption('mood');
 await expect(page.getByTestId('library-preset')).toHaveCount(6);
 await page.locator('#library-section').selectOption('skirts');
 await expect(page.getByTestId('library-preset')).toHaveCount(1);
 await page.locator('#library-section').selectOption('all');
 await page.getByRole('link').filter({hasText:'Vanadinite'}).click();
 await expect(page.getByText('Mood выдаёт ссылку',{exact:false})).toBeVisible();
 expect((await page.getByRole('link',{name:'Вернуться в библиотеку'}).boundingBox())!.y).toBeGreaterThanOrEqual(44);
 await expect(page.getByTestId('source-draft')).toHaveCount(0);
 await expect(page.getByTestId('source-pattern')).toHaveAttribute('href','https://blog.moodfabrics.com/vanadinite-tiered-midi-dress-sewing-pattern/');
 await expect.poll(()=>page.locator('.photo img').evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
 await page.screenshot({path:info.outputPath('mood-pattern.png')});
});
