// Solo datos sintéticos. No consulta cuentas ni registros clínicos.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const atlas=fs.readFileSync('atlas.html','utf8'),agenda=fs.readFileSync('modules/agenda.html','utf8');
const script=id=>{const m=atlas.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'));assert(m,'Falta '+id);return m[1]};
const policy=script('atlas-session-policy-v1'),watchdog=script('atlas-session-watchdog-v1');
assert.doesNotMatch(atlas+agenda,/atlas:security-lock|resetIdle|let idleTimer/,'No debe quedar una ruta que cierre por inactividad');
assert.match(atlas,/sessionPolicy=20261125/);
assert.match(atlas,/persistSession:true,autoRefreshToken:true/);
assert.match(agenda,/Sesión sin cierre por inactividad/);assert.doesNotMatch(agenda,/La sesión se cerrará tras 30 minutos/);
const logout=atlas.match(/atlasLogout\.onclick=async\(\)=>\{[^\n]+?\};/)[0];
function setup({role='therapist',valid=true,networkError=false,refreshValid=false,offline=false}={}){
 const listeners={},intervals=[],timers=[],calls={signOut:0,reload:0,refresh:0,reads:0},nodes={atlasUserBar:{hidden:false},atlasLogin:{classList:{remove(){}}},atlasLoginError:{textContent:''},clinicalDraft:{value:'Borrador clínico ficticio sin guardar'}};
 const db={auth:{getUser:async()=>{calls.reads++;if(networkError)throw Error('Desconectado');return valid?{data:{user:{id:'test-user'}}}:{data:{},error:{status:401}}},refreshSession:async()=>{calls.refresh++;return refreshValid?{data:{session:{user:{id:'test-user'}}}}:{data:{},error:{status:401}}},signOut:async()=>{calls.signOut++},onAuthStateChange:fn=>{calls.authListener=fn}}};
 const window={ATLAS_CENTRAL_DB:db,ATLAS_CENTRAL_CONTEXT:{role},addEventListener(type,fn){(listeners[type]||=[]).push(fn)}};
 const ctx={window,db,atlasLogout:{},navigator:{onLine:!offline},document:{hidden:false,getElementById:id=>nodes[id],addEventListener(){}},location:{reload:()=>calls.reload++},setInterval:(fn,ms)=>{intervals.push({fn,ms})},setTimeout:(fn,ms)=>{timers.push({fn,ms})},console:{warn(){}}};vm.createContext(ctx);vm.runInContext(policy+'\n'+watchdog+'\n'+logout,ctx);
 return{ctx,calls,nodes,listeners,async idle(){// Dos horas sin interacción; incluye avisos de una agenda antigua en caché.
  for(let i=0;i<120;i++){for(const fn of listeners.message||[])fn({data:{type:'atlas:security-lock'}});for(const {fn} of intervals)await fn()}
  for(const {fn} of timers)await fn();await Promise.resolve();
 }};
}
(async()=>{
 for(const role of ['owner','administrator','therapist','reception','assistant','custom']){
  const c=setup({role});await c.idle();assert.equal(c.calls.signOut,0,role);assert.equal(c.calls.reload,0,role);assert.equal(c.nodes.clinicalDraft.value,'Borrador clínico ficticio sin guardar');assert(c.ctx.window.ATLAS_CENTRAL_CONTEXT);await c.ctx.atlasLogout.onclick();assert.equal(c.calls.signOut,1);assert.equal(c.calls.reload,1);
 }
 const renewed=setup({valid:false,refreshValid:true});await renewed.idle();assert(renewed.calls.refresh>0);assert.equal(renewed.calls.signOut,0);assert.equal(renewed.nodes.clinicalDraft.value,'Borrador clínico ficticio sin guardar');
 for(const opts of [{networkError:true},{offline:true}]){const c=setup(opts);await c.idle();assert.equal(c.calls.signOut,0);assert.equal(c.calls.reload,0)}
 const revoked=setup({valid:false});await revoked.idle();assert.equal(revoked.calls.signOut,1,'La sesión realmente inválida sigue protegida');assert.equal(revoked.ctx.window.ATLAS_CENTRAL_CONTEXT,null);assert.equal(revoked.calls.reload,0);assert.equal(revoked.nodes.clinicalDraft.value,'Borrador clínico ficticio sin guardar');
 for(const file of ['atlas.html','modules/agenda.html']){let n=0;for(const [,attrs,code] of fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/src=|application\/json/.test(attrs))continue;new vm.Script(code);n++}console.log(file+': '+n+' scripts válidos')}
 console.log('OK: dos horas inactivo para seis roles, agenda antigua, borrador intacto, renovación, desconexión temporal, cierre manual y sesión revocada.');
})().catch(e=>{console.error(e);process.exitCode=1});
