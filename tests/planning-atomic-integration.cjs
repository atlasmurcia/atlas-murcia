const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const dbkit=require('./planning-atomic-database.cjs'),commit=require('../modules/planning-commit.js');
async function run(clinic){const db=await dbkit.setup(clinic),kit=require('./planning-all-professionals.cjs'),html=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8');try{
const result=kit.makePlan([...kit.manual,...kit.pair,['SIS',1]]),c=result.c;
Object.assign(c,{ready:true,loading:false,cancelling:false,syncing:false,syncRequested:false,remoteRefreshPending:false,syncTimer:0,reloadTimer:0,dirtyRefs:new Set(),remoteByRef:new Map(),followUpDefaultResources:new Map(),patientMaster:[{...kit.patient,remoteId:dbkit.patient}],pad:n=>String(n).padStart(2,'0'),patientFor:()=>({remoteId:dbkit.patient}),patientByRemoteId:()=>({...kit.patient,remoteId:dbkit.patient}),baseSaves:0,renders:0,baseSave:()=>c.baseSaves++,render:()=>c.renders++,tell(){},clearTimeout});
c.window.atlasPlanningCommit=commit;
const names=['localParts','localIso','toCentralStatus','toLocalStatus','cleanMetadata','clientRef','visibleResourcesForAppointment','toRow','fromRow','koiboxDisplay','fingerprint'];vm.runInContext(names.map(kit.definition).join('\n'),c);
const start=html.indexOf(' window.atlasPersistPlanningCentral=async function(proposed){'),end=html.indexOf('\n };',start)+4;assert(start>0&&end>start);vm.runInContext(html.slice(start,end),c);
let requests=0;c.request=async(action,payload)=>{assert.equal(action,'appointments:applyPlan');requests++;return(await db.query('select public.atlas_apply_treatment_plan($1,$2,$3,$4,$5::jsonb) result',[dbkit.org,dbkit.clinic,payload.patientId,payload.planKey,JSON.stringify(payload.rows)])).rows[0].result};
const confirmed=await c.window.atlasPersistPlanningCentral(result.rows);assert.equal(confirmed.length,3);assert.equal(c.appointments.length,3);assert.equal(c.remoteByRef.size,3);assert.equal(c.baseSaves,1);assert.equal(c.renders,1);assert.equal(c.dirtyRefs.size,0);
const same=await c.window.atlasPersistPlanningCentral(result.rows);assert.equal(c.appointments.length,3);assert.deepEqual(confirmed.map(a=>a.centralId),same.map(a=>a.centralId));assert.equal(Number((await db.query('select count(*) n from appointments')).rows[0].n),3);assert.equal(requests,2);
await dbkit.clear(db);c.appointments=[];c.remoteByRef.clear();c.baseSaves=0;c.renders=0;
const manual=result.rows.find(a=>a.services.includes('Fisioterapia'));const begin=new Date(manual.date+'T'+manual.time+':00').toISOString();await dbkit.occupied(db,'Otro equipo',begin,60,manual.professional);
await assert.rejects(()=>c.window.atlasPersistPlanningCentral(result.rows),/profesionales|ocupado/);assert.equal(c.appointments.length,0);assert.equal(c.baseSaves,0);assert.equal(c.renders,0);assert.equal(c.dirtyRefs.size,0);assert.equal(Number((await db.query('select count(*) n from appointments')).rows[0].n),1);
console.log('PASS '+clinic+': actual planner -> serializer -> PostgreSQL RPC with real overlap trigger -> confirmation -> decoder -> local agenda; retry is idempotent and rejection leaves no local or server partial plan.');
}finally{await db.close()}}
run('murcia').catch(e=>{console.error(e);process.exitCode=1});
