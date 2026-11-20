const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),kit=require(path.resolve(root,'tests/planning-all-professionals.cjs')),pump=require(path.resolve(root,'modules/pump-planning.js'));
const stat='Bomba Diamagnética estática',dyn='Bomba Diamagnética dinámica';
function fixture(){const c=kit.fixture();c.window.atlasPumpPlanning=pump;c.equipment.push('Bomba Diamagnética');c.resources.push('Bomba Diamagnética');for(const s of [stat,dyn]){c.therapyDurations[s]=45;if(s===stat)c.therapiesWithoutProfessional.add(s);else{c.therapyCompetencyRequirement[s]='poner bomba';c.professionalCompetencies[kit.names[0]].push('poner bomba');c.alicanteTherapyProfessionals[s]=[kit.names[0]];c.therapyProfessionalDurations[s]=15;}c.alicanteTherapyResources[s]=['Bomba Diamagnética'];}c.therapyEquipmentKeywords.push([/bomba/,'Bomba Diamagnética']);return c;}
function generate(lines,mode='parallel',extra={}){const pumpCourses=pump.definitions(lines).map((c,i)=>({id:c.id,zone:i?'Piernas':'Espalda'}));return kit.makePlan(lines,{days:[1,2,3,4,5],weeklyWindows:[1,2,3,4,5].map(day=>({day,from:'09:00',to:'13:00'})),pumpCourses,pumpScheduling:mode,...extra},fixture());}
for(const lines of [[[stat,10]],[[stat,20]],[[dyn,20]],[[stat,10],[dyn,10]],[[stat,10],[stat,10]]])for(const mode of ['parallel','sequential']){const r=generate(lines,mode);assert.deepEqual(r.errors,[],JSON.stringify({lines,mode,errors:r.errors,rows:r.rows.map(a=>[a.pumpCourseId,a.date])}));assert.equal(r.rows.length,lines.reduce((n,l)=>n+l[1],0));for(const row of r.rows){assert(row.notes.includes(row.pumpZone));assert(row.notes.includes(row.pumpSession+'/10'));}console.log('PASS',kit.clinic,JSON.stringify(lines),mode,r.rows.length);}
const r=generate([[stat,20]]);
const broken=generate([[stat,20]],'parallel',{pumpCourses:[]});assert(broken.errors.length);assert.equal(broken.rows.length,0);
for(const change of [{pumpZone:'Piernas'},{pumpSession:7},{notes:'lost zone'},{date:'2027-01-12'}]){const r=generate([[stat,20]]);Object.assign(r.rows[0],change);assert(r.c.api.planningRuleViolations(r.draft).length,JSON.stringify(change));}
const tooLong=generate([[stat,10]],'parallel',{availabilityMode:'dates',availabilityDates:[{date:'2027-01-11',from:'09:00',to:'13:00'},{date:'2027-01-19',from:'09:00',to:'13:00'}]});assert.equal(tooLong.rows.length,1);assert(tooLong.errors.length);

assert.equal(pump.definitions([['SIS',10],[stat,20]])[1].number,2);
assert.throws(()=>pump.definitions([[stat,15]]));assert.throws(()=>pump.definitions([[stat,30]]));
assert(generate([[stat,20]],'parallel',{pumpCourses:[{id:'pump-0-0',zone:'Espalda'},{id:'pump-0-10',zone:' espalda '}]}).errors.length);
// Two independent series can produce exactly three sessions in one natural week.
const dates=['2027-01-11','2027-01-13','2027-01-15','2027-01-18','2027-01-20','2027-01-22','2027-01-25','2027-01-27','2027-01-29','2027-02-01','2027-02-03','2027-02-05','2027-02-08','2027-02-10','2027-02-12','2027-02-15','2027-02-17','2027-02-19','2027-02-22','2027-02-24'];
const three=generate([[stat,20]],'parallel',{availabilityMode:'dates',availabilityDates:dates.map(date=>({date,from:'09:00',to:'09:45'}))});assert.deepEqual(three.errors,[]);assert.equal(three.rows.filter(a=>a.date<'2027-01-18').length,3);
const sequential=generate([[stat,20]],'sequential');assert(sequential.rows.filter(a=>a.pumpNumber===2).every(a=>a.date>sequential.rows.filter(a=>a.pumpNumber===1).at(-1).date));
for(const row of r.rows){const others=r.rows.filter(a=>a!==row);assert(pump.okay(row,row.date,others,r.plan));const unlabelled={...row,pumpZone:'',pumpCourseId:'',date:row.date};assert(!pump.okay(row,row.date,[unlabelled],r.plan));assert(pump.okay(row,row.date,[{...unlabelled,status:'Cancelada'}].filter(a=>a.status!=='Cancelada'),r.plan)||row.pumpSession>1);}
// Central payload preserves all fields and server confirmation must match them.
const vm=require('node:vm'),commit=require('../modules/planning-commit.js'),c=r.c;
vm.runInContext(kit.definition('cleanMetadata'),c);
const local=JSON.parse(JSON.stringify(r.rows[0])),metadata=c.cleanMetadata(local);assert.equal(metadata.pumpZone,'Espalda');assert.equal(metadata.pumpSession,1);assert.equal(metadata.pumpNumber,1);
const payload={patient_id:'synthetic-patient',client_ref:'synthetic-pump',starts_at:'2027-01-11T08:00:00Z',ends_at:'2027-01-11T08:45:00Z',services:local.services,resources:local.resources,professionals:[],notes:local.notes,metadata:{...metadata,professional_minutes:0}};
const saved={...payload,id:'synthetic-central',updated_at:'2026-11-20T12:00:00Z',status:'pending'};
assert.equal(commit.verify([payload],{appliedCount:1,appointments:[saved]}).length,1);
for(const broken of [{notes:'missing zone'},{metadata:{...payload.metadata,pumpZone:'Piernas'}},{metadata:{...payload.metadata,pumpSession:2}},{metadata:{...payload.metadata,pumpCourseId:''}}])assert.throws(()=>commit.verify([payload],{appliedCount:1,appointments:[{...saved,...broken}]}));
console.log('PASS zones, ordering, weekly overlap, invalid drafts, incomplete availability, legacy safety and confirmed persistence');
module.exports={generate,fixture,stat,dyn};

async function checkLateChange(){const r=generate([[stat,20]]),c=r.c;let readFrom='',writes=0;c.loadPatientPlanningRows=async(patient,date)=>{readFrom=date;c.appointments.push({...r.rows[0],id:'synthetic-late-change',pumpCourseId:'other-course',budgetId:'other-budget',date:'2027-01-12'});};c.loadPlanningAvailability=async()=>{};c.window.atlasPersistPlanningCentral=async()=>{writes++;return r.rows};const elements={};c.document.getElementById=id=>elements[id]||(elements[id]={disabled:false,classList:{remove(){}}});c.api.setDraft(r.draft);await c.api.applyPlanningDraft();assert.equal(readFrom,'2027-01-04');assert.equal(writes,0);assert(c.alerts.some(m=>m.includes('4–7')));console.log('PASS late change rechecks the previous seven days and prevents saving an invalid course');}
if(require.main===module)checkLateChange().catch(e=>{console.error(e);process.exitCode=1});
