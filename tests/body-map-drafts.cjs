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
 const c=setup();await c.load('synthetic-A',[row('Servidor A')]);c.node('Notes').value='Borrador del mapa A';c.node('MarkerNote').value='Colocación pendiente';
 await c.load('synthetic-A',[row('Servidor A')]);assert.equal(c.node('Notes').value,'Borrador del mapa A');assert.equal(c.node('MarkerNote').value,'Colocación pendiente');
 await c.load('synthetic-B',[row('Servidor B')]);assert.equal(c.node('Notes').value,'Servidor B');assert.equal(c.node('MarkerNote').value,'');
 await c.load('synthetic-A',[row('Servidor A')]);assert.equal(c.node('Notes').value,'Borrador del mapa A');assert.equal(c.node('MarkerNote').value,'Colocación pendiente');
 let task=c.node('Save').onclick(),req=c.last('clinical:insert');c.reply(req,null,false);await task;assert.equal(c.node('Notes').value,'Borrador del mapa A','Un fallo conserva el borrador');
 task=c.node('Save').onclick();req=c.last('clinical:insert');assert.equal(req.payload.content.record.notes,'Borrador del mapa A');c.reply(req,{id:'confirmed-A'});await flush();c.reply(c.last('clinical:list'),[row('Borrador del mapa A','confirmed-A')]);await task;
 await c.load('synthetic-A',[row('Mapa actualizado en servidor','new-server-map')]);assert.equal(c.node('Notes').value,'Mapa actualizado en servidor','Tras guardar no reaparece el borrador antiguo');
 c.node('Notes').value='';await c.load('synthetic-A',[row('Mapa actualizado en servidor')]);assert.equal(c.node('Notes').value,'','Conserva un borrador de observaciones vacío');
 console.log('OK: borrador del mapa, nota de marca, pestañas, dos pacientes, fallo, guardado confirmado y texto vacío.');
})().catch(error=>{console.error(error);process.exitCode=1});
