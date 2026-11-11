const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(__dirname+'/../modules/agenda-waitlist-central.js','utf8');

function makeHarness({local=[],server=[],sharedServer=null,failFirstRead=false}={}){
 const storage=new Map(),nodes=new Map(),state={server:sharedServer||server.map(entry=>({...entry})),alerts:[],refreshes:0,saves:0,logs:[],requests:[]};
 function makeClassList(initial=[]){const values=new Set(initial);return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)}}
 function node(id){if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',disabled:false,classList:makeClassList(id==='waitForm'?['hidden']:[]),style:{},scrollIntoView(){},parentNode:{insertBefore(){}}});return nodes.get(id)}
 let messageHandler;
 const window={ATLAS_CHILD_CENTRAL_CONTEXT:{organizationId:'org-synthetic',clinicId:'clinic-synthetic',userId:'user-synthetic'},addEventListener(type,handler){if(type==='message')messageHandler=handler}};
 const context={
  window,
  parent:{postMessage(message){state.requests.push(message);let ok=true,data=null,error='';const payload=message.payload||{};
   if(message.action==='waitlist:list'){if(failFirstRead){failFirstRead=false;ok=false;error='synthetic read failure'}else data=state.server.filter(entry=>!entry.deleted).map(entry=>({...entry}))}
   else if(message.action==='waitlist:import'){for(const entry of payload.entries||[])if(!state.server.some(row=>row.id===entry.id))state.server.push({...entry});data=[]}
   else if(message.action==='waitlist:save'){const i=state.server.findIndex(row=>row.id===payload.entry?.id);if(i<0)state.server.push({...payload.entry});else state.server[i]={...payload.entry};data={...payload.entry}}
   else if(message.action==='waitlist:delete'){const row=state.server.find(entry=>entry.id===payload.id);if(row)row.deleted=true;data=row?{id:row.id}:null}
   else{ok=false;error='unexpected synthetic action '+message.action}
   messageHandler({data:{type:'atlas:central-db-response',requestId:message.requestId,ok,data,error}});
  }},
  document:{hidden:false,getElementById:node,createElement(){return {className:'',textContent:'',style:{},parentNode:{insertBefore(){}}}},
    querySelector(){return null}},
  localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))},
  waitlist:local.map(entry=>({...entry})),waitlistMatchedIds:[],save(){state.saves++},refreshWaitlist(){state.refreshes++},
  patientByCode:code=>code?{name:'Paciente sintético',phone:'000000000',code}:null,
  readWaitlistServices:()=>[],logAgenda:text=>state.logs.push(text),
  saveWaitBtn:node('saveWaitBtn'),confirm:()=>true,alert:text=>state.alerts.push(text),
  console:{warn(){},error(){}},setInterval(fn){state.interval=fn;return 1},clearTimeout,setTimeout,
  Date,Math,Number,String,Array,Set,Map,Promise,JSON,Object,Error
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {context,state,storage,node};
}
const entry={id:'W123',patientCode:'SYN-1',patient:'Paciente sintético',phone:'000000000',professional:'Cualquiera',service:'SIS',services:['SIS'],startDate:'2026-11-11',endDate:'2026-11-11',startTime:'09:00',endTime:'12:00',duration:30,bookedDate:'',notes:'nota de prueba',status:'Activa',createdAt:'2026-11-11T08:00:00.000Z'};

test('importa una vez el contenido local y muestra la lista central',async()=>{
 const h=makeHarness({local:[entry]});
 h.node('waitlistBtn').onclick();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(h.state.server.length,1);
 assert.equal(h.context.waitlist.length,1);
 assert.equal(h.context.waitlist[0].id,'W123');
 assert.ok([...h.storage.keys()].some(key=>key.endsWith(':backup')));
 assert.equal(h.state.requests.filter(message=>message.action==='waitlist:import').length,1);
 assert.equal(h.node('waitlistSyncNotice').textContent.startsWith('Lista de espera compartida'),true);
});

test('no presenta una lista vacía si falla la lectura central',async()=>{
 const h=makeHarness({local:[entry],failFirstRead:true});
 h.node('waitlistBtn').onclick();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(h.context.waitlist.length,1);
 assert.match(h.node('waitlistList').innerHTML,/No se ha podido cargar/);
 assert.equal(h.state.requests.some(message=>message.action==='waitlist:import'),false);
});

test('confirma alta, cambio de estado y eliminación en el servidor sintético',async()=>{
 const h=makeHarness();
 h.node('waitlistBtn').onclick();
 await new Promise(resolve=>setTimeout(resolve,0));
 h.node('wPatientCode').value='SYN-2';h.node('wPatient').value='Paciente sintético';
 h.node('wStartDate').value='2026-11-11';h.node('wEndDate').value='2026-11-11';
 h.node('wStartTime').value='10:00';h.node('wEndTime').value='12:00';h.node('wDuration').value='30';
 await h.context.window.saveWaitlistEntry();
 assert.equal(h.state.server.length,1);
 const id=h.state.server[0].id;
 await h.context.window.setWaitlistStatus(id,'Citada');
 assert.equal(h.state.server[0].status,'Citada');
 await h.context.window.deleteWaitlist(id);
 assert.equal(h.state.server.filter(row=>!row.deleted).length,0);
 assert.deepEqual(h.state.requests.slice(-3).map(message=>message.action),['waitlist:save','waitlist:save','waitlist:delete']);
});


test('dos sesiones ven y reciben cambios de la misma lista',async()=>{
 const sharedServer=[],first=makeHarness({local:[entry],sharedServer});
 first.node('waitlistBtn').onclick();
 await new Promise(resolve=>setTimeout(resolve,0));
 const second=makeHarness({sharedServer});
 second.node('waitlistBtn').onclick();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(second.context.waitlist.length,1);
 assert.equal(second.context.waitlist[0].id,'W123');
 await second.context.window.setWaitlistStatus('W123','Contactado');
 await first.state.interval();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(first.context.waitlist[0].status,'Contactado');
});
