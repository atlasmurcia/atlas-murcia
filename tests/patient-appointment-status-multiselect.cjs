const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const report={};try{for(const clinic of ["murcia"]){
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'modules/ficha.html'),'utf8');let scripts=0;
 for(const f of ['modules/ficha.html',clinic==='murcia'?'atlas.html':'index.html','modules/agenda.html'])for(const m of fs.readFileSync(path.join(root,f),'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=/.test(m[1])&&m[2].trim()){new vm.Script(m[2],{filename:f});scripts++}
 const render=html.split('\n').find(x=>x.includes('window.atlasRenderPatientAppointmentList=function()'));
 const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 const css=Array.from(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),m=>m[1]).join('\n');
 await page.setContent('<style>body{font:16px Arial;background:#f4f7f9;padding:25px;--line:#dfe7ec;--soft:#eaf6fb}.card{background:white;padding:16px}.patient-appointment-tools{display:flex;gap:8px;flex-wrap:wrap}select,button{padding:10px}td,th{padding:12px;border-bottom:1px solid #ddd}table{width:100%;text-align:left}'+css+'</style><div id="agenda"></div>');
 await page.evaluate(()=>{window.atlasIsAppointmentRecord=()=>true});
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'modules/care-finance-model.js'),'utf8')});
 await page.evaluate(()=>{window.states=['Pendiente','Confirmada','En atención','Realizada','Cancelada usuario','Cancelada clínica','No presentada','Reagendada','Eliminada'];window.fixtures=states.map((status,i)=>({id:'test-'+i,status:status==='En atención'?'arrived':status,date:'2026-12-'+(10+i),time:'10:00',services:[i%2?'Servicio B':'Servicio A'],professional:'Profesional ficticio'}));window.patientAppointments=()=>fixtures;window.statusOf=a=>atlasCareFinance.appointmentState(a);window.escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');});
 await page.addScriptTag({content:render});await page.evaluate(()=>atlasRenderPatientAppointmentList());
 const ids=()=>page.evaluate(()=>atlasFilteredPatientAppointments.map(x=>x.id));assert.equal((await ids()).length,9);
 await page.locator('#atlasAppointmentStatus summary').click();
 await page.locator('input[value="Pendiente"]').check();await page.locator('input[value="Confirmada"]').check();assert.deepEqual(await ids(),['test-0','test-1']);assert.equal(await page.locator('#atlasAppointmentStatus').getAttribute('open'),'');
 assert.equal(await page.locator('input[value="Confirmada"]').evaluate(e=>e===document.activeElement),true);
 await page.locator('input[value="Confirmada"]').press('Escape');assert.equal(await page.locator('#atlasAppointmentStatus').getAttribute('open'),null);
 await page.locator('#atlasAppointmentService summary').click();await page.locator('[data-service][value="Servicio A"]').check();assert.deepEqual(await ids(),['test-0']);assert.equal(await page.locator('#atlasAppointmentStatus input:checked').count(),2);
 await page.locator('[data-all-services]').check();await page.selectOption('#atlasAppointmentGroup','completed');assert.deepEqual(await ids(),[]);assert.match(await page.locator('tbody').innerText(),/No hay citas/);
 await page.selectOption('#atlasAppointmentGroup','history');
 if(clinic==='murcia'){await page.locator('#atlasAppointmentFrom').fill('2026-12-11');await page.locator('#atlasAppointmentFrom').dispatchEvent('change');assert.deepEqual(await ids(),['test-1']);await page.locator('#atlasAppointmentFrom').fill('');await page.locator('#atlasAppointmentFrom').dispatchEvent('change');}
 await page.locator('#atlasAppointmentStatus summary').click();await page.locator('[data-all-statuses]').check();assert.equal((await ids()).length,9);assert.equal(await page.locator('[data-status]:checked').count(),0);
 for(let i=0;i<9;i++){await page.locator('[data-status]').nth(i).check();assert.equal((await ids()).length,i+1)}
 for(let i=0;i<9;i++)await page.locator('[data-status]').nth(i).uncheck();assert.equal((await ids()).length,9);assert.equal(await page.locator('[data-all-statuses]').isChecked(),true);
 await page.locator('input[value="Pendiente"]').check();await page.locator('input[value="Realizada"]').check();await page.screenshot({path:path.join(__dirname,clinic+'-status-synthetic.png')});
 await page.setViewportSize({width:390,height:850});await page.screenshot({path:path.join(__dirname,clinic+'-status-mobile-synthetic.png')});console.log(await page.locator('#atlasAppointmentStatus .appointment-status-options').evaluate(e=>({right:e.getBoundingClientRect().right,width:innerWidth,parent:e.parentElement.getBoundingClientRect().toJSON()})));assert.equal(await page.locator('#atlasAppointmentStatus .appointment-status-options').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),true);
 assert.deepEqual(errors,[]);report[clinic]={scripts,ui:'passed',network:'blocked',fixtures:9};await page.close();
 }fs.writeFileSync(path.join(__dirname,'status-regression-report.json'),JSON.stringify(report,null,2));console.log(report);}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
