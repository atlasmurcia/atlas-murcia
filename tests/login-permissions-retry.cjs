const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','atlas.html'),'utf8');

assert.match(html,/Versión 218 · Acceso resistente a esperas del servidor/);
assert.match(html,/transient=new Set\(\[408,425,429,500,502,503,504\]\)/);
assert.match(html,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
assert.match(html,/El servidor está ocupado\. Seguimos cargando tus permisos…/);
assert.match(html,/authenticated=true;atlasLoginError\.textContent='Contraseña correcta/);
assert.match(html,/await enter\(data\.session\)/);
assert.doesNotMatch(html,/retryLoginTimeout\(\(\)=>enter\(data\.session\)/);
assert.match(html,/if\(!authenticated\)await db\.auth\.signOut/);

const start=html.indexOf('async function atlasRestSelect(');
const end=html.indexOf('async function enter(',start);
assert.ok(start>0&&end>start,'No se encontró la función de lectura de permisos.');

(async()=>{
 const calls=[];
 const responses=[
  {ok:false,status:504,headers:{get:()=>null},json:async()=>({message:'timeout temporal'})},
  {ok:true,status:200,headers:{get:()=>null},json:async()=>[{role:'reception'}]}
 ];
 const context={
  URLSearchParams,Set,Error,
  ATLAS_SUPABASE_URL:'https://example.test',ATLAS_SUPABASE_KEY:'publica',
  atlasLogin:{classList:{contains:()=>false}},atlasLoginError:{textContent:''},
  delay:async ms=>calls.push(['delay',ms]),
  fetch:async(url,options)=>{calls.push(['fetch',url,options]);return responses.shift()}
 };
 vm.createContext(context);
 vm.runInContext(`${html.slice(start,end)};this.atlasRestSelect=atlasRestSelect`,context);
 const result=await context.atlasRestSelect('memberships',{active:'eq.true'},'token-valido');
 assert.deepStrictEqual(JSON.parse(JSON.stringify(result)),[{role:'reception'}]);
 assert.equal(calls.filter(call=>call[0]==='fetch').length,2);
 assert.equal(calls.filter(call=>call[0]==='delay').length,1);
 assert.equal(context.atlasLoginError.textContent,'El servidor está ocupado. Seguimos cargando tus permisos…');
 console.log('OK: el acceso espera y reintenta los permisos sin cerrar una sesión válida.');
})().catch(error=>{console.error(error);process.exitCode=1});
