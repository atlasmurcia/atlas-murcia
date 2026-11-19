'use strict';
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL,{waitUntil:'networkidle'});
  await page.getByPlaceholder('Escribe al menos dos caracteres').fill('Lucía');
  await page.getByRole('button',{name:'Elegir principal'}).first().waitFor();
  const a=page.locator('.pm-match').filter({hasText:'DEMO-101'}),b=page.locator('.pm-match').filter({hasText:'DEMO-202'});
  await a.getByRole('button',{name:'Elegir principal'}).click();await b.getByRole('button',{name:'Elegir duplicada'}).click();
  await page.getByRole('button',{name:'Comparar información'}).click();
  await page.getByRole('heading',{name:'2. Comparar las fichas'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Fusionar definitivamente'}).isDisabled(),true);
  await page.locator('input[data-field="email"][value="secondary"]').check();
  await page.locator('input[data-field="phone"][value="primary"]').check();
  await page.screenshot({path:__dirname+'/comparacion-postgresql.png',fullPage:true});
  await page.locator('[data-merge="confirm"]').check();
  assert.equal(await page.getByRole('button',{name:'Fusionar definitivamente'}).isDisabled(),false);
  await page.getByRole('button',{name:'Fusionar definitivamente'}).click();
  await page.getByRole('heading',{name:'Fusión completada y verificada'}).waitFor();
  await page.screenshot({path:__dirname+'/fusion-verificada.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:__dirname+'/movil.png',fullPage:true});
  await page.locator('[data-merge="reason"]').fill('Prueba visual con datos ficticios');
  await page.locator('[data-merge="undo-confirm"]').check();
  await page.getByRole('button',{name:'Deshacer fusión'}).click();
  await page.getByText('Fusión revertida y verificada. Se conserva la auditoría.').waitFor();
  assert.deepEqual(errors,[]);
  console.log('OK pantalla escritorio: comparación, conflictos y confirmación');
  console.log('OK fusión real y reversión desde navegador contra PostgreSQL sintético');
  console.log('OK pantalla móvil sin desbordamiento; cero errores JavaScript');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
