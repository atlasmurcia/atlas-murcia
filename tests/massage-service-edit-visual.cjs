const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixture=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Edición de servicio · prueba sintética</title><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><iframe id="agenda" src="/modules/agenda.html"></iframe><script>
const frame=document.getElementById('agenda');frame.onload=()=>frame.contentWindow.postMessage({type:'atlas:central-ready',organizationId:'synthetic-org',clinicId:'synthetic-clinic',userId:'synthetic-user'},'*');
const profile=name=>({id:'synthetic-'+name,name,active:true,therapies:['Fisioterapia','FISIOAVANZADA','MASAJE CL AFILIADOS'],schedule:{2:[['08:00','22:00']]}});
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='atlas:central-db-request')return;const m=event.data;const data=m.action==='settings:list'?[{section:'sales',payload:{categories:['FISIOTERAPIA'],services:[{id:'synthetic-advanced',name:'FISIOAVANZADA',category:'FISIOTERAPIA',duration:45,active:true,price:0},{id:'synthetic-massage',name:'MASAJE CL AFILIADOS',category:'FISIOTERAPIA',duration:45,active:true,price:0}],products:[],stockMovements:[]}},{section:'company',payload:{professionals:[profile('Rubén Soler'),profile('David Díaz Huertas')]}}]:[];event.source.postMessage({type:'atlas:central-db-response',requestId:m.requestId,ok:true,data},'*')});
</script></html>`;
(async()=>{
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/fixture'){res.setHeader('content-type','text/html');return res.end(fixture)}const filename=path.resolve(root,'.'+pathname);if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)){res.writeHead(404);return res.end()}res.setHeader('content-type',pathname.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(filename))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.log('Error de pantalla:',error.message)});page.on('dialog',dialog=>{console.log('Aviso sintético:',dialog.message());return dialog.dismiss()});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  const ui=page.frameLocator('#agenda');
  await ui.locator('#cfgSaved').filter({hasText:'Configuración central sincronizada'}).waitFor({state:'attached',timeout:20000});
  const runtime=page.frames().find(frame=>frame.url().includes('/modules/agenda.html'));
  await runtime.evaluate(()=>{
   window.syntheticSaved=[];
   window.ATLAS_CHILD_CENTRAL_CONTEXT={...window.ATLAS_CHILD_CENTRAL_CONTEXT,profileName:'Operador sintético'};
   const person='David Díaz Huertas',date='2026-11-17';
   currentDate=date;patientMaster.splice(0,patientMaster.length,{code:'SYNTHETIC-PATIENT',remoteId:'synthetic-patient',name:'Paciente sintético',active:true});
   professionals.splice(0,professionals.length,'Rubén Soler',person);resources.splice(0,resources.length,...professionals);
   professionalCompetencies[person]=['fisioterapia'];professionalCompetencies['Rubén Soler']=['fisioterapia'];
   schedules[person]={2:[[480,1320]]};schedules['Rubén Soler']={2:[[480,1320]]};
   alicanteTherapyProfessionals.FISIOAVANZADA=[person];alicanteTherapyProfessionals['MASAJE CL AFILIADOS']=[];
   appointments.splice(0,appointments.length,{id:'synthetic-edit',centralId:'synthetic-edit',patient:'Paciente sintético',patientCode:'SYNTHETIC-PATIENT',patientRemoteId:'synthetic-patient',date,time:'19:00',duration:45,endTime:'19:45',therapy:'FISIOAVANZADA',services:['FISIOAVANZADA'],professional:person,therapists:{FISIOAVANZADA:person},resource:person,resources:[person],status:'Pendiente',history:[]});
   window.atlasPersistAppointmentCentral=async appointment=>{syntheticSaved.push(JSON.parse(JSON.stringify(appointment)));};
   // Isolate persistence: every remaining application request goes to the synthetic bridge above.
   lockedProfessionalContext='';lockedEquipmentContext='';render();openModal(appointments[0]);
  });
  await ui.locator('#mServicesOptions input[value="FISIOAVANZADA"]').uncheck();
  await ui.locator('#mServicesOptions input[value="MASAJE CL AFILIADOS"]').check();
  const before=await runtime.evaluate(()=>({competency:serviceCompetency('MASAJE CL AFILIADOS'),item:readModal(),therapistOptions:[...document.querySelectorAll('#mTherapists select[data-service]')].map(select=>({service:select.dataset.service,value:select.value}))}));
  console.log('Tras cambiar servicio:',JSON.stringify(before));
  assert.equal(before.competency,'fisioterapia');
  assert.equal(before.item.therapists['MASAJE CL AFILIADOS'],'David Díaz Huertas','Conservar el fisio compatible al cambiar el servicio');
  assert.equal(before.item.professional,'David Díaz Huertas');
  assert.deepEqual(before.item.resources,['David Díaz Huertas']);
  assert.equal(before.item.date,'2026-11-17');assert.equal(before.item.time,'19:00');assert.equal(before.item.duration,45);
  await ui.locator('#saveBtn').click();
  console.log('Guardado simulado:',JSON.stringify(await runtime.evaluate(()=>({saved:syntheticSaved.length,warning:document.getElementById('modalWarning').innerText,patient:!!patientByCode('SYNTHETIC-PATIENT')}))));
  await runtime.waitForFunction(()=>syntheticSaved.length===1,{},{timeout:5000});
  await ui.locator('#modalBack').waitFor({state:'hidden'});
  assert.equal(await ui.locator('.appt[data-id="synthetic-edit"][data-column="David Díaz Huertas"]').count(),1);
  assert.equal(await ui.locator('.appt[data-id="synthetic-edit"][data-column="Rubén Soler"]').count(),0);
  const saved=await runtime.evaluate(()=>syntheticSaved[0]);assert.equal(saved.id,'synthetic-edit');assert.deepEqual(saved.services,['MASAJE CL AFILIADOS']);
  // Reload the synthetic saved appointment through the real central row adapter.
  await runtime.evaluate(()=>{const a=syntheticSaved[0],row={id:'synthetic-edit',client_ref:a.id,patient_id:'synthetic-patient',starts_at:'2026-11-17T18:00:00Z',ends_at:'2026-11-17T18:45:00Z',services:a.services,resources:a.resources,professionals:[a.professional],status:'pending',metadata:a};appointments.splice(0,appointments.length,atlasCentralAppointmentFromRow(row));render()});
  assert.equal(await ui.locator('.appt[data-id="synthetic-edit"][data-column="David Díaz Huertas"]').count(),1);
  await ui.locator('.appt[data-id="synthetic-edit"][data-column="David Díaz Huertas"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/private/tmp/massage-service-edit-visible.png',fullPage:true});
  // A new massage without a selected therapist cannot be saved without a column.
  const rejected=await runtime.evaluate(()=>{document.getElementById('mTime').value='19:00';document.getElementById('mEndTime').value='19:45';return validateModal({patientCode:'SYNTHETIC-PATIENT',services:['MASAJE CL AFILIADOS'],date:'2026-11-17',time:'19:00',endTime:'19:45',duration:45,therapists:{},resources:[],resource:'',professional:''})});
  assert.equal(rejected,false);
  assert.match(await ui.locator('#modalWarning').innerText(),/Falta seleccionar terapeuta/);
  assert.deepEqual(errors,[]);console.log('OK: cambio de servicio, mismo fisio/fecha/hora, guardado sintético, tarjeta visible tras recargar y bloqueo sin terapeuta.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
