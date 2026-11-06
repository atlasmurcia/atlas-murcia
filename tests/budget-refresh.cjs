const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/ficha.html','utf8');
const source=html.split('<script id="atlas-central-budgets-v22">')[1].split('</script>')[0];
function setup(){
 const events={},docEvents={},intervals=[],timers=[],sent=[],labels={textContent:'',style:{}},reads=[];
 let visible=true,renders=0,receipts=0,saves=0;
 const ctx={console:{error(){}},Map,Set,Promise,JSON,Number,String,Math,Date,Error,crypto:{randomUUID:()=> 'synthetic-operation'},
  document:{hidden:false,getElementById:()=>labels,addEventListener:(type,fn)=>docEvents[type]=fn},
  parent:{postMessage:m=>sent.push(m)},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},setInterval:fn=>intervals.push(fn),
  budgets:[],currentBudgetId:1,currentBudgetPatientCode:'synthetic',budgetTotal:b=>(b.lines||[]).reduce((sum,l)=>sum+l[1]*l[2],0),
  renderBudgetCards:()=>renders++,selectBudget(){},alert(){},confirm:()=>false,blankPatientBudget:()=>({lines:[]})};
 ctx.window={saveCurrentBudget:()=>{saves++;const b=ctx.budgets.find(b=>String(b.id)===String(ctx.currentBudgetId));if(!b)return;ctx.window.atlasBudgetEditorDirty=false;ctx.window.persistBudgets();ctx.window.persistBudgets();return true},frameElement:{getClientRects:()=>visible?[{}]:[]},persistBudgets(){},addEventListener:(type,fn)=>events[type]=fn,atlasLoadBudgetReceipts:()=>receipts++};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const message=data=>events.message({data}),flush=()=>new Promise(resolve=>setImmediate(resolve));
 function reply(rows,ok=true){const m=sent.filter(x=>x.action==='budgets:list'&&!reads.includes(x.requestId)).at(-1);assert.ok(m);reads.push(m.requestId);message({type:'atlas:central-db-response',requestId:m.requestId,ok,data:rows,error:'Error sintético'})}
 return {ctx,sent,intervals,labels,docEvents,message,reply,flush,get saves(){return saves},get renders(){return renders},get receipts(){return receipts},setVisible:v=>visible=v,focus:()=>events.focus(),timers};
}
// Ejecutamos los temporizadores de carga sin esperar su promesa de red.
async function initial(c,rows=[]){c.message({type:'atlas:central-ready'});c.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});const task=c.timers.find(t=>t.delay===180).fn();c.reply(rows);await task;return c}
const row={id:'synthetic-budget',client_ref:'budget-synthetic-2',patient_id:'synthetic-patient',metadata:{local_id:2},name:'Presupuesto de prueba',status:'draft',total:50,updated_at:'2026-11-06T12:00:00Z',budget_lines:[{service_name:'Tratamiento de prueba',sessions:1,unit_price:50,line_order:1}]};
(async()=>{
 // El puente conserva el filtro habitual y solo incluye bajas al solicitarlas, siempre bajo el mismo ámbito.
 const bridge=fs.readFileSync(__dirname+'/../atlas.html','utf8').split("else if(m.action==='budgets:list'){")[1].split('\n')[0].slice(0,-1);
 for(const includeDeleted of [false,true]){const calls=[],query={select:v=>(calls.push(['select',v]),query),eq:(k,v)=>(calls.push(['eq',k,v]),query),is:(k,v)=>(calls.push(['is',k,v]),query),order:()=>[]};
  const context={db:{from:table=>(assert.equal(table,'budgets'),query)},m:{payload:{patientId:'synthetic-patient',includeDeleted}},context:{organizationId:'synthetic-org',clinicId:'synthetic-clinic'}};
  await vm.runInNewContext('(async()=>{let result;'+bridge+';return result})()',context);
  assert.equal(calls.some(c=>c[0]==='is'&&c[1]==='deleted_at'),!includeDeleted);assert.ok(calls.some(c=>c[0]==='select'&&c[1].includes('deleted_at')));
  for(const key of ['organization_id','clinic_id','patient_id'])assert.ok(calls.some(c=>c[0]==='eq'&&c[1]===key));
 }
 const c=await initial(setup());assert.equal(c.ctx.budgets.length,0);
 // Un presupuesto creado en otro equipo llega mediante lectura, sin escribir ni crear copias.
 let task=c.intervals[0]();c.reply([row]);await task;assert.equal(c.ctx.budgets.length,1);assert.equal(c.ctx.budgets[0].centralId,row.id);
 const before=c.renders;task=c.intervals[0]();c.reply([row]);await task;assert.equal(c.renders,before,'Sin cambios no se repinta ni se solicitan justificantes');
 const count=c.sent.length;c.setVisible(false);await c.intervals[0]();c.setVisible(true);c.ctx.document.hidden=true;await c.intervals[0]();c.ctx.document.hidden=false;
 c.ctx.window.atlasBudgetEditorDirty=true;await c.intervals[0]();c.ctx.window.atlasBudgetEditorDirty=false;c.ctx.window.atlasBudgetDiscountEditing=true;await c.intervals[0]();c.ctx.window.atlasBudgetDiscountEditing=false;assert.equal(c.sent.length,count);
 // No se solapan dos lecturas y un borrador iniciado durante la lectura se conserva.
 task=c.intervals[0]();const inFlight=c.sent.length;await c.intervals[0]();assert.equal(c.sent.length,inFlight);c.ctx.window.atlasBudgetEditorDirty=true;c.reply([{...row,name:'Cambio remoto'}]);await task;assert.equal(c.ctx.budgets[0].name,row.name);c.ctx.window.atlasBudgetEditorDirty=false;
 // Recuperar el foco comprueba cambios; los fallos no vacían presupuestos.
 task=c.focus();c.reply(null,false);await task;assert.equal(c.ctx.budgets.length,1);assert.match(c.labels.textContent,/No se pudieron actualizar/);
 task=c.focus();c.reply([{...row,name:'Cambio confirmado'}]);await task;assert.equal(c.ctx.budgets[0].name,'Cambio confirmado');
 // Una respuesta del paciente anterior nunca sustituye la ficha nueva.
 task=c.intervals[0]();c.message({type:'atlas:load-patient',patient:{remoteId:'other-synthetic-patient'}});c.reply([{...row,name:'Respuesta antigua'}]);await task;assert.equal(c.ctx.budgets[0].name,'Cambio confirmado');
 assert.ok(c.sent.every(m=>m.action==='budgets:list'),'La actualización solo lee presupuestos del paciente');
 assert.ok(c.sent.every(m=>m.payload.patientId==='synthetic-patient'));
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

 // Las bajas del servidor retiran copias locales, incluso si una versión anterior perdió centralId.
 const deleted={...row,id:'deleted-synthetic-budget',client_ref:'budget-synthetic-patient-1',metadata:{local_id:1},deleted_at:'2026-11-06T14:00:00Z'};
 const stale=setup();stale.ctx.budgets=[{id:1,centralRef:deleted.client_ref,centralId:null,name:'Copia local antigua',lines:[['Prueba',1,50,0]]}];
 await initial(stale,[row,deleted]);assert.equal(stale.ctx.budgets.length,1);assert.equal(stale.ctx.budgets[0].centralId,row.id);assert.ok(stale.sent.every(m=>m.action==='budgets:list'),'La limpieza de copias solo lee el servidor');
 const empty=setup();empty.ctx.budgets=[{id:1,centralId:deleted.id,centralRef:deleted.client_ref,lines:[['Prueba',1,50,0]]}];await initial(empty,[deleted]);assert.equal(empty.ctx.budgets.length,1);assert.equal(empty.ctx.budgets[0].lines.length,0,'Sin presupuestos activos se muestra un editor vacío');
 const draft=setup();draft.ctx.budgets=[{id:3,name:'Borrador sin enviar',lines:[['Prueba',1,80,0]]}];await initial(draft,[row,deleted]);assert.ok(draft.ctx.budgets.some(b=>b.name==='Borrador sin enviar'),'Un borrador nuevo no se pierde por otra baja');
 const deletedEarly=setup();deletedEarly.message({type:'atlas:central-ready'});deletedEarly.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});deletedEarly.ctx.budgets=[{id:1,centralRef:deleted.client_ref,lines:[['Prueba',1,50,0]]}];deletedEarly.ctx.currentBudgetId=1;
 const deletedSave=deletedEarly.ctx.window.saveCurrentBudget();deletedEarly.reply([deleted]);assert.equal(await deletedSave,false);assert.equal(deletedEarly.saves,0,'Guardar durante la carga no envía un presupuesto eliminado');assert.ok(deletedEarly.sent.every(m=>m.action==='budgets:list'));

 console.log('Presupuestos: actualización entre equipos, lecturas sin solapar, datos sin cambios, editor protegido, foco, errores y respuestas antiguas comprobados.');
})().catch(error=>{console.error(error);process.exitCode=1});
