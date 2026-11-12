// DOM-level tests only: actual form markup, no clinic bootstrap or network access.
// Install jsdom@26.1.0 outside the repository and set NODE_PATH accordingly.
const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const prefix=fs.existsSync('out/atlas.html')?'out/':'';
function modal(source,marker){const start=source.indexOf(marker),end=source.indexOf('<script',start);assert(start>=0&&end>start);return source.slice(start,end)}
const agenda=fs.readFileSync(prefix+'modules/agenda.html','utf8'),ficha=fs.readFileSync(prefix+'modules/ficha.html','utf8');
const direct=agenda.slice(agenda.indexOf('modal.id=\'atlasDirectSaleBack\''));
const fixture=modal(agenda,'<div class="modalback" id="appointmentChargeBack">')+modal(ficha,'<div id="budgetPaymentBack"')+'<div id="atlasDirectSaleBack" class="modalback">'+direct.match(/modal.innerHTML=`([\s\S]*?)`;/)[1]+'</div>';
const dom=new JSDOM('<!doctype html><html><body>'+fixture.replace(/\son(?:click|change|input)="[^"]*"/g,'')+'</body></html>',{runScripts:'outside-only'}),window=dom.window,document=window.document;
window.eval(fs.readFileSync('src/mixed-payments.js','utf8'));document.dispatchEvent(new window.Event('DOMContentLoaded'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 for(const [modalId,selectId,totalId,confirmId,value] of [['appointmentChargeBack','appointmentPaymentMethod','appointmentChargeTotal','confirmAppointmentChargeBtn','Pago mixto'],['budgetPaymentBack','budgetPaymentMethod','budgetPaymentAmount','confirmBudgetPaymentBtn','Pago mixto'],['atlasDirectSaleBack','atlasDirectSaleMethod','atlasDirectSaleTotal','atlasDirectSaleConfirm','mixed']]){
  let submissions=0;const modal=document.getElementById(modalId),select=document.getElementById(selectId),total=document.getElementById(totalId),button=document.getElementById(confirmId);button.addEventListener('click',()=>submissions++);if(total.tagName==='INPUT')total.value='100';else total.textContent='100,00 €';modal.classList.add('open');await flush();select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}));const fieldset=modal.querySelector('fieldset'),inputs=fieldset.querySelectorAll('input'),methods=fieldset.querySelectorAll('select');
  function fill(first,second,secondMethod='card'){inputs[0].value=first;inputs[1].value=second;methods[1].value=secondMethod;inputs[0].dispatchEvent(new window.Event('input',{bubbles:true}))}
  for(const [first,second,method] of [['30','69.99','card'],['30','70','cash'],['-30','130','card'],['30.001','69.999','card']]){fill(first,second,method);button.click();assert.equal(submissions,0)}
  fill('30,00','70.00');await flush();button.click();assert.equal(submissions,1);assert.match(fieldset.textContent,/Importes correctos/);assert.deepEqual(JSON.parse(JSON.stringify(window.atlasMixedPayment.read(selectId,100))),[{method:'cash',amount:30},{method:'card',amount:70}]);
  if(total.tagName==='INPUT')total.value='90';else total.textContent='90,00 €';button.click();assert.equal(submissions,1);fill('30','60');await flush();button.click();assert.equal(submissions,2);
  select.value=modalId==='atlasDirectSaleBack'?'card':'Tarjeta';select.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(window.atlasMixedPayment.read(selectId,90).length,0);
  modal.classList.remove('open');await flush();modal.classList.add('open');await flush();assert.equal(inputs[0].value,'');assert.equal(inputs[1].value,'');modal.classList.remove('open');
 }
 const api=window.atlasMixedPayment,first=api.beginAttempt('test',['cash',30,'card',70]);assert.equal(api.beginAttempt('test',['cash',30,'card',70]).id,first.id);assert.throws(()=>api.beginAttempt('test',['cash',40,'card',60]));api.completeAttempt('test');assert(!api.hasAttempt('test'));
 console.log('DOM: all three actual forms validate sums/methods, discard stale splits, reset between patients and preserve uncertain retry references.');window.close();
})().catch(error=>{console.error(error);window.close();process.exitCode=1});
