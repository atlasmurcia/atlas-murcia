const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.env.ATLAS_BODY_MAP_FILE||__dirname+'/../modules/ficha.html','utf8');
const source=html.split('<script id="atlas-patient-body-map-v1">')[1].split('</script>')[0];
function setup(){
 const nodes=new Map(),timers=[],sent=[],events={};
 const make=()=>({value:'',textContent:'',disabled:false,isConnected:true,style:{setProperty(){}},dataset:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},appendChild(){},querySelectorAll:()=>[],querySelector:()=>null});
 const root=make();nodes.set('atlasBodyMapRoot',root);
 Object.defineProperty(root,'innerHTML',{set(value){for(const [id,node] of nodes)if(id!=='atlasBodyMapRoot'){node.isConnected=false;nodes.delete(id)}for(const match of value.matchAll(/id="([^"]+)"/g))nodes.set(match[1],make())}});
 const ctx={console,Map,Promise,JSON,Number,String,Math,Date,Error,confirm:()=>true,
  document:{getElementById:id=>nodes.get(id)||null,createElement:make,head:{appendChild(){}},querySelectorAll:()=>[],querySelector:()=>null},
  window:{addEventListener:(type,fn)=>events[type]=fn},parent:{postMessage:m=>sent.push(m)},
  setTimeout:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer},clearTimeout:timer=>{timer.cancelled=true}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const message=data=>events.message({data}),node=id=>nodes.get('atlasBodyMap'+id);
 const switchPatient=id=>message({type:'atlas:load-patient',patient:{remoteId:id}});
 const beginLoad=()=>{const index=timers.findIndex(t=>t.delay===320&&!t.cancelled);assert.ok(index>=0);return timers.splice(index,1)[0].fn()};
 const last=action=>sent.filter(m=>m.action===action).at(-1);
 const reply=(request,data,ok=true)=>message({type:'atlas:central-db-response',requestId:request.requestId,ok,data,error:'Fallo sintético'});
 async function load(id,rows){switchPatient(id);const task=beginLoad();reply(last('clinical:list'),rows);await task}
 message({type:'atlas:central-ready'});
 return {nodes,timers,sent,message,node,switchPatient,beginLoad,last,reply,load};
}
const row=(notes,id='synthetic-map')=>({id,record_type:'body_map',content:{record:{professional:'Profesional sintético',notes,markers:[{id:'synthetic-marker',equipment:'SIS',view:'front',x:30,y:40}]}},created_at:'2026-11-09T09:00:00Z'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 const c=setup();await c.load('synthetic-A',[row('Nota A')]);assert.equal(c.node('Notes').value,'Nota A');
 c.node('MarkerNote').value='Borrador de A';c.switchPatient('synthetic-B');
 assert.equal(c.node('Notes').value,'','Se limpia inmediatamente al cambiar de paciente');assert.equal(c.node('MarkerNote').value,'');assert.equal(c.node('Save').disabled,true);
 let task=c.beginLoad();await c.node('Save').onclick();assert.equal(c.sent.filter(m=>m.action==='clinical:insert').length,0,'No se guarda durante la carga');
 c.reply(c.last('clinical:list'),[]);await task;assert.equal(c.node('Notes').value,'');assert.equal(c.node('Save').disabled,false);
 await c.load('synthetic-C',[row('Nota C')]);assert.equal(c.node('Notes').value,'Nota C','Se muestran las observaciones propias');
 c.node('Notes').value='';task=c.node('Save').onclick();const write=c.last('clinical:insert');assert.equal(write.payload.patientId,'synthetic-C');assert.equal(write.payload.content.record.notes,'','Se permite guardar observaciones vacías sin recuperar texto antiguo');
 c.reply(write,{id:'synthetic-saved'});await flush();c.reply(c.last('clinical:list'),[row('')]);await task;assert.equal(c.node('Notes').value,'');assert.match(c.node('Status').textContent,/guardado y confirmado/);assert.equal(c.node('Save').disabled,false);
 // Una respuesta antigua de A no debe aplicarse al volver de B a A.
 const race=setup();race.switchPatient('synthetic-A');const old=race.beginLoad(),oldRead=race.last('clinical:list');
 race.switchPatient('synthetic-B');race.switchPatient('synthetic-A');const fresh=race.beginLoad(),freshRead=race.last('clinical:list');
 race.reply(freshRead,[row('Nota actual')]);await fresh;race.reply(oldRead,[row('Nota antigua')]);await old;assert.equal(race.node('Notes').value,'Nota actual');
 // Tampoco un error de otra ficha puede borrar la ficha ya cargada.
 race.switchPatient('synthetic-B');const failedOld=race.beginLoad(),failedRead=race.last('clinical:list');await race.load('synthetic-C',[row('Nota C')]);race.reply(failedRead,null,false);await failedOld;assert.equal(race.node('Notes').value,'Nota C');assert.equal(race.node('Save').disabled,false);
 // Un fallo de la ficha actual deja el editor vacío y bloqueado.
 race.switchPatient('synthetic-D');task=race.beginLoad();race.reply(race.last('clinical:list'),null,false);await task;assert.equal(race.node('Notes').value,'');assert.equal(race.node('Save').disabled,true);await race.node('Save').onclick();assert.equal(race.sent.filter(m=>m.action==='clinical:insert').length,0);
 // Un guardado iniciado en A no refresca ni confirma el mapa de B.
 for(const ok of [true,false]){
  const saving=setup();await saving.load('synthetic-A',[row('Nota A')]);task=saving.node('Save').onclick();const pending=saving.last('clinical:insert');await saving.load('synthetic-B',[row('Nota B')]);const reads=saving.sent.filter(m=>m.action==='clinical:list').length,status=saving.node('Status').textContent;
  saving.reply(pending,ok?{id:'synthetic-save-A'}:null,ok);await task;assert.equal(saving.sent.filter(m=>m.action==='clinical:list').length,reads);assert.equal(saving.node('Notes').value,'Nota B');assert.equal(saving.node('Status').textContent,status);assert.equal(saving.node('Save').disabled,false);
 }
 console.log('OK: aislamiento entre pacientes, notas vacías, bloqueo durante carga/error y respuestas tardías de carga/guardado. Solo datos sintéticos.');
})().catch(error=>{console.error(error);process.exitCode=1});
