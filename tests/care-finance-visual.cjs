const fs=require('fs'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 for(const clinic of [fs.existsSync('atlas.html')?'murcia':'alicante']){
  const root=process.cwd(),html=fs.readFileSync(root+'/modules/ficha.html','utf8');
  const page=await browser.newPage({viewport:{width:1500,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
  const css=[...html.slice(0,html.indexOf('</head>')).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  await page.setContent('<html lang="es"><meta charset="utf-8"><style>'+css+' body{padding:16px}#facturacion{display:block;position:static!important}#agenda{position:static!important;width:auto!important;max-width:none!important}main{display:block!important;max-width:1450px!important}.patient-appointment-tools{display:flex;gap:7px;flex-wrap:wrap}.patient-appointment-list{overflow:auto;max-width:100%;min-width:0}.patient-appointment-list table{min-width:850px;table-layout:auto!important}</style><main><h1>Ficha de prueba · datos ficticios</h1><section id="agenda"></section><section id="facturacion"></section></main></html>');
  for(const f of ['appointment-record-kind.js','care-finance-model.js'])await page.addScriptTag({content:fs.readFileSync(root+'/modules/'+f,'utf8')});
  const funcs=['statusOf','patientAppointments'].map(name=>html.split('\n').find(l=>l.includes(' function '+name+'('))).join('\n');
  const render=html.split('\n').find(l=>l.includes('window.atlasRenderPatientAppointmentList=function()'));
  const visits=[{id:'future',date:'2099-01-10',time:'09:00',status:'Confirmada',services:['Servicio de prueba'],paymentStatus:'Cobrado'},{id:'cancelled',date:'2026-11-10',time:'09:00',status:'Cancelada',services:['Servicio de prueba'],centralId:'cancelled-central',paymentStatus:'Cobrado'},{id:'done',date:'2026-11-09',time:'09:00',status:'Realizada',services:['Servicio de prueba'],paymentStatus:'Pendiente de cobro'},{id:'sale',date:'2026-11-09',time:'09:33',status:'Realizada',services:['Venta de prueba'],metadata:{kind:'direct_sale'}}];
  await page.addScriptTag({content:'window.escapeHtml=v=>String(v);window.ATLAS_PATIENT_APPOINTMENTS='+JSON.stringify(visits)+';'+funcs+'\n'+render+'\natlasRenderPatientAppointmentList();'});
  assert.equal(await page.locator('#atlasPatientAppointmentList tbody tr').count(),3);assert(!await page.locator('#atlasPatientAppointmentList').textContent().then(t=>t.includes('Venta de prueba')));
  await page.selectOption('#atlasAppointmentGroup','upcoming');assert.equal(await page.locator('#atlasPatientAppointmentList tbody tr').count(),1);assert(await page.locator('#atlasPatientAppointmentList tbody').textContent().then(t=>t.includes('Confirmada')));
  await page.selectOption('#atlasAppointmentGroup','completed');assert.equal(await page.locator('#atlasPatientAppointmentList tbody tr').count(),1);assert(await page.locator('#atlasPatientAppointmentList tbody').textContent().then(t=>t.includes('09/11/2026')||t.includes('2026-11-09')));
  await page.selectOption('#atlasAppointmentGroup','history');
  await page.addScriptTag({content:fs.readFileSync(root+'/modules/patient-financial-history.js','utf8')});
  const payments=[{id:'advance',appointment_id:null,status:'completed',amount:100,method:'card',paid_at:'2026-11-17T09:00:00Z',metadata:{payment_label:'Anticipo sin cita'}},{id:'paid-cancelled',appointment_id:'cancelled-central',status:'completed',amount:50,method:'cash',paid_at:'2026-11-10T09:00:00Z',metadata:{payment_label:'Pago conservado de cita cancelada'}},{id:'refund',status:'completed',payment_type:'refund',amount:-20,method:'transfer',paid_at:'2026-11-17T09:00:00Z',metadata:{payment_label:'Devolución de prueba'}},{id:'pending',status:'pending',amount:30,metadata:{payment_label:'Operación pendiente'}}];
  await page.evaluate(({payments})=>{
   window.addEventListener('message',event=>{const m=event.data;if(m.type==='atlas:central-db-request'&&['payments:list','patients:financialSummary'].includes(m.action)){const data=m.action==='payments:list'?payments:{balance:25,charges:[{name:'Presupuesto de prueba',status:'Pagado parcialmente',remaining:25}]};window.postMessage({type:'atlas:central-db-response',requestId:m.requestId,ok:true,data},'*');}});
   window.postMessage({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}},'*');
  },{payments});
  await page.waitForFunction(()=>document.getElementById('atlasFinancialState').textContent.includes('4 operaciones'));
  assert.equal(await page.locator('#atlasFinancialRows tbody tr').count(),4);
  await page.selectOption('#atlasFinancialFilter','paid');assert.equal(await page.locator('#atlasFinancialRows tbody tr').count(),2);assert(await page.locator('#atlasFinancialRows').textContent().then(t=>t.includes('Pago conservado')));
  await page.selectOption('#atlasFinancialFilter','refunds');assert.equal(await page.locator('#atlasFinancialRows tbody tr').count(),1);
  await page.selectOption('#atlasFinancialFilter','pending');assert.equal(await page.locator('#atlasFinancialRows tbody tr').count(),1);
  await page.selectOption('#atlasFinancialFilter','all');
  await page.screenshot({path:require('os').tmpdir()+'/atlas-'+clinic+'-care-finance-desktop-synthetic.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'La ficha no debe desbordar horizontalmente');await page.screenshot({path:require('os').tmpdir()+'/atlas-'+clinic+'-care-finance-mobile-synthetic.png',fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));
  await page.evaluate(()=>window.postMessage({type:'atlas:load-patient',patient:null},'*'));await page.waitForFunction(()=>document.getElementById('atlasFinancialState').textContent.includes('Selecciona'));assert.equal(await page.locator('#atlasFinancialRows tbody tr').count(),0);assert(!await page.locator('#atlasFinancialBalance').textContent().then(t=>t.includes('25')));
  await page.close();console.log(clinic+': filtros reales de citas/pagos, anticipo, cancelada pagada, devolución, saldo, cambio de paciente y pantallas: OK');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
