const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{makeHandler,run}=require('./reminder-cancelled-guard.cjs'),root=path.resolve(__dirname,'..');
(async()=>{
 const source=fs.readFileSync(path.join(root,'modules/agenda.html'),'utf8'),block=source.match(/<script id="atlas-v169-reminder-review-ui">([\s\S]*?)<\/script>/)[1],style=source.match(/<style id="atlas-v169-reminder-review-style">([\s\S]*?)<\/style>/)[1],handler=makeHandler(fs.readFileSync(path.join(root,'atlas.html'),'utf8'));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:800}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.abort());
  await page.exposeFunction('syntheticRespond',async payload=>{const result=await run(handler,{rows:[{id:payload.appointmentId,status:'cancelled',organization_id:'org',clinic_id:'clinic',patient_id:'patient',starts_at:'2030-11-20T12:45:00Z',updated_at:'2030-11-18T10:00:00Z',deleted_at:null,metadata:{}}],id:payload.appointmentId,response:payload.response});assert.equal(result.writes,0);return result.result});
  await page.setContent('<html lang="es"><head><style>body{font:14px Arial;padding:24px;color:#17313d}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:14px;border-bottom:1px solid #ddd}.cash-kpi{display:inline-block;margin-right:36px}.cash-kpi b{display:block;font-size:24px}.small{font-size:12px}.muted{color:#667}.atlas-wa-chip{font-weight:bold}button{padding:7px}</style><style>'+style+'</style></head><body><h1>Automatismos WhatsApp · datos ficticios</h1><div id="waPanel"></div></body></html>');
  await page.evaluate(()=>{
   window.appointments=[];window.render=()=>{};window.normalizeSearch=value=>String(value).toLowerCase();
   const job=(id,name,status,confirmed)=>({id,appointment_id:id,patient_id:'patient',due_at:'2030-11-19T08:00Z',appointment_starts_at:'2030-11-20T12:45Z',trigger_kind:'24h',status:'cancelled',phone:'34600000001',patient:{first_name:name},appointment:{id,status,metadata:confirmed?{whatsappConfirmationAt:'2030-11-19T12:00Z',whatsappConfirmationStatus:'confirmed'}:{}}});
   window.fixtureJobs=[job('cancelled','Paciente ficticio cancelado','cancelled',true),job('pending','Paciente ficticio pendiente','pending',false),job('confirmed','Paciente ficticio confirmado','pending',true)];
   window.renderAtlasWhatsappAutomation=async()=>{document.getElementById('waPanel').innerHTML='<div id="atlasWaReminderSummary"></div><p id="atlasWaReminderSummaryNote"></p><div id="atlasWaReminderFilter"><button class="active" data-reminder-filter="all">Todos</button><button data-reminder-filter="confirmed">Confirmados</button></div><div class="atlas-wa-queue"><table><thead></thead><tbody></tbody></table></div>'};
   window.atlasCentralRequest=async(action,payload)=>{if(action==='appointmentReminders:list')return fixtureJobs;if(action==='appointmentReminders:respond'){const result=await syntheticRespond(payload);if(result.error)throw new Error(result.error.message);return result.data}throw new Error('Acción no permitida en prueba: '+action)};
  });
  await page.addScriptTag({content:block});await page.evaluate(()=>renderAtlasWhatsappAutomation());
  const cancelled=page.locator('tbody tr').filter({hasText:'Paciente ficticio cancelado'});await assert.equal(await cancelled.locator('[data-reminder-action="confirm"]').count(),0);assert.equal(await cancelled.locator('[data-reminder-action="not_confirmed"]').count(),0);assert.match(await cancelled.innerText(),/Cita cancelada/);assert.doesNotMatch(await cancelled.innerText(),/✅ Confirmado/);
  const kpi=await page.locator('#atlasWaReminderSummary').innerText();assert.match(kpi,/1\s*Confirmados/);
  await page.screenshot({path:path.join(root,'../synthetic-reminders.png'),fullPage:true});
  const dialogPromise=new Promise(resolve=>page.once('dialog',async dialog=>{const message=dialog.message();await dialog.dismiss();resolve(message)}));await page.locator('[data-reminder-action="confirm"][data-job-id="pending"]').click();assert.match(await dialogPromise,/Esta cita está cancelada.*Citas canceladas/);
  await page.locator('[data-reminder-filter="confirmed"]').click();assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody').innerText(),/Paciente ficticio confirmado/);assert.deepEqual(errors,[]);console.log('Pantalla: cancelación prioritaria, botones ocultos, contador y filtro correctos, cambio concurrente rechazado; sin red ni errores.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
