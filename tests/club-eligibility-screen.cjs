const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const source=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8');
const legacy=source.split('\n').find(l=>l.includes('window.openAppointmentCharge=function(id){baseOpenCharge(id);'));
const start=source.lastIndexOf(' const previousOpenCharge=window.openAppointmentCharge;',source.indexOf(' function applyClubPrices(')),end=source.indexOf('\n})();',start);
const central='(()=>{'+source.slice(start,end)+'})();',grouped=source.match(/<script id="atlas-v136-same-day-group-payment">([\s\S]*?)<\/script>/)[1];
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1250,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 const styles=[...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n');
 await page.setContent('<html lang="es"><meta charset="utf-8"><style>'+styles+'input,button{display:inline-block!important;opacity:1!important;position:static!important;visibility:visible!important;width:auto!important;height:auto!important}input[type=number]{max-width:110px!important}button{padding:8px!important}</style><main style="max-width:1100px;margin:auto;padding:24px"><h1>Comprobación ficticia del club de afiliados</h1><div id="appointmentChargeSummary"></div><div id="appointmentChargeLines"></div><input id="appointmentChargeDiscount" value="0"><span id="appointmentChargeDiscountInfo"></span><label>Total <input id="appointmentChargeTotal"></label><button id="confirmAppointmentChargeBtn">Confirmar cobro</button></main></html>');
 await page.evaluate(()=>{
 Object.assign(window,{amount:600,calls:[],patientMaster:[{code:'SYNTHETIC',remoteId:'synthetic-patient',name:'Paciente ficticio',income:1400}],appointments:[{id:'a',patientCode:'SYNTHETIC',patient:'Paciente ficticio',date:'2026-11-20',time:'10:00',status:'Confirmada',services:['Bomba Diamagnética'],resources:[]}],sales:{products:[]},cashMovements:[]});
 window.patientByCode=code=>patientMaster.find(p=>p.code===code);window.normalizeSearch=s=>String(s||'').toLowerCase();window.hesc=s=>String(s??'');window.money=n=>Number(n).toFixed(2)+' €';
 window.atlasClubPrice=(_,fallback)=>fallback;window.updateChargeTotal=()=>{};window.atlasGroupedPaymentHelpersV136={appointmentLinePrice:()=>100};window.atlasExistingPayment=()=>null;
 window.atlasCentralRequest=async(action,payload)=>{calls.push(action);if(action==='payments:list')return[{patient_id:payload.patientId,status:'completed',amount}];if(action==='payments:listGrouped')return[];throw Error(action)};
 window.openAppointmentCharge=()=>{document.getElementById('appointmentChargeSummary').innerHTML='Paciente ficticio';document.getElementById('appointmentChargeLines').innerHTML='<input data-charge-price value="100.00">'};window.baseOpenCharge=window.openAppointmentCharge;
 });
 for(const content of [legacy,central,grouped])await page.addScriptTag({content});
 for(const [amount,expected] of [[600,'100.00'],[1300,'100.00'],[1400,'50.00']]){
 await page.evaluate(async amount=>{window.amount=amount;await openAppointmentCharge('a')},amount);
 assert.equal(await page.locator('[data-charge-price]').inputValue(),expected);assert.equal(await page.locator('#appointmentChargeTotal').inputValue(),expected);assert.equal(await page.locator('.atlas-charge-club').count(),amount>1300?1:0);assert(await page.locator('#confirmAppointmentChargeBtn').isEnabled());
 if(amount===600)await page.screenshot({path:path.resolve(__dirname,'../../murcia-club-synthetic.png'),fullPage:true});
 }
 assert.equal(errors.length,0,errors.join('\n'));assert((await page.evaluate(()=>calls)).every(a=>['payments:list','payments:listGrouped'].includes(a)));
 console.log('Pantalla de cobro agrupado: 600 € y 1.300 € sin club; 1.400 € con club; precio, total y botón correctos. Red bloqueada, sin escrituras.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
