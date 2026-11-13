const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync('modules/ficha-patient-tasks.js','utf8');
const atlas=fs.readFileSync('atlas.html','utf8');
const router=atlas.match(/<script id="atlas-visible-module-navigation-v42">([\s\S]*?)<\/script>/)[1];
function session(connected=true){
 const parentListeners=[],childListeners=[],messages=[],requests=[],retry={onclick:null};
 const panel={innerHTML:'',querySelector:()=>retry},frame={postMessage:data=>childListeners.forEach(fn=>fn({data}))};
 const parentWindow={ATLAS_CENTRAL_CONTEXT:connected?{userId:'synthetic-user',clinicId:'synthetic-clinic'}:null,addEventListener:(type,fn)=>parentListeners.push(fn)};
 vm.runInNewContext(router,{window:parentWindow,setTimeout:fn=>fn()});
 const parent={postMessage:data=>{messages.push(data);if(data.type==='atlas:central-db-request'){requests.push(data);queueMicrotask(()=>frame.postMessage({type:'atlas:central-db-response',requestId:data.requestId,ok:true,data:data.action==='internalTasks:list'?[{patient_id:data.payload.patientId,title:'Tarea sintética conectada',status:'pending'}]:[]}))}else parentListeners.forEach(fn=>fn({data,source:frame}))}};
 const env={document:{getElementById:()=>panel,querySelector:()=>({addEventListener(){}})},window:{addEventListener:(type,fn)=>childListeners.push(fn)},parent,setTimeout:()=>1,clearTimeout(){}};
 return {panel,messages,requests,parentWindow,parent,frame,env,retry};
}
test('Recupera el contexto del enrutador real aunque el aviso inicial haya llegado antes del script',async()=>{
 const s=session();s.frame.postMessage({type:'atlas:central-ready'});
 vm.runInNewContext(source,s.env);
 assert(s.messages.some(m=>m.type==='atlas:module-ready'&&m.module==='ficha'));
 s.frame.postMessage({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient',name:'Paciente de prueba'}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.requests.length,2);assert(s.panel.innerHTML.includes('Tarea sintética conectada'));assert(!s.panel.innerHTML.includes('Esperando la conexión'));
});
test('Actualizar tareas solicita de nuevo el contexto cuando la sesión se prepara más tarde',async()=>{
 const s=session(false);vm.runInNewContext(source,s.env);
 s.frame.postMessage({type:'atlas:load-patient',patient:{remoteId:'synthetic-patient'}});
 assert(s.panel.innerHTML.includes('Esperando la conexión'));assert.equal(s.requests.length,0);
 s.parentWindow.ATLAS_CENTRAL_CONTEXT={userId:'synthetic-user',clinicId:'synthetic-clinic'};
 s.retry.onclick();await new Promise(resolve=>setImmediate(resolve));
 assert(s.messages.some(m=>m.type==='atlas:central-module-ready'));assert.equal(s.requests.length,2);assert(s.panel.innerHTML.includes('Tarea sintética conectada'));
});
