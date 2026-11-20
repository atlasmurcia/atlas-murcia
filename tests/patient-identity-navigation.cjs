const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const A={remoteId:'synthetic-a',code:'TEST-A',name:'Paciente Ficticio'},B={remoteId:'synthetic-b',code:'TEST-B',name:'Paciente Ficticio'};
const appointment=p=>({id:p.remoteId+'-appointment',patientRemoteId:p.remoteId,patientCode:p.code,patient:p.name,date:'2026-11-20',time:'10:00'});
function scriptList(html){return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>! /type=["'](?:application\/json|module)/.test(m[1])).map(m=>m[2]);}
function opening(html){const start=html.indexOf('async function openPatientRecord('),end=html.indexOf('\nfunction persistCustomPatients',start);assert(start>=0&&end>start);return html.slice(start,end);}
function matcher(html){return html.slice(html.indexOf('function atlasPatientMatches('),html.indexOf('function linkedPatientForAppointment('));}
async function race(html,patched){
 const messages=[],jobs=[];
 const sandbox={patientMaster:[A,B],patientByCode:code=>[A,B].find(p=>p.code===code),appointments:[appointment(A),appointment(B),{...appointment(B),id:'same-code-wrong-id',patientCode:A.code}],parent:{postMessage:m=>messages.push(m)},window:{atlasCentralRequest:()=>new Promise(resolve=>jobs.push(resolve)),atlasCentralAppointmentFromRow:x=>x},normalizeSearch:s=>String(s||'').toLowerCase(),console};
 vm.createContext(sandbox);vm.runInContext((patched?matcher(html)+'let atlasPatientRecordRequest=0;':'')+opening(html),sandbox);
 const first=sandbox.openPatientRecord(A.code),second=sandbox.openPatientRecord(B.code);
 if(patched){assert.equal(messages.filter(m=>m.type==='atlas:patient-selected').at(-1).patient.remoteId,B.remoteId);assert.equal(messages[0].appointments.length,1);}
 jobs[1]([appointment(B)]);await second;jobs[0]([appointment(A)]);await first;
 const selected=messages.filter(m=>m.type==='atlas:patient-selected');
 if(patched){assert.equal(selected.at(-1).patient.remoteId,B.remoteId);assert.equal(selected.length,2);assert.equal(messages.filter(m=>m.type==='atlas:patient-appointments-loaded').length,1);}
 else assert.equal(selected.at(-1).patient.remoteId,A.remoteId,'Baseline reproduces the wrong record after reversed responses');
}
(async()=>{
 for(const clinic of ['murcia']){
  const dir=root,html=fs.readFileSync(path.join(dir,'modules/agenda.html'),'utf8'),old=cp.execFileSync('git',['show','9d69c1986117499a205a778f6f8893661d4ef796:modules/agenda.html'],{cwd:dir,encoding:'utf8',maxBuffer:20*1024*1024});
  await race(old,false);await race(html,true);
  const sandbox={patientMaster:[A,B],patientByCode:code=>[A,B].find(p=>p.code===code)};vm.createContext(sandbox);
  vm.runInContext(matcher(html)+html.slice(html.indexOf('function linkedPatientForAppointment('),html.indexOf('const appointmentPatientResolutionPending')),sandbox);
  assert.equal(sandbox.atlasPatientMatches(A,B),false);assert.equal(sandbox.atlasPatientMatches({},{}),false);assert.equal(sandbox.atlasPatientMatches({patient:A.name},A),false);
  assert.equal(sandbox.atlasPatientMatches({patientRemoteId:B.remoteId,patientCode:A.code},A),false);
  assert.equal(sandbox.linkedPatientForAppointment({patientRemoteId:'missing-id',patientCode:B.code,patient:B.name}),null);
  assert.equal(sandbox.linkedPatientForAppointment({patient:A.name}),null);
  assert.equal(sandbox.linkedPatientForAppointment(appointment(A)).remoteId,A.remoteId);
  assert.equal(sandbox.linkedPatientForAppointment({patientCode:B.code}).remoteId,B.remoteId);
  let compiled=0;
  for(const file of [clinic==='alicante'?'index.html':'atlas.html','modules/agenda.html','modules/ficha.html'])for(const code of scriptList(fs.readFileSync(path.join(dir,file),'utf8'))){new vm.Script(code);compiled++;}
  console.log(`PASS ${clinic}: baseline race reproduced; immediate latest selection; late history ignored; homonyms, missing IDs and conflicting IDs isolated; ${compiled} inline scripts valid.`);
 }
})().catch(e=>{console.error(e);process.exitCode=1});
