const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const agenda=fs.readFileSync('modules/agenda.html','utf8');
const atlas=fs.readFileSync('atlas.html','utf8');
const fichaRuntime=fs.readFileSync('modules/ficha-patient-tasks.js','utf8');
const taskRuntime=agenda.match(/<script id="atlas-internal-tasks-main-runtime">([\s\S]*?)<\/script>/)[1];
test('La búsqueda conserva el paciente elegido y permite quitar el vínculo',()=>{
 const code=taskRuntime.slice(taskRuntime.indexOf(' function refreshPatientOptions('),taskRuntime.indexOf(' function openLinkedTask('));
 const select={value:'',innerHTML:''},state={};
 const env={document:{getElementById:()=>select},patientSearch:{value:''},patientSearchState:state,patientMaster:[{remoteId:'synthetic-a',name:'Paciente Ámbar',code:'9991',phone:'000000001'},{remoteId:'synthetic-b',name:'Paciente Azul',code:'9992',phone:'000000002'}],tasks:[],esc:String,normalizeTaskSearch:value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()};
 vm.createContext(env);vm.runInContext(code,env);
 for(const query of ['azul','9992','000000002']){env.refreshPatientOptions('synthetic-a',query);assert.equal(select.value,'synthetic-a');assert(select.innerHTML.includes('synthetic-b'));assert(state.textContent.includes('Paciente elegido: Paciente Ámbar'))}
 env.tasks=[{patient_id:'synthetic-old',patient:{first_name:'Paciente',last_name_1:'Anterior'}}];env.refreshPatientOptions('synthetic-old','sin resultados');assert.equal(select.value,'synthetic-old');assert(select.innerHTML.includes('Paciente Anterior'));
 env.refreshPatientOptions('','sin resultados');assert.equal(select.value,'');assert(state.textContent.includes('No se encontraron'));
 assert(taskRuntime.includes("patientId:document.getElementById('atlasTaskPatient').value||null"));
});
test('La tarea abre la ficha elegida en ATLAS y conserva la vuelta al listado',()=>{
 const code=taskRuntime.slice(taskRuntime.indexOf(' function openLinkedTask('),taskRuntime.indexOf(' function refreshCreatorFilter('));
 const sent=[],env={tasks:[{id:'task-a',patient_id:'synthetic-a',patient:{first_name:'Paciente',last_name_1:'Ámbar'}}],patientMaster:[],parent:{postMessage:msg=>sent.push(msg)}};
 vm.createContext(env);vm.runInContext(code,env);env.openLinkedTask('task-a');assert.equal(sent[0].patient.remoteId,'synthetic-a');assert.equal(sent[0].targetPanel,'tareasPaciente');assert(sent[0].openFicha&&sent[0].returnToTasks);
 env.tasks[0].patient_id=null;env.openLinkedTask('task-a');assert.equal(sent.length,1);
 assert(atlas.includes("returnToTasks:msg.returnToTasks===true,targetPanel:msg.targetPanel"));
});
test('La ficha muestra tareas internas y de seguimiento, y descarta respuestas antiguas',async()=>{
 const listeners={},outgoing=[],panel={innerHTML:'',querySelector:()=>({onclick:null})};
 const env={document:{getElementById:()=>panel,querySelector:()=>({addEventListener(){}})},window:{addEventListener:(type,fn)=>listeners[type]=fn},parent:{postMessage:msg=>outgoing.push(msg)},setTimeout:()=>1,clearTimeout(){}};
 vm.runInNewContext(fichaRuntime,env);
 const send=data=>listeners.message({data});
 send({type:'atlas:central-ready'});send({type:'atlas:load-patient',patient:{remoteId:'synthetic-a',name:'Paciente Ámbar'}});
 const first=outgoing.splice(0).filter(msg=>msg.type==='atlas:central-db-request');assert.equal(first.length,2);assert(first.every(msg=>msg.payload.patientId==='synthetic-a'));
 send({type:'atlas:load-patient',patient:{remoteId:'synthetic-b',name:'Paciente Azul'}});
 const second=outgoing.splice(0);
 const answer=(request,rows)=>send({type:'atlas:central-db-response',requestId:request.requestId,ok:true,data:rows});
 for(const request of second)answer(request,request.action==='internalTasks:list'?[{patient_id:'synthetic-b',title:'Tarea Azul',status:'pending',area:'recepcion'},{patient_id:'synthetic-b',title:'Tarea terminada',status:'completed'},{patient_id:'synthetic-b',title:'Tarea cancelada',status:'cancelled'},{patient_id:'synthetic-a',title:'No debe aparecer'}]:[{channel:'task',summary:'Seguimiento Azul',source:'patient'},{channel:'note',summary:'No es tarea'}]);
 await new Promise(resolve=>setImmediate(resolve));
 assert(panel.innerHTML.includes('Tarea Azul'));assert(panel.innerHTML.includes('Seguimiento Azul'));assert(panel.innerHTML.includes('Completada'));assert(panel.innerHTML.includes('Cancelada'));assert(!panel.innerHTML.includes('No debe aparecer'));assert(!panel.innerHTML.includes('No es tarea'));
 for(const request of first)answer(request,[{patient_id:'synthetic-a',title:'Respuesta antigua'}]);
 await new Promise(resolve=>setImmediate(resolve));assert(!panel.innerHTML.includes('Respuesta antigua'));assert(panel.innerHTML.includes('Paciente Azul'));
 send({type:'atlas:load-patient',patient:null});assert(!panel.innerHTML.includes('Tarea Azul'));
});
test('La consulta del puente filtra por paciente, organización y clínica',async()=>{
 const from=atlas.indexOf("else if(['internalTasks:list','internalTasks:create','internalTasks:update'].includes(m.action))"),to=atlas.indexOf("else if(m.action==='leads:completePending')",from);
 const body=atlas.slice(from,to).replace(/^else /,'');
 const records=[{id:'task-a',organization_id:'org',clinic_id:'clinic',patient_id:'a',status:'pending'},{id:'task-b',organization_id:'org',clinic_id:'clinic',patient_id:'b',status:'pending'},{id:'task-c',organization_id:'other',clinic_id:'clinic',patient_id:'a',status:'pending'}];
 function database(){return {from(table){let rows=table==='atlas_internal_tasks'?records.slice():[];const q={select(){return q},eq(key,value){rows=rows.filter(row=>row[key]===value);return q},not(key,op,value){rows=rows.filter(row=>!['completed','cancelled'].includes(row[key]));return q},in(key,values){rows=rows.filter(row=>values.includes(row[key]));return q},order(){return q},range(from,to){return Promise.resolve({data:rows.slice(from,to+1),error:null})},limit(n){rows=rows.slice(0,n);return q},then(resolve){resolve({data:rows,error:null})}};return q}}}
 const frame={},context={organizationId:'org',clinicId:'clinic'},document={getElementById:id=>({contentWindow:id==='fichaFrame'?frame:{}})};
 async function run(action,payload={},origin='https://atlas.test'){
  return vm.runInNewContext('(async()=>{let result;'+body+';return result})()',{db:database(),context,document,location:{origin:'https://atlas.test'},e:{source:frame,origin},m:{action,payload}});
 }
 const result=await run('internalTasks:list',{patientId:'a'});assert.equal(result.data.length,1);assert.equal(result.data[0].id,'task-a');
 await assert.rejects(run('internalTasks:list',{}),/Origen de tareas/);
 await assert.rejects(run('internalTasks:create',{patientId:'a'}),/Origen de tareas/);
 await assert.rejects(run('internalTasks:list',{patientId:'a'},'https://other.test'),/Origen de tareas/);
});
test('Los scripts modificados mantienen sintaxis válida',()=>{
 for(const file of ['atlas.html','modules/agenda.html','modules/ficha.html'])for(const [,attrs,script] of fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/application\/(?:ld\+)?json/.test(attrs))continue;new vm.Script(script,{filename:file})}
 new vm.Script(fichaRuntime);
});
