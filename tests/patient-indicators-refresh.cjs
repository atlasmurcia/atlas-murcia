const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('modules/ficha.html','utf8');
const script=html.match(/<script id="atlas-live-patient-indicators">([\s\S]*?)<\/script>/)[1];
const nodes=Array.from({length:7},()=>({textContent:'—',closest(){return this}})),state={},button={},chip={},requests=[],listeners={},timers=new Map();let n=0;
const window={addEventListener(type,fn){listeners[type]=fn}},document={hidden:false,querySelectorAll(){return nodes},getElementById(id){return id==='patientIndicatorsState'?state:button},querySelector(){return chip},addEventListener(){}};
const parent={postMessage(message){requests.push(message)}};
vm.runInNewContext(script,{window,document,parent,Date,Intl,Map,Error,setTimeout(fn,ms){timers.set(++n,{fn,ms});return n},clearTimeout(id){timers.delete(id)},setInterval(){}});
const send=data=>listeners.message({data});
const response=(request,data,ok=true)=>send({type:'atlas:central-db-response',requestId:request.requestId,ok,data,error:ok?'':'Fallo de conexión de prueba'});
const last=()=>requests.at(-1),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function schedule(){for(const [id,t] of [...timers])if(t.ms===350){timers.delete(id);t.fn()}await tick()}
const data=(completed=4)=>({completed,pending:3,next:'2026-11-09T09:00:00Z',last:'2026-11-06T08:00:00Z',balance:50,progress:57,totalSales:250,checkedAt:'2026-11-06T17:00:00Z'});
(async()=>{
 send({type:'atlas:load-patient',patient:{code:'TEST-1'}});
 await button.onclick();assert.match(state.textContent,/Esperando conexión/);assert.equal(last().type,'atlas:central-module-ready');
 send({type:'atlas:central-ready'});await schedule();
 assert.equal(last().action,'patients:resolve');assert.equal(last().payload.patientNumber,'TEST-1');
 response(last(),{id:'synthetic-1'});await tick();assert.equal(last().action,'patients:indicators');assert.equal(last().payload.patientId,'synthetic-1');
 response(last(),data());await tick();assert.equal(nodes[0].textContent,4);assert.match(state.textContent,/Actualizado/);assert.equal(button.disabled,false);
 // A later appointment payload without remoteId must not unlink the same patient.
 send({type:'atlas:load-patient',patient:{code:'TEST-1'}});await schedule();assert.equal(last().action,'patients:indicators');response(last(),data(5));await tick();assert.equal(nodes[0].textContent,5);
 // Manual refresh actually re-reads and recovers after a failed request.
 let load=button.onclick();response(last(),null,false);await load;assert.match(state.textContent,/Pulsa Actualizar/);assert.equal(button.disabled,false);
 load=button.onclick();response(last(),data(6));await load;assert.equal(nodes[0].textContent,6);
 // Delayed resolution cannot populate another patient's summary.
 send({type:'atlas:load-patient',patient:{code:'TEST-2'}});await schedule();const stale=last();assert.equal(stale.action,'patients:resolve');
 send({type:'atlas:load-patient',patient:{code:'TEST-3',remoteId:'synthetic-3'}});await schedule();response(stale,{id:'synthetic-2'});await tick();await schedule();assert.equal(last().payload.patientId,'synthetic-3');response(last(),data(9));await tick();assert.equal(nodes[0].textContent,9);
 send({type:'atlas:load-patient',patient:{code:'MISSING'}});await schedule();response(last(),null);await tick();assert.match(state.textContent,/No se ha encontrado/);assert.equal(button.disabled,false);assert.equal(nodes[0].textContent,'—');
 send({type:'atlas:load-patient',patient:{name:'Sin identificador'}});const count=requests.length;await button.onclick();assert.equal(requests.length,count);assert.match(state.textContent,/falta el número/);
 // The actual drawer sends the complete master identity, or the appointment's stable ID.
 const agenda=fs.readFileSync('modules/agenda.html','utf8'),start=agenda.indexOf(' const originalOpenDrawer=window.openDrawer;'),end=agenda.indexOf(' const searchResults=',start),out=[];
 const master={remoteId:'synthetic-1',code:'TEST-1',name:'Paciente de prueba',phone:'',photo:''};
 const sandbox={window:{openDrawer(){}},appointments:[{id:1,patientRemoteId:'synthetic-1',patientCode:'TEST-1',patient:'Paciente de prueba'}],patientMaster:[master],patientByCode:()=>master,parent:{postMessage(m){out.push(m)}}};
 vm.runInNewContext(agenda.slice(start,end),sandbox);sandbox.window.openDrawer(1);assert.equal(out[0].patient.remoteId,'synthetic-1');assert.equal(out[0].patient.code,'TEST-1');
 console.log('Resumen: enlace por número de ficha, identidad desde cita, actualización manual, error y reintento, cambio de paciente y respuesta atrasada verificados.');
})().catch(e=>{console.error(e);process.exitCode=1});
