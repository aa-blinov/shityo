import {test,expect} from '@playwright/test';

test('paper selection, orientation, assembly map and real PDF download',async({page},info)=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('print-toolbar').click();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 const a4=await page.getByTestId('print-page-count').innerText();
 await page.getByTestId('print-paper').locator(`[data-value=\"${'A3'}\"]`).click();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 const a3=await page.getByTestId('print-page-count').innerText();
 expect(Number(a3.match(/\d+/)?.[0])).toBeLessThan(Number(a4.match(/\d+/)?.[0]));
 await page.getByTestId('print-orientation').locator(`[data-value=\"${'landscape'}\"]`).click();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 const href=(await page.getByTestId('export-pdf').getAttribute('href'))!;
 const url=new URL(href,page.url());
 expect(url.searchParams.get('page')).toBe('A3');
 expect(url.searchParams.get('orientation')).toBe('landscape');
 expect(url.searchParams.get('calibration')).toBe('true');
 const response=await page.request.get(href);
 expect(response.ok()).toBeTruthy();
 expect((await response.body()).subarray(0,4).toString()).toBe('%PDF');
 expect(response.headers()['content-disposition']).toContain('attachment');
 await page.getByTestId('print-assembly').locator('summary').click();
 await expect(page.locator('.piece-map')).toHaveCount(3);
 await page.screenshot({path:info.outputPath('pattern-printing-desktop.png')});
 await page.getByTestId('print-paper').locator(`[data-value=\"${'FULL'}\"]`).click();
 await expect(page.getByTestId('print-page-count')).toContainText('1');
 await expect(page.getByTestId('print-orientation')).toHaveCount(0);
 await expect(page.locator('#print-calibration')).toHaveCount(0);
});

test('calibration checkbox updates the PDF and page count',async({page})=>{
 await page.goto('/pattern/skirt');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('print-toolbar').click();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 const initial=Number((await page.getByTestId('print-page-count').innerText()).match(/\d+/)?.[0]);
 await page.locator('#print-calibration').uncheck();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 const next=Number((await page.getByTestId('print-page-count').innerText()).match(/\d+/)?.[0]);
 expect(next).toBe(initial-1);
 expect(await page.getByTestId('export-pdf').getAttribute('href')).toContain('calibration=false');
});

test('failed print planning is visible and cannot print a stale plan',async({page})=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('print-toolbar').click();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 await page.route('**/api/print-plan',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({detail:'invalid print geometry'})}));
 await page.getByTestId('print-paper').locator(`[data-value=\"${'A3'}\"]`).click();
 await expect(page.getByRole('alert')).toContainText('invalid print geometry');
 await expect(page.getByTestId('print-open')).toBeDisabled();
 await expect(page.getByTestId('export-pdf')).toHaveCount(0);
});

test('2D canvas and printing remain usable on a narrow viewport',async({page},info)=>{
 await page.setViewportSize({width:834,height:1194});
 await page.goto('/pattern/shirt');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 const canvas=page.getByTestId('pattern-canvas');
 await canvas.scrollIntoViewIfNeeded();
 const box=(await canvas.boundingBox())!;
 expect(box.height).toBeGreaterThanOrEqual(480);
 expect(box.width).toBeLessThanOrEqual(834);
 const darts=page.locator('g[data-piece-id="front"] path.dart');
 await expect(darts.first()).toBeAttached();
 const path=await darts.first().getAttribute('d');
 expect((path?.match(/L/g)??[]).length).toBeGreaterThanOrEqual(3);
 await page.screenshot({path:info.outputPath('pattern-mobile-canvas.png')});
 await page.getByTestId('print-toolbar').click();
 await page.getByTestId('print-open').scrollIntoViewIfNeeded();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 await page.getByTestId('print-paper').locator(`[data-value=\"${'LETTER'}\"]`).click();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 await page.getByTestId('export-panel').screenshot({path:info.outputPath('pattern-mobile-printing.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(834);
});

test('printing labels switch to English',async({page})=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('settings-toggle').click();
 await page.locator('#language-switch').selectOption('en');
 await page.getByTestId('settings-close').click();
 await page.getByTestId('print-toolbar').click();
 await expect(page.getByRole('heading',{name:'Print pattern',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open printable PDF'})).toBeEnabled();
});


for (const paper of ['A0','A1','A2']) {
 test(`${paper} paper reduces page count and produces a valid PDF`,async({page})=>{
  await page.goto('/pattern/tee');
  await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
  await page.getByTestId('print-toolbar').click();
  await expect(page.getByTestId('print-open')).toBeEnabled();
  const a4=Number((await page.getByTestId('print-page-count').innerText()).match(/\d+/)?.[0]);
  await page.getByTestId('print-paper').locator(`[data-value=\"${paper}\"]`).click();
  await expect(page.getByTestId('print-open')).toBeEnabled();
  const count=Number((await page.getByTestId('print-page-count').innerText()).match(/\d+/)?.[0]);
  expect(count).toBeLessThan(a4);
  const href=(await page.getByTestId('export-pdf').getAttribute('href'))!;
  expect(new URL(href,page.url()).searchParams.get('page')).toBe(paper);
  const response=await page.request.get(href);
  expect(response.ok()).toBeTruthy();
  expect((await response.body()).subarray(0,4).toString()).toBe('%PDF');
  expect(response.headers()['content-disposition']).toContain(`${paper}.pdf`);
 });
}
