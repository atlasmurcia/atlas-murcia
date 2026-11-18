// Real draft renderer in an isolated browser. All records are synthetic; all networking is blocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {physicalmDefinition,planner,apiCode,generate,manual,readapt}=require('./planning-murcia-blocks.cjs');
const globals=`
const normalizeSearch=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(),appointments=[],currentDate='2027-01-11',equipment=['iMoove','SIS','VACU','MBST OSTEOSPIN'],professionals=['Principal ficticio','Fisio elegido ficticio','Readaptador ficticio','Alternativo ficticio'];
const therapyDurations={Fisioterapia:30,Neuromodulación:30,Osteopatía:30,'Readaptación':45,iMoove:15,SIS:30,VACU:30,'Onda de choque':15,'Camilla FD':15},therapyProfessionalDurations={},therapiesWithoutProfessional=new Set(['SIS','VACU']);
const mins=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]),timeStr=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
var resourcesForTherapy=s=>normalizeSearch(s).includes('imoove')?['iMoove']:['SIS','VACU'].includes(s)?[s]:[],serviceCompetency=s=>/fisio|neuromod|osteop|readapt|imoove|onda|camilla/.test(normalizeSearch(s))?'clinical':'',qualifiedProfessionals=()=>professionals;
const samePatientAppointment=(a,b)=>String(a.patientCode)===String(b.patientCode),atlasIsNonClinicalContactAppointment=a=>/llamada|seguimiento/.test(normalizeSearch(a.therapy)),agendaActorName=()=> 'Synthetic visual test',alicanteEquipmentConfig={};
const intervalsOverlap=(a,d,b,e)=>mins(a)<mins(b)+e&&mins(b)<mins(a)+d,conflictsFor=()=>[],blockFor=()=>false,appointmentWithinAllTherapistSchedules=()=>({ok:true});
function save(){throw Error('Unexpected save')}function render(){throw Error('Unexpected render')}
`;
(async()=>{
 const result=generate([...manual,...readapt],{physioProfessional:'Fisio elegido ficticio'}),draft=result.draft;
 assert.deepEqual(result.errors,[]);
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html lang="es"><meta charset="utf-8"><title>Planificador Murcia · prueba ficticia</title><style>body{font-family:Arial,sans-serif}</style><body><p>Prueba aislada con datos ficticios</p></body></html>');
  await page.addScriptTag({content:globals+physicalmDefinition+"\n"+planner+apiCode});
  await page.evaluate(d=>api.showPlanningDraft(d),draft);
  await page.locator('#atlasPlanningDraftBack.open').waitFor();
  assert.equal(await page.locator('#atlasPlanningDraftApprove').isEnabled(),true);
  assert.equal(await page.locator('#atlasPlanningDraftRows tr').count(),5);
  for(const tr of await page.locator('#atlasPlanningDraftRows tr').all()){
   const cells=await tr.locator('td').allTextContents();
   if(cells[2].includes('Fisioterapia')){assert(cells[2].includes('Neuromodulación')&&cells[2].includes('Osteopatía'));assert.equal(cells[4],'60 min');assert(cells[3].includes('Fisio elegido ficticio'))}
   else {assert(cells[2].includes('Readaptación')&&cells[2].includes('iMoove'));assert.equal(cells[4],'45 min');assert(cells[3].includes('Readaptador ficticio')&&cells[3].includes('iMoove'))}
  }
  assert(!await page.locator('#atlasPlanningDraftReport').innerText().then(t=>t.includes('❌')));
  fs.mkdirSync(path.join(__dirname,'../out/planning'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'../out/planning/valid-draft.png'),fullPage:true});
  const invalid=JSON.parse(JSON.stringify(draft));invalid.created[0].duration=15;invalid.created[0].professional='Alternativo ficticio';
  await page.evaluate(d=>api.showPlanningDraft(d),invalid);
  assert.equal(await page.locator('#atlasPlanningDraftApprove').isEnabled(),false);
  assert((await page.locator('#atlasPlanningDraftWarning').innerText()).includes('no se puede aprobar'));
  await page.screenshot({path:path.join(__dirname,'../out/planning/blocked-draft.png'),fullPage:true});
  const actual=require('./planning-murcia-professional-catalog.cjs');
  await page.evaluate(()=>{professionals.splice(0,professionals.length,'Concepción Madrid Taverner','María Pilar Iniesta Cárceles','Aitor Inglés Barrena','Lisardo Esteve Montava');equipment.push('Physicalm');therapyDurations['PHYSICALM DINAMICO']=30});
  await page.addScriptTag({content:actual.catalogCode});
  await page.evaluate(d=>api.showPlanningDraft(d),actual.draft);
  assert.equal(await page.locator('#atlasPlanningDraftApprove').isEnabled(),true);
  for(const tr of await page.locator('#atlasPlanningDraftRows tr').all()){const cells=await tr.locator('td').allTextContents();assert(cells[3].includes(cells[2].includes('Fisioterapia')?'Concepción Madrid Taverner':'Aitor Inglés Barrena'))}
  await page.screenshot({path:path.join(__dirname,'../out/planning/confirmed-professionals.png'),fullPage:true});
  const waiting=require('./planning-murcia-waiting.cjs');
  await page.evaluate(d=>api.showPlanningDraft(d),waiting.oldDraft);
  assert.equal(await page.locator('#atlasPlanningDraftApprove').isEnabled(),false);
  assert((await page.locator('#atlasPlanningDraftWarning').innerText()).includes('60 minutos sin tratamiento'));
  await page.screenshot({path:path.join(__dirname,'../out/planning/excessive-wait-blocked.png'),fullPage:true});
  await page.evaluate(d=>api.showPlanningDraft(d),waiting.validDraft);
  assert.equal(await page.locator('#atlasPlanningDraftApprove').isEnabled(),true);
  assert.equal(await page.locator('#atlasPlanningDraftRows tr').count(),5);
  await page.screenshot({path:path.join(__dirname,'../out/planning/compact-day.png'),fullPage:true});
  await page.evaluate(d=>api.showPlanningDraft(d),waiting.singleWaitDraft);
  assert.equal(await page.locator('#atlasPlanningDraftApprove').isEnabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS real renderer: combined treatments, durations, chosen staff, machine and disabled approval on invalid draft');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
