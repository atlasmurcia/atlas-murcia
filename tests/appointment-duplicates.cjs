const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'modules/agenda.html'),'utf8');
let scripts=0;for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=|application\/json/.test(match[1])||!match[2].trim())continue;new vm.Script(match[2]);scripts++;}
new vm.Script(fs.readFileSync(path.join(root,'modules/appointment-duplicates.js'),'utf8'));
const fixture=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Duplicar citas · datos ficticios</title><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><iframe id="agenda" src="/modules/agenda.html"></iframe><script>
const frame=document.getElementById('agenda');frame.onload=()=>frame.contentWindow.postMessage({type:'atlas:central-ready',organizationId:'synthetic-org',clinicId:'synthetic-clinic',userId:'synthetic-user'},'*');
const profile={name:'David Díaz Huertas',active:true,therapies:['Fisioterapia'],schedule:Object.fromEntries([0,1,2,3,4,5,6].map(day=>[day,[['08:00','22:00']]]))};
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='atlas:central-db-request')return;const m=event.data;const data=m.action==='settings:list'?[{section:'sales',payload:{categories:['FISIOTERAPIA'],services:[{id:'synthetic-service',name:'Fisioterapia',category:'FISIOTERAPIA',duration:45,active:true,price:0}],products:[],stockMovements:[]}},{section:'company',payload:{professionals:[profile]}}]:[];event.source.postMessage({type:'atlas:central-db-response',requestId:m.requestId,ok:true,data},'*')});
</script></html>`;
(async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/fixture'){res.setHeader('content-type','text/html');return res.end(fixture)}const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()}res.setHeader('content-type',file.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(file))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  const ui=page.frameLocator('#agenda');
  await ui.locator('#cfgSaved').filter({hasText:'Configuración central sincronizada'}).waitFor({state:'attached'});
  const runtime=page.frames().find(frame=>frame.url().includes('/modules/agenda.html'));
  await runtime.evaluate(()=>{
   window.syntheticSaved=[];window.syntheticAttempts=[];
   window.ATLAS_CHILD_CENTRAL_CONTEXT={...window.ATLAS_CHILD_CENTRAL_CONTEXT,profileName:'Operador ficticio'};
   const person='David Díaz Huertas',date='2026-11-17';currentDate=date;
   patientMaster.splice(0,patientMaster.length,{code:'SYNTHETIC',remoteId:'synthetic-patient',name:'Paciente ficticio',active:true});
   professionals.splice(0,professionals.length,person);resources.splice(0,resources.length,person);professionalCompetencies[person]=['fisioterapia'];schedules[person]=Object.fromEntries([0,1,2,3,4,5,6].map(day=>[day,[[480,1320]]]));alicanteTherapyProfessionals.Fisioterapia=[person];
   appointments.splice(0,appointments.length,{id:'original',centralId:'central-original',centralRef:'original-ref',centralUpdatedAt:'original-revision',patient:'Paciente ficticio',patientCode:'SYNTHETIC',patientRemoteId:'synthetic-patient',date,time:'09:15',duration:45,endTime:'10:00',therapy:'Fisioterapia',services:['Fisioterapia'],professional:person,therapists:{Fisioterapia:person},resource:person,resources:[person],status:'Realizada',notes:'Observación ficticia que debe conservarse',history:[{action:'Historia original'}],budgetId:'budget-original',planId:'plan-original',leadContext:{id:'lead-original'},metadata:{historico:true,paymentId:'payment-original'},paymentId:'payment-original',paid:true,forced:true,forceReason:'Excepción anterior',cancelledAt:'fecha anterior',waConfirmation:'confirmed'});
   window.atlasPersistAppointmentCentral=async appointment=>{syntheticAttempts.push(appointment.id);appointment.centralId='saved-'+appointment.id;appointment.centralUpdatedAt='synthetic-revision';syntheticSaved.push(JSON.parse(JSON.stringify(appointment)));};
   render();window.originalSnapshot=JSON.stringify(appointments[0]);openDrawer('original');
  });
  await ui.locator('#duplicateAppointmentBtn').click();
  assert.equal(await ui.locator('.duplicate-row').count(),1);
  assert.equal(await ui.getByLabel('Fecha de la copia 1',{exact:true}).inputValue(),'2026-11-18');
  assert.equal(await ui.getByLabel('Hora de inicio de la copia 1',{exact:true}).inputValue(),'09:15');
  await ui.locator('#addDuplicateAppointmentDay').click();
  await ui.getByLabel('Fecha de la copia 1',{exact:true}).fill('2026-11-17');
  await ui.locator('#saveDuplicateAppointments').click();
  assert.match(await ui.locator('.duplicate-state').first().innerText(),/solapa/);
  assert.equal(await runtime.evaluate(()=>syntheticSaved.length),0);
  await ui.getByLabel('Fecha de la copia 1',{exact:true}).fill('2026-11-18');
  // Detectar también conflictos entre dos copias todavía no guardadas.
  await ui.getByLabel('Fecha de la copia 2',{exact:true}).fill('2026-11-18');
  await ui.locator('#saveDuplicateAppointments').click();
  assert.equal(await runtime.evaluate(()=>syntheticSaved.length),0);
  assert.match(await ui.locator('.duplicate-state').nth(1).innerText(),/solapa/);
  // Horario del fisioterapeuta y bloqueo de agenda.
  await ui.getByLabel('Fecha de la copia 2',{exact:true}).fill('2026-11-20');
  await ui.getByLabel('Hora de inicio de la copia 2',{exact:true}).fill('23:00');
  await ui.locator('#saveDuplicateAppointments').click();
  assert.match(await ui.locator('.duplicate-state').nth(1).innerText(),/no trabaja|Horario bloqueado/);
  await ui.getByLabel('Hora de inicio de la copia 2',{exact:true}).fill('11:15');
  await runtime.evaluate(()=>agendaBlocks.push({id:'synthetic-block',date:'2026-11-20',type:'day',resources:['*'],reason:'Bloqueo ficticio'}));
  await ui.locator('#saveDuplicateAppointments').click();
  assert.match(await ui.locator('.duplicate-state').nth(1).innerText(),/bloqueado/);
  await runtime.evaluate(()=>agendaBlocks.splice(0,agendaBlocks.length));
  await page.screenshot({path:'/private/tmp/atlas-duplicates-desktop.png',fullPage:true});
  await ui.locator('#saveDuplicateAppointments').click();
  await ui.locator('#duplicateAppointmentsMessage').filter({hasText:'2 cita(s) creadas'}).waitFor();
  const saved=await runtime.evaluate(()=>syntheticSaved);
  assert.equal(saved.length,2);assert.notEqual(saved[0].id,saved[1].id);assert.notEqual(saved[0].centralRef,saved[1].centralRef);
  for(const copy of saved){
   assert.equal(copy.patientCode,'SYNTHETIC');assert.deepEqual(copy.services,['Fisioterapia']);assert.equal(copy.professional,'David Díaz Huertas');assert.deepEqual(copy.therapists,{Fisioterapia:'David Díaz Huertas'});assert.equal(copy.duration,45);assert.equal(copy.notes,'Observación ficticia que debe conservarse');assert.equal(copy.status,'Pendiente');assert.equal(copy.duplicatedFrom,'central-original');
   for(const key of ['metadata','paymentId','paid','planId','budgetId','leadContext','cancelledAt','waConfirmation','externalId','historico'])assert.equal(copy[key],undefined,key+' no debe heredarse');
   assert.equal(copy.forced,false);assert.equal(copy.history.length,1);
  }
  assert.equal(saved[0].date,'2026-11-18');assert.equal(saved[0].time,'09:15');assert.equal(saved[0].endTime,'10:00');
  assert.equal(saved[1].date,'2026-11-20');assert.equal(saved[1].time,'11:15');assert.equal(saved[1].endTime,'12:00');
  assert.equal(await runtime.evaluate(()=>JSON.stringify(appointments.find(a=>a.id==='original'))===originalSnapshot),true);
  await ui.locator('#closeDuplicateAppointments').click();
  // Las copias usan el editor normal como citas individuales.
  await runtime.evaluate(()=>{window.copyTwoSnapshot=JSON.stringify(appointments[2]);openDrawer(appointments[1].id)});
  await ui.locator('#moveBtn').click();
  await ui.locator('#mTime').fill('10:15');await ui.locator('#mEndTime').fill('11:00');
  await ui.locator('#saveBtn').click();await ui.locator('#modalBack').waitFor({state:'hidden'});
  assert.equal(await runtime.evaluate(()=>appointments[1].time),'10:15');
  assert.equal(await runtime.evaluate(()=>JSON.stringify(appointments[2])===copyTwoSnapshot),true);
  assert.equal(await runtime.evaluate(()=>JSON.stringify(appointments[0])===originalSnapshot),true);
  await runtime.evaluate(()=>{window.atlasCancelAppointmentCentral=async(id,who,reason)=>{const a=appointments.find(item=>item.id===id);a.status='Cancelada';a.cancelledBy=who;a.cancelReason=reason;return a};openDrawer(appointments[1].id)});
  await ui.locator('#deleteBtn').click();await ui.locator('#cancelReason').fill('Cancelación ficticia de una sola copia');
  await ui.locator('#confirmCancelBtn').click();await ui.locator('#cancelBack').waitFor({state:'hidden'});
  assert.equal(await runtime.evaluate(()=>appointments[1].status),'Cancelada');
  assert.equal(await runtime.evaluate(()=>JSON.stringify(appointments[2])===copyTwoSnapshot),true);
  assert.equal(await runtime.evaluate(()=>JSON.stringify(appointments[0])===originalSnapshot),true);
  // Fallo parcial: conservar referencias y no repetir las copias confirmadas.
  await runtime.evaluate(()=>{syntheticSaved=[];syntheticAttempts=[];window.failedOnce=false;window.syntheticIds=new Set();window.atlasPersistAppointmentCentral=async appointment=>{syntheticAttempts.push(appointment.id);syntheticIds.add(appointment.id);if(syntheticAttempts.length===2&&!failedOnce){failedOnce=true;throw new Error('Respuesta perdida simulada')}appointment.centralId='saved-'+appointment.id;syntheticSaved.push(JSON.parse(JSON.stringify(appointment)))};openDrawer('original')});
  await ui.locator('#duplicateAppointmentBtn').click();
  await ui.getByLabel('Fecha de la copia 1',{exact:true}).fill('2026-11-24');
  await ui.locator('#addDuplicateAppointmentDay').click();await ui.locator('#addDuplicateAppointmentDay').click();
  await ui.locator('#saveDuplicateAppointments').click();
  await ui.locator('#duplicateAppointmentsMessage').filter({hasText:'1 de 3'}).waitFor();
  assert.equal(await ui.getByLabel('Fecha de la copia 2',{exact:true}).isDisabled(),true);
  await ui.locator('#saveDuplicateAppointments').click();
  await ui.locator('#duplicateAppointmentsMessage').filter({hasText:'3 cita(s) creadas'}).waitFor();
  const retry=await runtime.evaluate(()=>({attempts:syntheticAttempts,unique:syntheticIds.size}));assert.equal(retry.unique,3);assert.equal(retry.attempts.length,4);assert.equal(retry.attempts[1],retry.attempts[2]);
  assert.equal(await runtime.evaluate(()=>JSON.stringify(appointments[0])===originalSnapshot),true);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/private/tmp/atlas-duplicates-mobile.png',fullPage:true});
  assert.equal(await runtime.evaluate(()=>document.getElementById('duplicateAppointmentsBack').scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('OK: '+scripts+' scripts válidos; varias fechas/horas, datos conservados, conflictos, horarios, bloqueos, independencia, reintentos y vista móvil.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
