const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/ficha.html','utf8');
const source=html.split('<script id="atlas-central-budgets-v22">')[1].split('</script>')[0];
function setup(){
 const events={},docEvents={},intervals=[],timers=[],sent=[],labels={textContent:'',style:{}},reads=[];
 let visible=true,renders=0,receipts=0;
 const ctx={console:{error(){}},Map,Set,Promise,JSON,Number,String,Math,Date,Error,crypto:{randomUUID:()=> 'synthetic-operation'},
  document:{hidden:false,getElementById:()=>labels,addEventListener:(type,fn)=>docEvents[type]=fn},
  parent:{postMessage:m=>sent.push(m)},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},setInterval:fn=>intervals.push(fn),
  budgets:[],currentBudgetId:1,currentBudgetPatientCode:'synthetic',budgetTotal:b=>(b.lines||[]).reduce((sum,l)=>sum+l[1]*l[2],0),
  renderBudgetCards:()=>renders++,selectBudget(){},alert(){},confirm:()=>false,blankPatientBudget:()=>({lines:[]})};
 ctx.window={frameElement:{getClientRects:()=>visible?[{}]:[]},persistBudgets(){},addEventListener:(type,fn)=>events[type]=fn,atlasLoadBudgetReceipts:()=>receipts++};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const message=data=>events.message({data}),flush=()=>new Promise(resolve=>setImmediate(resolve));
 function reply(rows,ok=true){const m=sent.filter(x=>x.action==='budgets:list'&&!reads.includes(x.requestId)).at(-1);assert.ok(m);reads.push(m.requestId);message({type:'atlas:central-db-response',requestId:m.requestId,ok,data:rows,error:'Error sintético'})}
 return {ctx,sent,intervals,labels,docEvents,message,reply,flush,get renders(){return renders},get receipts(){return receipts},setVisible:v=>visible=v,focus:()=>events.focus(),timers};
}
// Ejecutamos los temporizadores de carga sin esperar su promesa de red.
async function initial(c,rows=[]){c.message({type:'atlas:central-ready'});c.message({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});const task=c.timers.find(t=>t.delay===180).fn();c.reply(rows);await task;return c}
const row={id:'synthetic-budget',client_ref:'budget-synthetic-2',patient_id:'synthetic-patient',metadata:{local_id:2},name:'Presupuesto de prueba',status:'draft',total:50,updated_at:'2026-11-06T12:00:00Z',budget_lines:[{service_name:'Tratamiento de prueba',sessions:1,unit_price:50,line_order:1}]};
(async()=>{
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
 console.log('Presupuestos: actualización entre equipos, lecturas sin solapar, datos sin cambios, editor protegido, foco, errores y respuestas antiguas comprobados.');
})().catch(error=>{console.error(error);process.exitCode=1});
