import {test,expect,registerAtelier} from './fixtures';

test('onboarding appears for first visit and can be dismissed',async({browser},info)=>{
 const context=await browser.newContext({
  viewport:{width:1440,height:900},
  storageState:{cookies:[],origins:[]}
 });
 const page=await context.newPage();
 // Чистый браузер без подсказок, но с сессией: приложение открыто только после входа.
 await registerAtelier(page.request);
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await expect(page.getByTestId('onboarding')).toBeVisible();
 await page.screenshot({path:info.outputPath('onboarding.png')});
 await page.getByRole('button',{name:'Начать'}).click();
 await expect(page.getByTestId('onboarding')).toHaveCount(0);
 await context.close();
});

test('panels collapse and focus gives the drawing the full workspace',async({page},info)=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 const initial=(await page.getByTestId('pattern-canvas').boundingBox())!;
 await page.getByTestId('focus-pattern').click();
 await expect(page.locator('.side:not(.closed)')).toHaveCount(0);
 // Панели уезжают с анимацией: ширина чертежа проверяется после неё.
 await expect.poll(async()=>(await page.getByTestId('pattern-canvas').boundingBox())!.width).toBeGreaterThan(initial.width+400);
 await page.getByTestId('focus-pattern').click();
 await expect(page.locator('.side:not(.closed)')).toHaveCount(2);
 await page.getByTestId('print-toolbar').click();
 await expect(page.getByTestId('print-open')).toBeEnabled();
 await page.screenshot({path:info.outputPath('workspace-desktop.png')});
});

test('client measurements persist and restore after reload',async({page})=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('client-profiles').locator('summary').click();
 await page.locator('#client-name').fill('Анна');
 await page.locator('#client-name').blur();
 await page.getByRole('button',{name:'Создать клиента',exact:true}).click();
 await expect(page.getByTestId('client-profiles').getByRole('status')).toContainText('Клиент создан');
 const savedBust=await page.getByTestId('measurement-bust').inputValue();
 await page.getByRole('button',{name:'Сохранить текущие мерки',exact:true}).click();
 await expect(page.getByTestId('client-profiles').getByRole('status')).toContainText('Мерки сохранены');
 await page.reload();
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('measurement-bust').fill('110');
 await page.getByTestId('measurement-bust').blur();
 await page.getByTestId('client-profiles').locator('summary').click();
 await page.getByTestId('client-profile').getByRole('button').first().click();
 await page.getByTestId('client-snapshot').getByRole('button').first().click();
 await page.getByTestId('client-profiles').getByRole('button',{name:'Применить',exact:true}).click();
 await expect(page.getByTestId('measurement-bust')).toHaveValue(savedBust);
 // Удаление клиента стирает историю мерок - только после подтверждения.
 page.once('dialog',dialog=>void dialog.accept());
 await page.getByRole('button',{name:'Удалить клиента',exact:true}).click();
 await expect(page.getByTestId('client-profile').getByRole('button')).toHaveCount(1);
});

test('seam comparison uses actual curve lengths and highlights selected edges',async({page})=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 const response=await page.request.post('/api/generate',{data:{model:'tee',measurements:{},params:{}}});
 const result=await response.json();
 const edge=result.pieces[0].seam_edges[0];
 const length=edge.points.slice(1).reduce((sum:number,p:{x:number;y:number},i:number)=>sum+Math.hypot(p.x-edge.points[i].x,p.y-edge.points[i].y),0)/10;
 const fullLabel=`${result.pieces[0].name}, ${edge.label}`;
 const seamRow = page.locator('[data-testid="seam-inspector"] .seam-row').filter({ hasText: fullLabel });
 await seamRow.getByRole('button', { name: 'A', exact: true }).click();
 await seamRow.getByRole('button', { name: 'B', exact: true }).click();
 await expect(page.getByTestId('seam-length-a')).toContainText(length.toFixed(2));
 await expect(page.getByTestId('seam-difference')).toContainText('0.00');
 await expect(page.locator('path.highlight-seam')).toHaveCount(1);
});

test('ruler measures in draft coordinates and clears with Escape',async({page})=>{
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('ruler-toggle').click();
 const canvas=page.getByTestId('pattern-canvas');
 await canvas.click({position:{x:60,y:120}});
 await canvas.click({position:{x:160,y:120}});
 const expected=await canvas.evaluate(el=>{
  const svg=el as SVGSVGElement;const m=svg.getScreenCTM()!;
  const a=new DOMPoint(0,0).matrixTransform(m.inverse());const b=new DOMPoint(100,0).matrixTransform(m.inverse());
  return (Math.hypot(b.x-a.x,b.y-a.y)/10).toFixed(2);
 });
 await expect(page.getByTestId('ruler-result')).toContainText(expected);
 await canvas.press('Escape');
 await expect(page.getByTestId('ruler-result')).toHaveCount(0);
});

test('settings and legend fit on mobile in light mode',async({page},info)=>{
 await page.setViewportSize({width:834,height:1194});
 await page.goto('/pattern/tee');
 await expect(page.locator('.workspace')).toHaveAttribute('data-ready','true');
 await page.getByTestId('settings-toggle').click();
 await page.getByTestId('mode-toggle').click();
 await expect(page.locator('html')).toHaveAttribute('data-mode','dark');
 await page.getByTestId('mode-toggle').click();
 await expect(page.locator('html')).toHaveAttribute('data-mode','light');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(834);
 await page.getByTestId('settings-close').click();
 await page.locator('.canvas-footer summary').click();
 await expect(page.getByText('Сгиб',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(834);
 await page.getByTestId('pattern-canvas').scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath('workspace-mobile-light.png')});
});
