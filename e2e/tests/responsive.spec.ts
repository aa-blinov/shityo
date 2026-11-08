import {test,expect} from '@playwright/test';

for(const [name,width,height] of [['desktop',1440,900],['laptop',1366,768],['tablet-landscape',1024,768],['tablet-portrait',834,1194]] as const){
 test(`workspace fits ${name}`,async({page},info)=>{
  await page.setViewportSize({width,height});
  await page.goto('/pattern/tee');
  await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
  const canvas=page.getByTestId('pattern-canvas');
  const box=(await canvas.boundingBox())!;
  expect(box.height).toBeGreaterThan(height*.65);
  expect(box.y+box.height).toBeLessThanOrEqual(height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  if(width<=1180){
   expect(box.width).toBeGreaterThan(width-24);
   await page.getByTestId('toggle-measures').click();
   await expect(page.getByTestId('measure-panel')).toBeVisible();
   expect((await canvas.boundingBox())!.height).toBeGreaterThan(height*.65);
   await page.getByTestId('toggle-inspector').click();
   await expect(page.getByTestId('measure-panel')).toHaveCount(0);
   await page.getByTestId('toggle-inspector').click();
   await page.getByTestId('print-toolbar').click();
   await expect(page.getByTestId('print-open')).toBeEnabled();
   await page.keyboard.press('Escape');
  }
  if(width>1180){await page.getByTestId('print-toolbar').click();await expect(page.getByTestId('print-open')).toBeEnabled();await page.keyboard.press('Escape');}
  await page.screenshot({path:info.outputPath(`workspace-${name}.png`)});
 });
}

test('resizing a laptop window switches to the compact workspace',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await expect(page.locator('.side:not(.closed)')).toHaveCount(2);
 await page.setViewportSize({width:1024,height:768});
 await expect(page.locator('.side:not(.closed)')).toHaveCount(0);
 expect((await page.getByTestId('pattern-canvas').boundingBox())!.width).toBeGreaterThan(1000);
 await page.setViewportSize({width:1366,height:768});
 await expect(page.locator('.side:not(.closed)')).toHaveCount(2);
});

test('phone and narrow windows get a clear stub instead of a broken editor',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/pattern/tee');
 await expect(page.getByTestId('narrow-stub')).toBeVisible();
 await expect(page.getByTestId('narrow-stub')).toContainText('компьютере или планшете');
 await expect(page.locator('.workspace')).toBeHidden();
 await page.setViewportSize({width:1024,height:768});
 await expect(page.getByTestId('narrow-stub')).toBeHidden();
 await expect(page.locator('.workspace')).toBeVisible();
});
