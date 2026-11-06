const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/ficha.html','utf8');
const source=html.split('<script id="atlas-central-budgets-v22">')[1].split('</script>')[0];
function setup(userId='synthetic-user'){
 const events={},docEvents={},intervals=[],timers=[],sent=[],labels={textContent:'',style:{}},reads=[];
 let visible=true,renders=0,receipts=0,saves=0;
 const channels=[],removed=[];let authHandler;
 const db={channel:name=>{const ch={name,handlers:[],on(type,filter,fn){this.handlers.push({type,filter,fn});return this},subscribe(fn){this.status=fn;return this}};channels.push(ch);return ch},removeChannel:ch=>removed.push(ch),auth:{onAuthStateChange:fn=>{authHandler=fn;return {data:{subscription:{unsubscribe(){}}}}}}};
 const ctx={console:{error(){}},Map,Set,Promise,JSON,Number,String,Math,Date,Error,crypto:{randomUUID:()=> 'synthetic-operation'},
  document:{hidden:false,getElementById:()=>labels,addEventListener:(type,fn)=>docEvents[type]=fn},
  parent:{postMessage:m=>sent.push(m),ATLAS_CENTRAL_DB:db,ATLAS_CENTRAL_CONTEXT:{userId,organizationId:'synthetic-org',clinicId:'synthetic-clinic'}},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},setInterval:fn=>intervals.push(fn),
  budgets:[],currentBudgetId:1,currentBudgetPatientCode:'synthetic',budgetTotal:b=>(b.lines||[]).reduce((sum,l)=>sum+l[1]*l[2],0),
  renderBudgetCards:()=>renders++,selectBudget(){},alert(){},confirm:()=>false,blankPatientBudget:()=>({lines:[]})};
 ctx.window={saveCurrentBudget:()=>{saves++;const b=ctx.budgets.find(b=>String(b.id)===String(ctx.currentBudgetId));if(!b)return;ctx.window.atlasBudgetEditorDirty=false;ctx.window.persistBudgets();ctx.window.persistBudgets();return true},frameElement:{getClientRects:()=>visible?[{}]:[]},persistBudgets(){},addEventListener:(type,fn)=>events[type]=fn,atlasLoadBudgetReceipts:()=>receipts++};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const message=data=>events.message({data}),flush=()=>new Promise(resolve=>setImmediate(resolve));
 function reply(rows,ok=true){const m=sent.filter(x=>x.action==='budgets:list'&&!reads.includes(x.requestId)).at(-1);assert.ok(m);reads.push(m.requestId);message({type:'atlas:central-db-response',requestId:m.requestId,ok,data:rows,error:'Error sintético'})}
 return {ctx,sent,intervals,channels,removed,signOut:()=>authHandler('SIGNED_OUT'),refresh:()=>{message({type:'atlas:central-budgets-changed'});return timers.filter(t=>t.delay===80).at(-1).fn()},labels,docEvents,message,reply,flush,get saves(){return saves},get renders(){return renders},get receipts(){return receipts},setVisible:v=>visible=v,focus:()=>events.focus(),timers};
}
// Ejecutamos los temporizadores de carga sin esperar su promesa de red.
async function initial(c,rows=[]){c.message({type:'atlas:central-ready'});c.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});const task=c.timers.find(t=>t.delay===180).fn();c.reply(rows);await task;return c}
const row={id:'synthetic-budget',client_ref:'budget-synthetic-2',patient_id:'synthetic-patient',metadata:{local_id:2},name:'Presupuesto de prueba',status:'draft',total:50,updated_at:'2026-11-06T12:00:00Z',budget_lines:[{service_name:'Tratamiento de prueba',sessions:1,unit_price:50,line_order:1}]};
(async()=>{
 const c=await initial(setup());assert.equal(c.ctx.budgets.length,0);
 assert.equal(c.intervals.length,0,'No hay sondeo periódico de presupuestos');
 assert.equal(c.channels.length,1);assert.deepEqual(c.channels[0].handlers.map(h=>h.filter.table),['budgets','budget_lines','budget_lines','budget_lines']);
 assert.equal(c.channels[0].handlers[0].filter.filter,'patient_id=eq.synthetic-patient');
 // Un presupuesto creado en otro equipo llega mediante lectura, sin escribir ni crear copias.
 let task=c.refresh();c.reply([row]);await task;assert.equal(c.ctx.budgets.length,1);assert.equal(c.ctx.budgets[0].centralId,row.id);
 const before=c.renders;task=c.refresh();c.reply([row]);await task;assert.equal(c.renders,before,'Sin cambios no se repinta ni se solicitan justificantes');
 const count=c.sent.length;c.setVisible(false);await c.refresh();c.setVisible(true);c.ctx.document.hidden=true;await c.refresh();c.ctx.document.hidden=false;
 c.ctx.window.atlasBudgetEditorDirty=true;await c.refresh();c.ctx.window.atlasBudgetEditorDirty=false;c.ctx.window.atlasBudgetDiscountEditing=true;await c.refresh();c.ctx.window.atlasBudgetDiscountEditing=false;assert.equal(c.sent.length,count);
 // No se solapan dos lecturas y un borrador iniciado durante la lectura se conserva.
 task=c.refresh();const inFlight=c.sent.length;await c.refresh();assert.equal(c.sent.length,inFlight);c.ctx.window.atlasBudgetEditorDirty=true;c.reply([{...row,name:'Cambio remoto'}]);await task;assert.equal(c.ctx.budgets[0].name,row.name);c.ctx.window.atlasBudgetEditorDirty=false;
 // Recuperar el foco comprueba cambios; los fallos no vacían presupuestos.
 task=c.focus();c.reply(null,false);await task;assert.equal(c.ctx.budgets.length,1);assert.match(c.labels.textContent,/No se pudieron actualizar/);
 task=c.focus();c.reply([{...row,name:'Cambio confirmado'}]);await task;assert.equal(c.ctx.budgets[0].name,'Cambio confirmado');
 // Realtime entrega encabezados y líneas; una reconexión vuelve a leer y no duplica canales.
 const ch=c.channels[0],trigger=(table,event,newRow={})=>ch.handlers.find(h=>h.filter.table===table&&(h.filter.event===event||h.filter.event==='*')).fn({table,eventType:event,new:newRow});
 trigger('budgets','UPDATE',{patient_id:'synthetic-patient'});task=c.timers.filter(t=>t.delay===80).at(-1).fn();c.reply([{...row,name:'Aviso Realtime'}]);await task;assert.equal(c.ctx.budgets[0].name,'Aviso Realtime');
 trigger('budget_lines','UPDATE',{budget_id:row.id});task=c.timers.filter(t=>t.delay===80).at(-1).fn();c.reply([{...row,budget_lines:[{...row.budget_lines[0],sessions:2}]}]);await task;assert.equal(c.ctx.budgets[0].lines[0][1],2);
 const n=c.sent.length;trigger('budget_lines','UPDATE',{budget_id:'another-budget'});assert.equal(c.sent.length,n);
 c.ctx.window.atlasBudgetEditorDirty=true;trigger('budgets','UPDATE');await c.timers.filter(t=>t.delay===80).at(-1).fn();assert.equal(c.sent.length,n);c.ctx.window.atlasBudgetEditorDirty=false;
 task=c.timers.filter(t=>t.delay===400).at(-1).fn();c.reply([{...row,name:'Tras terminar borrador'}]);await task;assert.equal(c.ctx.budgets[0].name,'Tras terminar borrador');
 ch.status('SUBSCRIBED');task=c.timers.filter(t=>t.delay===80).at(-1).fn();c.reply([{...row,name:'Reconectado'}]);await task;assert.equal(c.ctx.budgets[0].name,'Reconectado');assert.equal(c.channels.length,1);
 // Una eliminación remota desaparece sin convertirla en una copia pendiente ni escribir.
 trigger('budget_lines','DELETE',{});task=c.timers.filter(t=>t.delay===80).at(-1).fn();c.reply([]);await task;assert.ok(c.ctx.budgets.every(b=>!b.centralId));assert.ok(c.ctx.budgets.every(b=>!b.lines.length));
 task=c.refresh();c.reply([{...row,name:'Cambio confirmado'}]);await task;
 // Una respuesta del paciente anterior nunca sustituye la ficha nueva.
 task=c.refresh();c.message({type:'atlas:load-patient',patient:{remoteId:'other-synthetic-patient'}});c.reply([{...row,name:'Respuesta antigua'}]);await task;assert.equal(c.ctx.budgets[0].name,'Cambio confirmado');assert.equal(c.removed.length,1);const countAfterSwitch=c.sent.length;ch.status('SUBSCRIBED');assert.equal(c.sent.length,countAfterSwitch);c.signOut();assert.equal(c.removed.length,2);
 assert.ok(c.sent.every(m=>m.action==='budgets:list'),'La actualización solo lee presupuestos del paciente');
 assert.ok(c.sent.every(m=>m.payload.patientId==='synthetic-patient'));
 // Dos clientes aislados: el guardado de A llega al estado de B solo por el aviso Realtime.
 const a=await initial(setup('synthetic-user-a')),b=await initial(setup('synthetic-user-b'));
 a.ctx.budgets=[{id:2,name:'Guardado en sesión A',lines:[['Tratamiento sintético',2,50,0]]}];a.ctx.currentBudgetId=2;
 a.ctx.window.saveCurrentBudget();const savingA=a.timers.filter(t=>t.delay===0).at(-1).fn(),writeA=a.sent.find(m=>m.action==='budgets:upsert');assert.ok(writeA);
 const savedRow={...row,name:writeA.payload.budget.name,client_ref:writeA.payload.clientRef,budget_lines:writeA.payload.lines.map((l,i)=>({...l,line_order:i+1}))};
 a.message({type:'atlas:central-db-response',requestId:writeA.requestId,ok:true,data:{id:savedRow.id,updated_at:savedRow.updated_at}});await savingA;
 b.channels[0].handlers[0].fn({table:'budgets',eventType:'INSERT',new:savedRow});task=b.timers.filter(t=>t.delay===80).at(-1).fn();b.reply([savedRow]);await task;
 assert.equal(b.ctx.budgets[0].name,'Guardado en sesión A');assert.equal(b.ctx.budgets[0].lines[0][1],2);assert.equal(b.ctx.budgets[0].centralId,a.ctx.budgets[0].centralId);assert.ok(b.sent.every(m=>m.action==='budgets:list'));assert.equal(b.intervals.length,0);
 // Guardar antes de terminar la primera carga espera la lectura y envía solo el presupuesto seleccionado.
 const early=setup();early.message({type:'atlas:central-ready'});early.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});
 const initialRead=early.timers.find(t=>t.delay===180).fn();
 early.ctx.budgets=[{id:2,name:'Borrador nuevo',lines:[['Tratamiento de prueba',1,50,0]]},{id:3,name:'Otra copia local',lines:[['Otro tratamiento',1,80,0]]}];early.ctx.currentBudgetId=2;
 const saving=early.ctx.window.saveCurrentBudget();assert.equal(early.saves,0);assert.equal(early.sent.length,1,'Se comparte la primera lectura');
 early.reply([]);await initialRead;await saving;assert.equal(early.saves,1);assert.equal(early.ctx.budgets[0].name,'Borrador nuevo');
 const sync=early.timers.filter(t=>t.delay===0).at(-1).fn();const writes=early.sent.filter(m=>m.action==='budgets:upsert');assert.equal(writes.length,1);assert.equal(writes[0].payload.budget.name,'Borrador nuevo');
 early.message({type:'atlas:central-db-response',requestId:writes[0].requestId,ok:true,data:{id:'synthetic-confirmed',updated_at:'2026-11-06T13:00:00Z'}});await sync;assert.equal(early.ctx.budgets[0].centralId,'synthetic-confirmed');
 // Un fallo de lectura permite reintentar sin perder el borrador y no ejecuta una escritura ciega.
 const offline=setup();offline.message({type:'atlas:central-ready'});offline.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});offline.ctx.budgets=[{id:2,name:'Borrador conservado',lines:[['Prueba',1,50,0]]}];offline.ctx.currentBudgetId=2;
 const failed=offline.ctx.window.saveCurrentBudget();offline.reply(null,false);assert.equal(await failed,false);assert.equal(offline.saves,0);assert.equal(offline.ctx.budgets[0].name,'Borrador conservado');assert.ok(offline.sent.every(m=>m.action==='budgets:list'));
 const retry=offline.ctx.window.saveCurrentBudget();offline.reply([]);await retry;assert.equal(offline.saves,1);
 const switched=setup();switched.message({type:'atlas:central-ready'});switched.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});switched.ctx.budgets=[{id:2,name:'Prueba',lines:[['Prueba',1,50,0]]}];switched.ctx.currentBudgetId=2;
 const staleSave=switched.ctx.window.saveCurrentBudget();switched.message({type:'atlas:load-patient',patient:{remoteId:'other-synthetic-patient'}});switched.reply([]);assert.equal(await staleSave,false);assert.equal(switched.saves,0);

 console.log('Presupuestos: guardado y visualización en dos clientes simulados, Realtime, reconexión, bajas, sin sondeo, borradores, carga inicial y respuestas antiguas: correcto.');
})().catch(error=>{console.error(error);process.exitCode=1});
