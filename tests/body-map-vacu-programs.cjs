// Datos sintéticos; no realiza peticiones a servidores.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/ficha.html','utf8');
const source=html.split('<script id="atlas-patient-body-map-v1">')[1].split('</script>')[0];
const nodes=new Map(),timers=[],sent=[],events={};
function make(){const n={value:'',disabled:false,dataset:{},style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},setAttribute(){},appendChild(){},querySelector:()=>null,querySelectorAll(selector){return selector==='[data-vacu-program]'?this.selects||[]:[]}};Object.defineProperty(n,'innerHTML',{configurable:true,get(){return this.html||''},set(value){this.html=value;this.selects=[...value.matchAll(/<select data-vacu-program="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)].map(m=>({dataset:{vacuProgram:m[1]},value:([...m[2].matchAll(/value="([^"]*)" selected/g)][0]||[])[1]||''}))}});return n}
const root=make();nodes.set('atlasBodyMapRoot',root);Object.defineProperty(root,'innerHTML',{get(){return this.html},set(value){this.html=value;for(const id of [...nodes.keys()])if(id!=='atlasBodyMapRoot')nodes.delete(id);for(const m of value.matchAll(/id="([^"]+)"/g))nodes.set(m[1],make())}});
const ctx={console,Map,Promise,JSON,Number,String,Math,Date,Error,confirm:()=>true,document:{getElementById:id=>nodes.get(id)||null,createElement:make,head:{appendChild(){}},querySelectorAll:()=>[],querySelector:()=>null},window:{addEventListener:(type,fn)=>events[type]=fn},parent:{postMessage:m=>sent.push(m)},setTimeout:(fn,delay)=>{const t={fn,delay};timers.push(t);return t},clearTimeout:t=>t.cancelled=true};vm.createContext(ctx);
vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'window.test={getMarkers:()=>markers,equipmentMeta};})();'),ctx);
const message=data=>events.message({data}),last=action=>sent.filter(m=>m.action===action).at(-1),reply=(req,data)=>message({type:'atlas:central-db-response',requestId:req.requestId,ok:true,data});
const legacy={id:'legacy-robot',equipment:'Robot',view:'back',x:50,y:40,note:'Conservar'},markers=[legacy,{id:'vacu-A',equipment:'Vacu',view:'front',x:20,y:30,program:4},{id:'vacu-B',equipment:'Vacu',view:'back',x:40,y:50,program:17},{id:'lumbar',equipment:'Robot lumbar',view:'back',x:50,y:60},{id:'cervical',equipment:'Robot cervical',view:'back',x:50,y:20}];
const row=record=>({id:'synthetic-map',record_type:'body_map',content:{record},created_at:'2026-11-26T10:00:00Z'});
const snapshot=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 message({type:'atlas:central-ready'});message({type:'atlas:load-patient',patient:{remoteId:'synthetic-A'}});const task=timers.find(t=>t.delay===320).fn();reply(last('clinical:list'),[row({markers,notes:'Conservar nota'})]);await task;
 const list=()=>nodes.get('atlasBodyMapList'),select=id=>list().selects.find(s=>s.dataset.vacuProgram===id);
 assert.equal(select('vacu-A').value,'4');assert.equal(select('vacu-B').value,'17');assert.equal(list().selects.length,2);
 const equipment=nodes.get('atlasBodyMapEquipment');assert(root.html.includes('<option>Vacu</option>'));assert(!root.html.includes('<option>Robot</option>'));assert(root.html.includes('<option>Robot lumbar</option>'));assert(root.html.includes('<option>Robot cervical</option>'));
 for(const program of [4,7,9,10,14,17]){const s=select('vacu-A');s.value=String(program);s.onchange();assert.equal(ctx.window.test.getMarkers()[1].program,program);assert.equal(ctx.window.test.getMarkers()[2].program,17)}
 select('vacu-A').value='999';select('vacu-A').onchange();assert.equal(ctx.window.test.getMarkers()[1].program,'');select('vacu-A').value='9';select('vacu-A').onchange();
 assert.deepEqual(snapshot(ctx.window.test.getMarkers()[0]),legacy);assert.equal(ctx.window.test.equipmentMeta('Robot').code,'RO');assert.equal(ctx.window.test.equipmentMeta('Robot lumbar').code,'RL');assert.equal(ctx.window.test.equipmentMeta('Robot cervical').code,'RC');
 const save=nodes.get('atlasBodyMapSave').onclick(),request=last('clinical:insert'),record=request.payload.content.record;assert.equal(record.markers[1].program,9);assert.equal(record.markers[2].program,17);assert.equal(record.notes,'Conservar nota');assert.deepEqual(snapshot(record.markers[0]),legacy);
 reply(request,{id:'confirmed'});await new Promise(r=>setImmediate(r));reply(last('clinical:list'),[row(record)]);await save;assert.equal(select('vacu-A').value,'9');assert.equal(select('vacu-B').value,'17');
 console.log('OK: programas 4/7/9/10/14/17 por marca, guardado y recarga, Robot lumbar/cervical y compatibilidad con mapas anteriores.');
})().catch(error=>{console.error(error);process.exitCode=1});
