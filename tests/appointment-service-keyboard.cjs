const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 try{
  for(const repo of [path.basename(path.join(__dirname,'..'))]){
   const dir=path.join(__dirname,'..');
   const html=fs.readFileSync(path.join(dir,'modules/agenda.html'),'utf8');
   const code=fs.readFileSync(path.join(dir,'modules/appointment-service-keyboard.js'),'utf8');
   let scripts=0;
   for(const [,attrs,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(/\bsrc\s*=|application\/json|application\/ld\+json/.test(attrs))continue;
    new vm.Script(body);scripts++;
   }
   assert.match(html,/<script src="\.\/appointment-service-keyboard\.js\?v=1"><\/script>/);
   new vm.Script(code);
   const modal=html.match(/<details id="mServices"[\s\S]*?<\/details>/)[0];
   const styles=html.match(/\.multi-dropdown\{[^]*?\.multi-dropdown\[open\] summary[^\n]+/)[0];
   const render=html.slice(html.indexOf('function renderServiceChecks(){'),html.indexOf('function buildMultiSelectors(){'));
   const order=html.includes('function orderedAppointmentTherapies(')?html.slice(html.indexOf('function orderedAppointmentTherapies('),html.indexOf('function renderServiceChecks(){')):'';
   const page=await browser.newPage({viewport:{width:850,height:650}});
   await page.route('**/*',route=>route.abort());
   await page.setContent('<style>body{font:16px Arial}.checkgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.checkgrid label{display:flex;align-items:center;gap:8px;padding:8px}'+styles+'</style><h2>Cita de prueba · '+repo+'</h2>'+modal+'<select id="mTherapy"></select><select id="wService"></select><select id="pfService"></select><button id="outside">Continuar</button>');
   await page.addScriptTag({content:`var therapies=['SIS','Magneto Physio','Magneto Plus','Bomba Diamagnética','Masaje','Ácido de prueba',...Array.from({length:30},(_,i)=>'Tratamiento ficticio '+i),'SIS final']; var changes=0; function checkedValues(){return [...document.querySelectorAll('#mServicesOptions input:checked')].map(x=>x.value)} function updateMultiSummaries(){} ${order}${render} renderServiceChecks(); document.getElementById('mServices').addEventListener('change',()=>changes++);`});
   await page.addScriptTag({content:code});
   const summary=page.locator('#mServices summary');
   const focus=()=>page.evaluate(()=>document.activeElement.value);
   const checked=()=>page.evaluate(()=>checkedValues());
   const key=async(value,expected)=>{await page.keyboard.press(value);assert.equal(await focus(),expected)};
   const original=await page.locator('#mServicesOptions input').evaluateAll(inputs=>inputs.map(i=>i.value));
   const ms=original.filter(name=>name.startsWith('M'));
   await summary.click();
   await key('M',ms[0]);await key('M',ms[1]);await key('M',ms[2]);await key('M',ms[0]);
   await key('s','SIS');await key('s','SIS final');await key('s','SIS');
   await key('b','Bomba Diamagnética');assert.deepEqual(await checked(),[]);
   await page.keyboard.press('Space');assert.deepEqual(await checked(),['Bomba Diamagnética']);
   await key('m',ms[0]);await page.keyboard.press('Enter');assert.ok((await checked()).includes(ms[0]));
   assert.equal(await page.evaluate(()=>changes),2);
   await key('a','Ácido de prueba');
   await page.keyboard.press('z');assert.equal(await focus(),'Ácido de prueba');
   await page.keyboard.press('Control+b');assert.equal(await focus(),'Ácido de prueba');
   await page.keyboard.press('Meta+b');assert.equal(await focus(),'Ácido de prueba');
   await key('s','SIS');await key('s','SIS final');
   assert.ok(await page.evaluate(()=>{const item=document.activeElement.closest('label').getBoundingClientRect(),box=document.getElementById('mServicesOptions').getBoundingClientRect();return item.top>=box.top&&item.bottom<=box.bottom+1}));
   await summary.click();await summary.click();await key('m',ms[0]);
   await summary.click();await summary.focus();await key('M',ms[0]);await key('M',ms[1]);
   await page.locator('#outside').focus();await summary.focus();await key('m',ms[0]);
   await page.evaluate(()=>{therapies.push('Magneto Nuevo');renderServiceChecks()});
   assert.ok((await checked()).includes('Bomba Diamagnética'));
   const updatedMs=await page.locator('#mServicesOptions input').evaluateAll(inputs=>inputs.map(i=>i.value).filter(x=>x.startsWith('M')));
   await summary.focus();for(const name of [...updatedMs,updatedMs[0]])await key('m',name);
   await page.evaluate(()=>{[...document.querySelectorAll('#mServicesOptions input')].find(i=>i.value==='Magneto Nuevo').disabled=true});
   await summary.focus();for(const name of ms)await key('m',name);
   assert.deepEqual((await page.locator('#mServicesOptions input').evaluateAll(inputs=>inputs.map(i=>i.value))).filter(x=>x!=='Magneto Nuevo'),original);
   const before=await checked();await page.addScriptTag({content:code});assert.equal(await page.locator('#mServicesKeyboardHint').count(),1);
   assert.deepEqual(await checked(),before);
   await key('b','Bomba Diamagnética');
   await page.screenshot({path:path.join(require('node:os').tmpdir(),repo+'-service-keyboard-synthetic.png')});
   console.log(repo+': OK · '+scripts+' scripts, iniciales, ciclo, foco visible, clic/espacio/Intro, tildes, catálogo actualizado y orden conservado');
   await page.close();
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
