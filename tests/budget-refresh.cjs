const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/ficha.html','utf8');
const source=html.split('<script id="atlas-central-budgets-v22">')[1].split('</script>')[0];
function setup(){
 const events={},docEvents={},intervals=[],timers=[],sent=[],labels={textContent:'',style:{}},reads=[];
 let visible=true,renders=0,receipts=0,saves=0,operationSeq=0;const nodes=new Map(),snapshots=[];labels.insertAdjacentElement=(where,node)=>nodes.set(node.id,node);
 const ctx={console:{error(){}},Map,Set,Promise,JSON,Number,String,Math,Date,Error,crypto:{randomUUID:()=> 'synthetic-operation-'+(++operationSeq)},
  document:{hidden:false,getElementById:id=>id==='budgetSaved'?labels:nodes.get(id)||null,createElement:()=>({style:{},hidden:false}),addEventListener:(type,fn)=>docEvents[type]=fn},
  parent:{postMessage:m=>sent.push(m)},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},setInterval:fn=>intervals.push(fn),
  budgets:[],currentBudgetId:1,currentBudgetPatientCode:'synthetic',budgetTotal:b=>(b.lines||[]).reduce((sum,l)=>sum+l[1]*l[2],0),
  renderBudgetCards:()=>renders++,selectBudget(){},alert(){},confirm:()=>false,blankPatientBudget:()=>({lines:[]})};
 ctx.window={saveCurrentBudget:()=>{saves++;const b=ctx.budgets.find(b=>String(b.id)===String(ctx.currentBudgetId));if(!b)return;ctx.window.atlasBudgetEditorDirty=false;ctx.window.persistBudgets();ctx.window.persistBudgets();return true},frameElement:{getClientRects:()=>visible?[{}]:[]},persistBudgets(){snapshots.push(JSON.stringify(ctx.budgets))},addEventListener:(type,fn)=>events[type]=fn,atlasLoadBudgetReceipts:()=>receipts++};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const message=data=>events.message({data}),flush=()=>new Promise(resolve=>setImmediate(resolve));
 function reply(rows,ok=true){const m=sent.filter(x=>x.action==='budgets:list'&&!reads.includes(x.requestId)).at(-1);assert.ok(m);reads.push(m.requestId);message({type:'atlas:central-db-response',requestId:m.requestId,ok,data:rows,error:'Error sintético'})}
 return {ctx,sent,intervals,labels,nodes,snapshots,docEvents,message,reply,flush,get saves(){return saves},get renders(){return renders},get receipts(){return receipts},setVisible:v=>visible=v,focus:()=>events.focus(),timers};
}
// Ejecutamos los temporizadores de carga sin esperar su promesa de red.
async function initial(c,rows=[]){c.message({type:'atlas:central-ready'});c.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});const task=c.timers.find(t=>t.delay===180).fn();c.reply(rows);await task;return c}
const row={id:'synthetic-budget',client_ref:'budget-synthetic-2',patient_id:'synthetic-patient',metadata:{local_id:2},name:'Presupuesto de prueba',status:'draft',total:50,updated_at:'2026-11-06T12:00:00Z',budget_lines:[{service_name:'Tratamiento de prueba',sessions:1,unit_price:50,line_order:1}]};
(async()=>{
 // Incluir las bajas no elimina el ámbito de organización, clínica y paciente; los demás consumidores mantienen el filtro activo.
 const bridge=fs.readFileSync(__dirname+'/../atlas.html','utf8').split("else if(m.action==='budgets:list'){")[1].split('\n')[0].slice(0,-1);
 for(const includeDeleted of [false,true]){const calls=[],query={select:v=>(calls.push(['select',v]),query),eq:(k,v)=>(calls.push(['eq',k,v]),query),is:(k,v)=>(calls.push(['is',k,v]),query),order:()=>[]};await vm.runInNewContext('(async()=>{let result;'+bridge+';return result})()',{db:{from:table=>(assert.equal(table,'budgets'),query)},m:{payload:{patientId:'synthetic-patient',includeDeleted}},context:{organizationId:'synthetic-org',clinicId:'synthetic-clinic'}});assert.equal(calls.some(c=>c[0]==='is'&&c[1]==='deleted_at'),!includeDeleted);for(const key of ['organization_id','clinic_id','patient_id'])assert.ok(calls.some(c=>c[0]==='eq'&&c[1]===key));}
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

 // Nuevo borrador con el mismo número local que dos bajas: referencia única, guardada antes del envío.
 const deleted={...row,id:'deleted-one',client_ref:'budget-synthetic-patient-1',metadata:{local_id:1},deleted_at:'2026-11-09T08:00:00Z'},deleted2={...deleted,id:'deleted-two',client_ref:'budget-synthetic-patient-2',metadata:{local_id:2}};
 const fresh=setup();fresh.ctx.budgets=[{id:1,name:'Nuevo',lines:[['Prueba',1,50,0]]}];await initial(fresh,[deleted,deleted2]);fresh.ctx.window.saveCurrentBudget();
 let sending=fresh.timers.filter(t=>t.delay===0).at(-1).fn(),write=fresh.sent.filter(m=>m.action==='budgets:upsert').at(-1);
 assert.ok(write);assert.notEqual(write.payload.clientRef,deleted.client_ref);assert.notEqual(write.payload.clientRef,deleted2.client_ref);assert.ok(fresh.snapshots.some(s=>JSON.parse(s).some(b=>b.centralRef===write.payload.clientRef)),'La referencia se conserva antes de enviar');
 fresh.message({type:'atlas:central-db-response',requestId:write.requestId,ok:true,data:{id:'fresh-confirmed',updated_at:'2026-11-09T09:00:00Z'}});await sending;assert.equal(fresh.ctx.budgets[0].centralId,'fresh-confirmed');
 // Se conserva un borrador bloqueado. Solo la acción explícita crea una copia nueva, sin reactivar la baja.
 const blocked=setup(),draft={id:2,centralRef:deleted2.client_ref,name:'Borrador conservado',status:'Entregado',notes:'Nota de prueba',acceptedAt:'2026-11-09T08:00:00Z',lines:[['Prueba',2,50,5]],payments:[]};blocked.ctx.budgets=[draft];blocked.ctx.currentBudgetId=2;await initial(blocked,[deleted,deleted2]);
 const draftBefore=JSON.stringify(draft);assert.equal(blocked.ctx.budgets[0],draft);assert.equal(blocked.sent.filter(m=>m.action==='budgets:upsert').length,0);assert.equal(blocked.ctx.window.saveCurrentBudget(),false);
 assert.equal(blocked.sent.filter(m=>m.action==='budgets:upsert').length,0);assert.equal(blocked.nodes.get('atlasBudgetSaveAsNew').hidden,false);
 blocked.ctx.confirm=()=>true;blocked.nodes.get('atlasBudgetSaveAsNew').onclick();assert.equal(blocked.ctx.budgets.length,2);const copy=blocked.ctx.budgets[0];assert.equal(copy.id,3);assert.equal(copy.status,'Borrador');assert.equal(copy.centralId,undefined);assert.equal(copy.acceptedAt,undefined);assert.equal(JSON.stringify(copy.lines),JSON.stringify(draft.lines));assert.equal(copy.notes,draft.notes);assert.equal(JSON.stringify(blocked.ctx.budgets[1]),draftBefore);
 sending=blocked.timers.filter(t=>t.delay===0).at(-1).fn();write=blocked.sent.filter(m=>m.action==='budgets:upsert').at(-1);assert.ok(write);assert.notEqual(write.payload.clientRef,deleted2.client_ref);assert.equal(write.payload.patientId,'synthetic-patient');assert.equal(blocked.sent.filter(m=>m.action==='budgets:upsert').length,1);
 blocked.message({type:'atlas:central-db-response',requestId:write.requestId,ok:true,data:{id:'copy-confirmed',updated_at:'2026-11-09T09:01:00Z'}});await sending;assert.equal(copy.centralId,'copy-confirmed');assert.match(blocked.labels.textContent,/confirmado en servidor/);
 // Una baja que llega después de la lectura se comprueba antes de ofrecer recuperación.
 const late=setup();late.ctx.budgets=[{id:1,centralRef:deleted.client_ref,name:'Borrador tardío',lines:[['Prueba',1,50,0]]}];await initial(late,[]);late.ctx.window.saveCurrentBudget();sending=late.timers.filter(t=>t.delay===0).at(-1).fn();write=late.sent.filter(m=>m.action==='budgets:upsert').at(-1);
 late.message({type:'atlas:central-db-response',requestId:write.requestId,ok:false,error:'Presupuesto no disponible'});await late.flush();late.reply([deleted]);await sending;assert.equal(late.ctx.budgets.length,1);assert.equal(late.nodes.get('atlasBudgetSaveAsNew').hidden,false);
 late.ctx.confirm=()=>true;late.message({type:'atlas:load-patient',patient:{remoteId:'other-synthetic-patient'}});late.nodes.get('atlasBudgetSaveAsNew').onclick();assert.equal(late.ctx.budgets.length,1,'Una acción de la ficha anterior no crea copias en otro paciente');
 // Un conflicto real no cambia referencias ni salta el control de versiones.
 const conflict=setup();conflict.ctx.budgets=[{id:1,centralRef:'existing-reference',centralId:'existing-id',centralUpdatedAt:'old-revision',lines:[['Prueba',1,50,0]]}];await initial(conflict,[]);conflict.ctx.window.saveCurrentBudget();sending=conflict.timers.filter(t=>t.delay===0).at(-1).fn();write=conflict.sent.filter(m=>m.action==='budgets:upsert').at(-1);
 conflict.message({type:'atlas:central-db-response',requestId:write.requestId,ok:false,error:'Otro usuario ha actualizado este presupuesto'});await sending;assert.equal(conflict.ctx.budgets[0].centralRef,'existing-reference');assert.equal(conflict.nodes.get('atlasBudgetSaveAsNew'),undefined);assert.match(conflict.labels.textContent,/Otro usuario/);
 // Refrescar un borrador no reinventa una referencia ya asignada.
 const stable=setup();stable.ctx.budgets=[{id:3,centralRef:'budget-synthetic-patient-unique',name:'Sin enviar',lines:[['Prueba',1,80,0]]}];await initial(stable,[row]);assert.ok(stable.ctx.budgets.some(b=>b.centralRef==='budget-synthetic-patient-unique'));

 // Dos presupuestos de equipos distintos pueden traer el mismo número local; se seleccionan por referencias independientes.
 const shared=setup(),rowA={...row,id:'remote-a',client_ref:'unique-a',metadata:{local_id:1},name:'Equipo A'},rowB={...row,id:'remote-b',client_ref:'unique-b',metadata:{local_id:1},name:'Equipo B'};await initial(shared,[rowA,rowB]);assert.equal(new Set(shared.ctx.budgets.map(b=>b.id)).size,2);const second=shared.ctx.budgets.find(b=>b.centralId==='remote-b');shared.ctx.currentBudgetId=second.id;second.name='Cambio solo de B';shared.ctx.window.saveCurrentBudget();sending=shared.timers.filter(t=>t.delay===0).at(-1).fn();write=shared.sent.filter(m=>m.action==='budgets:upsert').at(-1);assert.equal(write.payload.clientRef,'unique-b');assert.equal(write.payload.expectedUpdatedAt,rowB.updated_at);assert.equal(shared.ctx.budgets.find(b=>b.centralId==='remote-a').name,'Equipo A');shared.message({type:'atlas:central-db-response',requestId:write.requestId,ok:true,data:{id:'remote-b',updated_at:'2026-11-09T09:02:00Z'}});await sending;
 // Cancelar la recuperación o conservar referencias de cobros no genera nuevas escrituras.
 const cancel=setup();cancel.ctx.budgets=[{id:1,centralRef:deleted.client_ref,lines:[['Prueba',1,50,0]],payments:[]}];await initial(cancel,[deleted]);cancel.nodes.get('atlasBudgetSaveAsNew').onclick();assert.equal(cancel.ctx.budgets.length,1);cancel.ctx.confirm=()=>true;cancel.ctx.budgets[0].payments=[{id:'synthetic-payment'}];cancel.nodes.get('atlasBudgetSaveAsNew').onclick();assert.equal(cancel.ctx.budgets.length,1);assert.equal(cancel.sent.filter(m=>m.action==='budgets:upsert').length,0);

 console.log('Presupuestos: actualización entre equipos, lecturas sin solapar, datos sin cambios, editor protegido, foco, errores y respuestas antiguas comprobados.');
})().catch(error=>{console.error(error);process.exitCode=1});
