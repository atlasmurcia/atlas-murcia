(function(root){
 'use strict';
 const labels={cash:'Metálico',card:'Tarjeta',transfer:'Transferencia',bizum:'Bizum',financing:'Financiación',other:'Otro'},codes=Object.keys(labels);
 function cents(value){
  if(typeof value==='string'){value=value.trim();if(!/^\d+(?:[.,]\d{1,2})?$/.test(value))throw Error('Introduce un importe positivo con un máximo de dos decimales.');value=Number(value.replace(',','.'))}
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000||Math.abs(value*100-Math.round(value*100))>0.000001)throw Error('Introduce un importe válido con un máximo de dos decimales.');
  return Math.round(value*100);
 }
 function normalise(total,parts){
  const due=cents(total);
  if(!due||!Array.isArray(parts)||parts.length!==2)throw Error('El pago mixto requiere exactamente dos métodos e importes.');
  const result=parts.map(part=>{if(!part||!codes.includes(part.method))throw Error('Selecciona una forma de pago válida.');const amount=cents(part.amount);if(!amount)throw Error('Los dos importes deben ser mayores que cero.');return {method:part.method,amount:amount/100}});
  if(result[0].method===result[1].method)throw Error('Selecciona dos métodos de pago diferentes.');
  if(result.reduce((sum,part)=>sum+cents(part.amount),0)!==due)throw Error('La suma de los dos métodos debe coincidir exactamente con el total a cobrar.');
  return result.sort((a,b)=>codes.indexOf(a.method)-codes.indexOf(b.method));
 }
 const euro=value=>Number(value).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
 function describe(parts){return 'Pago mixto · '+parts.map(part=>labels[part.method]+' '+euro(part.amount)).join(' + ')}
 function portion(payment,method){const code=codes.find(code=>code===method||labels[code]===method),parts=payment.paymentMethodBreakdown||payment.metadata?.payment_method_breakdown||[];if(!code)return 0;const mixed=payment.method==='mixed'||payment.paymentMethod==='Pago mixto'||payment.metadata?.payment_method_label==='Pago mixto';return mixed&&parts.length?parts.filter(part=>part.method===code).reduce((sum,part)=>sum+cents(part.amount),0)/100:payment.paymentMethod===method||payment.paymentMethod===labels[code]||payment.method===code?Number(payment.amount||0):0}
 const states=new Map(),attempts=new Map();let sequence=0;
 function beginAttempt(key,identity){const fingerprint=JSON.stringify(identity),previous=attempts.get(key);if(previous){if(previous.fingerprint!==fingerprint)throw Error('Hay un intento de pago mixto pendiente de comprobar. Reintenta con los mismos datos o revisa primero el justificante.');return previous}const attempt={fingerprint,id:'mixed-'+Date.now()+'-'+(++sequence),date:new Date().toISOString()};attempts.set(key,attempt);return attempt}
 function completeAttempt(key){attempts.delete(key)}
 function read(id,total){const state=states.get(id),select=root.document?.getElementById(id);if(!select||!['mixed','Pago mixto'].includes(select.value))return [];if(!state)throw Error('El formulario de pago mixto todavía no está preparado.');return normalise(total,state.rows.map(row=>({method:row.method.value,amount:row.amount.value})))}
 root.atlasMixedPayment={cents,normalise,describe,portion,labels,read,beginAttempt,completeAttempt,hasAttempt:key=>attempts.has(key)};
 if(!root.document)return;
 root.addEventListener('message',event=>{const message=event.data||{};if(message.type==='atlas:budget-payment-recorded')completeAttempt('budget:'+message.patientCode+':'+message.budgetId)});
 function mount(config){
  const select=document.getElementById(config.select),modal=document.getElementById(config.modal);if(!select||!modal)return;
  const option=document.createElement('option');option.value=config.code?'mixed':'Pago mixto';option.textContent='Pago mixto';select.appendChild(option);
  const fieldset=document.createElement('fieldset');fieldset.className='field full';fieldset.style.cssText='display:none;grid-column:1/-1;border:1px solid #a5d9e8;border-radius:10px;padding:14px;margin:8px 0';
  const legend=document.createElement('legend');legend.textContent='Desglose del pago mixto';fieldset.appendChild(legend);
  const rows=[0,1].map(index=>{const line=document.createElement('div');line.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) minmax(100px,1fr);gap:12px;margin:8px 0';const methodLabel=document.createElement('label'),method=document.createElement('select'),amountLabel=document.createElement('label'),amount=document.createElement('input');methodLabel.textContent='Método '+(index+1);amountLabel.textContent='Importe '+(index+1)+' (€)';method.style.width=amount.style.width='100%';for(const code of codes){const item=document.createElement('option');item.value=code;item.textContent=labels[code];method.appendChild(item)}method.value=index?'card':'cash';amount.type='text';amount.inputMode='decimal';amount.placeholder='0,00';amount.autocomplete='off';amount.setAttribute('aria-label','Importe del método '+(index+1));method.setAttribute('aria-label','Método de pago '+(index+1));methodLabel.appendChild(method);amountLabel.appendChild(amount);line.append(methodLabel,amountLabel);fieldset.appendChild(line);return {method,amount}});
  const summary=document.createElement('div');summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');fieldset.appendChild(summary);select.closest('label').after(fieldset);
  const getTotal=()=>{const node=document.getElementById(config.total);if(!node)return NaN;if(node.tagName==='INPUT')return Number(node.value);let text=node.textContent.replace(/[^\d,.-]/g,'');return Number(text.includes(',')?text.replace(/\./g,'').replace(',','.'):text)};
  const state={rows};states.set(config.select,state);
  function refresh(){fieldset.style.display=['mixed','Pago mixto'].includes(select.value)?'block':'none';if(fieldset.style.display==='none')return;let sum=0;try{sum=rows.reduce((total,row)=>total+cents(row.amount.value||'0'),0)/100;normalise(getTotal(),rows.map(row=>({method:row.method.value,amount:row.amount.value})));summary.textContent='Suma: '+euro(sum)+' · Total a cobrar: '+euro(getTotal())+' · Importes correctos';summary.style.color='#157347'}catch(error){summary.textContent='Suma: '+euro(sum)+' · Total a cobrar: '+euro(getTotal())+' · '+error.message;summary.style.color='#a32626'}}
  modal.addEventListener('input',()=>queueMicrotask(refresh));modal.addEventListener('change',()=>queueMicrotask(refresh));select.addEventListener('change',refresh);
  modal.addEventListener('click',event=>{if(!event.target.closest('#'+config.confirm)||!['mixed','Pago mixto'].includes(select.value))return;try{read(config.select,getTotal())}catch(error){event.preventDefault();event.stopImmediatePropagation();refresh();rows[0].amount.focus()}},true);
  new MutationObserver(records=>{if(modal.classList.contains('open')&&records.some(record=>!String(record.oldValue||'').split(/\s+/).includes('open'))){rows.forEach((row,index)=>{row.method.value=index?'card':'cash';row.amount.value=''});refresh()}}).observe(modal,{attributes:true,attributeFilter:['class'],attributeOldValue:true});
  refresh();
 }
 function install(){for(const config of [
  {select:'appointmentPaymentMethod',modal:'appointmentChargeBack',total:'appointmentChargeTotal',confirm:'confirmAppointmentChargeBtn'},
  {select:'budgetPaymentMethod',modal:'budgetPaymentBack',total:'budgetPaymentAmount',confirm:'confirmBudgetPaymentBtn'},
  {select:'atlasDirectSaleMethod',modal:'atlasDirectSaleBack',total:'atlasDirectSaleTotal',confirm:'atlasDirectSaleConfirm',code:true}
 ])mount(config);const filter=document.getElementById('cashSearchMethod');if(filter){const option=document.createElement('option');option.value='Pago mixto';option.textContent='Pago mixto';filter.appendChild(option)}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(globalThis);
