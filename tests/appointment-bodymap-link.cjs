const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const agenda=fs.readFileSync('modules/agenda.html','utf8'),ficha=fs.readFileSync('modules/ficha.html','utf8');
const start=agenda.indexOf("document.getElementById('openAppointmentBodyMapBtn').onclick="),end=agenda.indexOf("document.getElementById('saveAppointmentCommentBtn').onclick",start);
function setup(){
 const button={},sent=[],alerts=[],closed=[],appointment={id:'appt-test',patientRemoteId:'patient-test-A',patientCode:'TEST-A',patient:'Paciente de prueba'};
 const context={appointments:[appointment,{id:'other',patientRemoteId:'patient-test-B',patientCode:'TEST-B',patient:'Paciente de prueba'}],selectedId:appointment.id,patientMaster:[{remoteId:'patient-test-A',code:'TEST-A',name:'Paciente de prueba'}],patientByCode:code=>context.patientMaster.find(p=>p.code===code),patientFromResolvedRow:row=>row&&({remoteId:row.id,code:row.patient_number,name:'Paciente sintético'}),window:{},parent:{postMessage:m=>sent.push(m)},alert:m=>alerts.push(m),document:{getElementById:id=>id==='openAppointmentBodyMapBtn'?button:{classList:{remove:value=>closed.push(value)}}}};
 vm.createContext(context);vm.runInContext(agenda.slice(start,end),context);return {context,button,sent,alerts,closed,appointment};
}
(async()=>{
 let c=setup();await c.button.onclick();assert.equal(c.sent.length,1);assert.equal(c.sent[0].patient.remoteId,'patient-test-A');assert.equal(c.sent[0].targetPanel,'mapaCorporal');assert.equal(c.sent[0].appointments.length,1);assert.equal(c.button.disabled,false);
 c=setup();c.context.patientMaster=[];let action,payload;c.context.window.atlasCentralRequest=async(a,p)=>{action=a;payload=p;return {id:'patient-test-A',patient_number:'TEST-A'}};await c.button.onclick();assert.equal(action,'patients:resolve');assert.equal(payload.id,'patient-test-A');assert.equal(c.sent.length,1);
 c=setup();delete c.appointment.patientRemoteId;c.context.patientMaster=[];c.context.window.atlasCentralRequest=async(a,p)=>{assert.equal(p.patientNumber,'TEST-A');return {id:'patient-test-A',patient_number:'TEST-A'}};await c.button.onclick();assert.equal(c.sent.length,1);
 c=setup();delete c.appointment.patientRemoteId;delete c.appointment.patientCode;await c.button.onclick();assert.equal(c.sent.length,0);assert.equal(c.alerts.length,1,'No se enlaza solo por nombre');
 c=setup();c.context.patientMaster=[];c.context.window.atlasCentralRequest=async()=>({id:'patient-test-B',patient_number:'TEST-B'});await c.button.onclick();assert.equal(c.sent.length,0);assert.equal(c.button.disabled,false);
 c=setup();c.context.patientMaster=[];let resolve;c.context.window.atlasCentralRequest=()=>new Promise(r=>resolve=r);const task=c.button.onclick();c.context.selectedId='otra-cita';resolve({id:'patient-test-A',patient_number:'TEST-A'});await task;assert.equal(c.sent.length,0,'Una respuesta atrasada no abre otra ficha');assert.equal(c.closed.length,0);
 c=setup();c.context.patientMaster=[];c.context.window.atlasCentralRequest=async()=>{throw new Error('Sin conexión sintética')};await c.button.onclick();assert.equal(c.sent.length,0);assert.match(c.alerts[0],/Sin conexión/);assert.equal(c.button.disabled,false);
 const route=ficha.slice(ficha.indexOf('function openPatientRoute('),ficha.indexOf('\n',ficha.indexOf('function openPatientRoute(')));
 const toggles={},area={dataset:{area:'clinical'},classList:{toggle:(key,value)=>toggles.active=value}};let opened;
 const ctx={document:{getElementById:id=>({classList:{toggle:(key,value)=>toggles[id]=value},remove(){}}),querySelectorAll:()=>[area]},openPatientPanel:id=>opened=id,setTimeout(){}};vm.runInNewContext(route,ctx);ctx.openPatientRoute('mapaCorporal','',null);assert.equal(opened,'mapaCorporal');assert.equal(toggles.active,true);assert.equal(toggles.administrativeTabs,true);assert.equal(toggles.clinicalTabs,false);
 console.log('OK: acceso por cita, resolución exacta, homónimos, cambio de cita, error de conexión y ruta clínica. Sin escrituras ni pacientes reales.');
})().catch(e=>{console.error(e);process.exitCode=1});
