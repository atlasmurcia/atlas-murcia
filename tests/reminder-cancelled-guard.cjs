const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function extract(source){const start=source.indexOf("else if(m.action==='appointmentReminders:respond')"),end=source.indexOf("else if(['internalTasks:list'",start);assert(start>=0&&end>start);return 'if(false){}'+source.slice(start,end)}
function makeHandler(source){return new Function('db','context','reminderPatientIds','agendaDateString','agendaLocalIso','agendaDateAdd','m',`return (async()=>{let result;try{${extract(source)}}catch(error){result={data:null,error:{message:error.message}}}return result})()`)}
const baseRow=(id='a',status='pending')=>({id,status,organization_id:'org',clinic_id:'clinic',patient_id:'patient',starts_at:'2030-11-20T12:45:00Z',updated_at:'2030-11-18T10:00:00Z',deleted_at:null,metadata:{keep:'preserved'}});
async function run(handler,{rows=[baseRow()],response='confirmed',race,empty=false,id='a',readError=false}={}){
 let writes=0,patientLookups=0,reads=0;rows=structuredClone(rows);
 class Query{
  constructor(){this.filters=[];this.patch=null;this.one=false;this.day=false}
  select(){return this}eq(k,v){this.filters.push(r=>r[k]===v);return this}neq(k,v){this.filters.push(r=>r[k]!==v);return this}is(k,v){return this.eq(k,v)}in(k,v){this.filters.push(r=>v.includes(r[k]));return this}gte(k,v){this.day=true;this.filters.push(r=>r[k]>=v);return this}lt(k,v){this.filters.push(r=>r[k]<v);return this}order(){return this}update(p){this.patch=p;return this}single(){this.one=true;return this}maybeSingle(){this.one=true;return this}
  then(resolve,reject){try{
   if(this.patch&&race){race(rows);race=null}
   let found=rows.filter(r=>this.filters.every(f=>f(r)));if(this.day&&empty)found=[];
   let result;
   if(!this.patch&&readError)result={data:null,error:{message:'Lectura fallida'}};
   else if(this.patch&&this.one&&found.length!==1)result={data:null,error:{code:'PGRST116',message:'No rows'}};
   else{if(this.patch){for(const row of found){Object.assign(row,structuredClone(this.patch));writes++}}else reads++;result={data:structuredClone(this.one?(found[0]||null):found),error:null}}
   return Promise.resolve(result).then(resolve,reject);
  }catch(e){return Promise.reject(e).then(resolve,reject)}}
 }
 const db={from(table){assert.equal(table,'appointments');return new Query()}},context={organizationId:'org',clinicId:'clinic',userId:'synthetic-user'};
 const result=await handler(db,context,async()=>{patientLookups++;return {data:['patient'],error:null}},()=> '2030-11-20',(date,time)=>date+'T'+time+':00Z',()=> '2030-11-21',{action:'appointmentReminders:respond',payload:{appointmentId:id,response,reason:'Motivo ficticio'}});
 return {result,rows,writes,patientLookups,reads};
}
async function verify(source){
 const handler=makeHandler(source);let count=0;
 for(const response of ['confirmed','not_confirmed']){
  for(const withSibling of [false,true]){const r=await run(handler,{rows:[baseRow('a','cancelled'),...(withSibling?[baseRow('b')]:[])],response});assert.match(r.result.error.message,/cancelada/);assert.equal(r.writes,0);assert.equal(r.patientLookups,0);count++}
  const r=await run(handler,{rows:[baseRow(),baseRow('b'),baseRow('c','cancelled'),{...baseRow('d'),clinic_id:'other-clinic'}],response});assert.equal(r.result.error,null);assert.equal(r.writes,2);assert.equal(r.rows[0].metadata.whatsappConfirmationStatus,response);assert.equal(r.rows[0].metadata.keep,'preserved');assert.equal(r.rows[0].status,'pending');assert.equal(r.rows[2].metadata.whatsappConfirmationStatus,undefined);assert.equal(r.rows[3].metadata.whatsappConfirmationStatus,undefined);count++;
 }
 for(const race of [rows=>{rows[0].status='cancelled';rows[0].updated_at='2030-11-19T10:00Z'},rows=>{rows[0].metadata={keep:'new edit'};rows[0].updated_at='2030-11-19T10:00Z'},rows=>{rows[0].deleted_at='2030-11-19T10:00Z'}]){const r=await run(handler,{race});assert.match(r.result.error.message,/ha cambiado/);assert.equal(r.writes,0);assert.equal(r.rows[0].metadata.whatsappConfirmationStatus,undefined);count++}
 for(const options of [{empty:true},{rows:[]},{response:'invalid'},{id:null},{readError:true}]){const r=await run(handler,options);assert(r.result.error);assert.equal(r.writes,0);count++}
 const mixed=await run(handler,{rows:[baseRow(),baseRow('b')],race:rows=>{rows[1].status='cancelled';rows[1].updated_at='2030-11-19T10:00Z'}});assert(mixed.result.error);assert.equal(mixed.rows[1].metadata.whatsappConfirmationStatus,undefined);count++;
 let scripts=0;for(const file of ['atlas.html','modules/agenda.html']){const html=fs.readFileSync(path.join(root,file),'utf8');for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc\s*=|type\s*=\s*["'](?:module|application\/)/i.test(match[1])||!match[2].trim())continue;new vm.Script(match[2],{filename:file});scripts++}}
 return {scenarios:count,scripts};
}
module.exports={extract,makeHandler,run,verify};
if(require.main===module)verify(fs.readFileSync(path.join(root,'atlas.html'),'utf8')).then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(e);process.exitCode=1});
