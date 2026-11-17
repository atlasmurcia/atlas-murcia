// Historial exclusivamente económico. Las citas nunca se generan a partir de estas respuestas.
(()=>{
 const model=window.atlasCareFinance,host=document.getElementById('facturacion');if(!host||!model)return;
 const panel=document.createElement('section');panel.className='card';panel.id='atlasFinancialHistory';
 panel.innerHTML='<h2>Pagos y devoluciones</h2><p class="small">El pago y la asistencia tienen estados independientes. Cancelar una cita conserva su cobro.</p><div class="toolbar"><label>Mostrar <select id="atlasFinancialFilter"><option value="all">Historial financiero completo</option><option value="paid">Pagos realizados</option><option value="pending">Pagos pendientes</option><option value="refunds">Devoluciones</option><option value="other">Anulados y fallidos</option></select></label><button type="button" class="btn" id="atlasFinancialRefresh">Actualizar pagos</button></div><p id="atlasFinancialBalance" class="callout">Saldo pendiente: sin comprobar</p><div id="atlasFinancialCharges"></div><p id="atlasFinancialState" class="small" role="status"></p><div id="atlasFinancialRows" style="overflow:auto"></div>';
 host.prepend(panel);
 const style=document.createElement('style');style.textContent='#atlasFinancialHistory{max-width:100%;min-width:0;box-sizing:border-box}#atlasFinancialRows{max-width:100%;overflow:auto}#atlasFinancialHistory table{min-width:1080px;table-layout:auto!important}#atlasFinancialHistory th,#atlasFinancialHistory td{white-space:normal!important;overflow-wrap:anywhere;padding:10px!important;min-width:115px}#atlasFinancialHistory th:nth-child(2),#atlasFinancialHistory td:nth-child(2){min-width:240px}#atlasFinancialHistory .toolbar{gap:10px;flex-wrap:wrap}#atlasFinancialHistory select{max-width:100%;padding:8px}';document.head.appendChild(style);
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const euro=v=>Number(v||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
 let patient=null,rows=[],serial=0,generation=0,timer;const waiting=new Map();
 function draw(){
  const groups=model.paymentGroups(rows),selected=groups[$('atlasFinancialFilter').value]||groups.all;
  $('atlasFinancialRows').innerHTML=selected.length?'<table><thead><tr><th>Fecha del pago</th><th>Concepto</th><th>Tipo de operación</th><th>Importe</th><th>Método</th><th>Estado del pago</th><th>Referencia</th><th>Vinculación</th></tr></thead><tbody>'+selected.map(p=>{
   const meta=p.metadata||{},lines=Array.isArray(meta.invoice_lines)?meta.invoice_lines:Array.isArray(meta.koibox?.lines)?meta.koibox.lines:[],concept=lines.map(l=>l.description||l.descripcion).filter(Boolean).join(' + ')||(Array.isArray(meta.services)?meta.services:[]).join(' + ')||meta.payment_label||'Pago',links=model.allocations(p),method=meta.payment_method_label||({cash:'Metálico',card:'Tarjeta',transfer:'Transferencia',mixed:'Pago mixto',bizum:'Bizum',financing:'Financiación'})[p.method]||p.method||'Sin indicar';
   const date=p.paid_at?new Date(p.paid_at).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}):'Sin fecha confirmada';
   return '<tr><td>'+esc(date)+'</td><td>'+esc(concept)+'</td><td>'+esc(model.operationType(p))+'</td><td>'+euro(p.amount)+'</td><td>'+esc(method)+'</td><td>'+esc(model.paymentState(p))+'</td><td>'+esc(p.receipt_number||p.external_reference||p.client_ref||'Sin referencia')+'</td><td>'+esc(links.length?links.length+' cita(s) vinculada(s)':p.budget_id?'Presupuesto':'Sin cita vinculada')+'</td></tr>';
  }).join('')+'</tbody></table>':'<p>No hay operaciones con este filtro.</p>';
 }
 function request(action,payload){return new Promise((resolve,reject)=>{const id='financial-history-'+Date.now()+'-'+(++serial),timeout=setTimeout(()=>{waiting.delete(id);reject(Error('El servidor no ha respondido.'))},20000);waiting.set(id,{resolve,reject,timeout});parent.postMessage({type:'atlas:central-db-request',requestId:id,action,payload},'*')});}
 function drawSummary(summary){
  $('atlasFinancialBalance').textContent='Saldo pendiente: '+euro(summary.balance)+' · Presupuestos aceptados y deuda registrada. El estado de la cita no modifica este cálculo.';
  const pending=(summary.charges||[]).filter(c=>c.remaining>0);
  $('atlasFinancialCharges').innerHTML=pending.length?'<h3>Importes pendientes de presupuestos</h3>'+pending.map(c=>'<div class="row"><span>'+esc(c.name)+' · '+esc(c.status)+'</span><b>'+euro(c.remaining)+'</b></div>').join(''):'';
 }
 async function load(){
  const id=patient?.remoteId,version=++generation;rows=[];draw();$('atlasFinancialBalance').textContent='Saldo pendiente: sin comprobar';$('atlasFinancialCharges').innerHTML='';if(!id){$('atlasFinancialState').textContent='Selecciona una ficha sincronizada para consultar los pagos.';return;}
  $('atlasFinancialState').textContent='Consultando pagos…';
  try{const [data,summary]=await Promise.all([request('payments:list',{patientId:id}),request('patients:financialSummary',{patientId:id})]);if(version!==generation||id!==patient?.remoteId)return;rows=Array.isArray(data)?data:[];draw();drawSummary(summary);$('atlasFinancialState').textContent=rows.length+' operaciones registradas. Las devoluciones y anulaciones se conservan en el historial.';}
  catch(e){if(version===generation)$('atlasFinancialState').textContent='No se han podido comprobar los pagos: '+e.message;}
 }
 $('atlasFinancialFilter').onchange=draw;$('atlasFinancialRefresh').onclick=load;
 window.addEventListener('message',event=>{
  const m=event.data||{};if(m.type==='atlas:central-db-response'&&waiting.has(m.requestId)){const p=waiting.get(m.requestId);waiting.delete(m.requestId);clearTimeout(p.timeout);m.ok?p.resolve(m.data):p.reject(Error(m.error||'Error del servidor'));return;}
  if(m.type==='atlas:load-patient'){patient=m.patient||null;generation++;$('atlasFinancialBalance').textContent='Saldo pendiente: sin comprobar';$('atlasFinancialCharges').innerHTML='';clearTimeout(timer);rows=[];draw();$('atlasFinancialState').textContent='Consultando pagos…';timer=setTimeout(load,100);}
  if(['atlas:payment-recorded','atlas:central-payments-changed','atlas:central-cash-changed','atlas:budget-payment-recorded','atlas:direct-sale-recorded'].includes(m.type)){clearTimeout(timer);timer=setTimeout(load,300);}
 });
})();
