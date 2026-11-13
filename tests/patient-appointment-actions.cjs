const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../modules/agenda.html'),'utf8');
const start=source.indexOf(' // Keep only the latest navigation request active');
const end=source.indexOf(" window.addEventListener('message',function(ev){",start+1);
assert(start>=0&&end>start,'Exact appointment navigation must be installed');
const handler=source.slice(start,end);
const patient={remoteId:'patient-test',code:'TEST-1',name:'Paciente ficticio'};
const appointment=(id,date='2026-11-16',extra={})=>({id,date,time:'11:30',status:'Pendiente',patientRemoteId:patient.remoteId,patientCode:patient.code,patient:patient.name,...extra});
function harness(options={}){
 const trace=[],alerts=[];let listener;
 const context={window:{ATLAS_CHILD_CENTRAL_CONTEXT:{},addEventListener:(type,fn)=>listener=fn},document:{getElementById:id=>({value:'',disabled:false,classList:{remove(){}},click:()=>trace.push(['action',id])})},appointments:[appointment('other','2027-01-08')],currentDate:'2027-01-08',normalizeSearch:s=>String(s||'').toLowerCase(),cashToday:()=> '2026-11-13',save:()=>trace.push(['save']),render:()=>trace.push(['render']),openDrawer:id=>trace.push(['drawer',id]),alert:message=>alerts.push(message),setTimeout:fn=>fn()};
 context.window.atlasLoadAppointmentDate=async date=>{trace.push(['load',date]);if(options.load)return options.load(context,date);context.appointments=[appointment('selected')];};
 vm.runInNewContext(handler,context);
 return {context,trace,alerts,send:(extra={})=>listener({data:{type:'atlasAlicante:show-patient',patient,appointmentId:'selected',date:'2026-11-16',appointmentAction:'move',...extra}})};
}
(async()=>{
 let cases=0;
 for(const action of ['move','cancel']){
  const h=harness();await h.send({appointmentAction:action});
  assert.equal(h.context.currentDate,'2026-11-16');
  assert.deepEqual(h.trace.filter(x=>['load','drawer','action'].includes(x[0])),[['load','2026-11-16'],['drawer','selected'],['action',action==='cancel'?'deleteBtn':'moveBtn']]);assert.equal(h.alerts.length,0);cases++;
 }
 for(const rows of [[],[appointment('different')],[appointment('selected','2026-11-16',{patientRemoteId:'another-patient'})]]){
  const h=harness({load:c=>{c.appointments=rows}});await h.send();assert(!h.trace.some(x=>['drawer','action','save'].includes(x[0])));assert.equal(h.alerts.length,1);assert.equal(h.context.currentDate,'2027-01-08');cases++;
 }
 for(const extra of [{status:'Cancelada'},{status:'Realizada'},{historico:true},{metadata:{historico:true}},{deletedAt:'2026-11-12'}]){
  const h=harness({load:c=>{c.appointments=[appointment('selected','2026-11-16',extra)]}});await h.send({appointmentAction:'cancel'});assert(!h.trace.some(x=>['drawer','action','save'].includes(x[0])));assert.equal(h.alerts.length,1);cases++;
 }
 const error=harness({load:()=>{throw Error('Sin conexión')}});await error.send();assert.equal(error.alerts.length,1);assert(!error.trace.some(x=>x[0]==='action'));cases++;
 for(const alias of ['centralId','centralRef']){const h=harness({load:c=>{c.appointments=[appointment('local-id','2026-11-16',{[alias]:'selected'})]}});await h.send();assert(h.trace.some(x=>x[0]==='drawer'&&x[1]==='local-id'));assert(h.trace.some(x=>x[0]==='action'));cases++}
 const invalid=harness();await invalid.send({date:'16/11/2026'});assert.equal(invalid.trace.length,0);assert.equal(invalid.alerts.length,1);cases++;
 let release;
 const racing=harness({load:c=>new Promise(resolve=>{release=()=>{c.appointments=[appointment('selected')];resolve()}})});
 const first=racing.send();await racing.send({appointmentId:'',appointmentAction:''});release();await first;assert(!racing.trace.some(x=>x[0]==='action'));cases++;
 const missingLoader=harness();delete missingLoader.context.window.atlasLoadAppointmentDate;await missingLoader.send();assert.equal(missingLoader.alerts.length,1);cases++;
 // Exercise the real date loader, including synchronization and load failure.
 const helperStart=source.indexOf(' window.atlasLoadAppointmentDate=async function(date){');
 const helperEnd=source.indexOf('\n };',helperStart)+4;
 let loads=0,queued=0,now=0;
 const central={window:{ATLAS_CHILD_CENTRAL_CONTEXT:{}},moduleVisible:true,dirtyRefs:new Set(['pending']),loading:true,syncing:false,cancelling:false,Date:{now:()=>now},queueSync:()=>queued++,setTimeout:fn=>{central.loading=false;central.dirtyRefs.clear();now+=100;fn()},loadCentral:async date=>{loads++;assert.equal(date,'2026-11-16');assert.equal(central.loading,false);assert.equal(central.dirtyRefs.size,0);return true}};
 vm.runInNewContext(source.slice(helperStart,helperEnd),central);await central.window.atlasLoadAppointmentDate('2026-11-16');assert.equal(loads,1);cases++;
 central.loadCentral=async()=>false;await assert.rejects(central.window.atlasLoadAppointmentDate('2026-11-16'),/No se pudo cargar/);cases++;
 central.moduleVisible=false;await assert.rejects(central.window.atlasLoadAppointmentDate('2026-11-16'),/no está conectada/);cases++;
 central.moduleVisible=true;central.dirtyRefs.add('pending');central.setTimeout=fn=>{now+=66000;fn()};await assert.rejects(central.window.atlasLoadAppointmentDate('2026-11-16'),/sincronizarse/);assert.equal(queued,1);cases++;
 console.log(cases+' casos de navegación y carga de citas correctos, con datos sintéticos.');
})().catch(error=>{console.error(error);process.exitCode=1});
