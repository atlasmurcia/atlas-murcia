const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'modules/agenda.html'),'utf8');
let scripts=0;for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=/.test(match[1])&&match[2].trim()){new vm.Script(match[2]);scripts++}
assert(!html.includes('appointment-whatsapp-copy.js'));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.origin!=='http://atlas.test')return route.abort();
   const file=path.resolve(root,'.'+u.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)});
  });
  await page.goto('http://atlas.test/modules/agenda.html');
  await page.evaluate(()=>{
   localStorage.clear();window.waTestOpened=[];window.waTestAlerts=[];window.alert=m=>waTestAlerts.push(m);
   window.open=(url)=>{waTestOpened.push(url);return {opener:{},location:{set href(v){waTestOpened.push(v)}},close(){waTestOpened.push('closed')}}};
   window.waTestPatient={remoteId:'synthetic-patient-1',code:'TEST-1',name:'Paciente ficticio',phone:'600 000 001',email:'synthetic@example.invalid',active:true};
   patientMaster.splice(0,patientMaster.length,{remoteId:'other-id',code:'OTHER',name:'Paciente ficticio',phone:'600000002',email:'wrong@example.invalid'},waTestPatient);
   appointments=[{id:'synthetic-appointment',patientRemoteId:waTestPatient.remoteId,patientCode:'TEST-1',patient:waTestPatient.name,date:'2026-11-20',start:'08:30',time:'08:30',duration:60,therapy:'Servicio ficticio',services:['Servicio ficticio'],therapist:'Profesional ficticio',therapies:['Servicio ficticio'],resources:[],professionals:[],history:[],professional:'Profesional ficticio',status:'Pendiente',notes:''}];
   selectedId='synthetic-appointment';waConfig().manualText='Hola [CLIENTE], [FECHA] [HORA] [SERVICIOS] [DURACION] [EMPLEADO] [EMAIL] & prueba';
   openDrawer(selectedId);
  });
  const states=['Pendiente','Confirmada','Ha llegado','Realizada','No se presentó','Cancelada'];
  for(const state of states){
   await page.evaluate(state=>{appointments[0].status=state;waTestOpened.length=0},state);
   await page.locator('#waAppointmentBtn').click();
   const urls=await page.evaluate(()=>waTestOpened);
   assert.equal(urls.length,1,state);const u=new URL(urls[0]);assert.equal(u.pathname,'/34600000001');
   assert.equal(u.searchParams.get('text'),'Hola Paciente ficticio, 2026-11-20 08:30 Servicio ficticio 60 Profesional ficticio synthetic@example.invalid & prueba');
   assert.equal(await page.locator('#atlasAppointmentWhatsappBack').evaluate(e=>e.classList.contains('open')),false);
  }
  // Local phone formats and international prefixes, without contacting WhatsApp.
  for(const [phone,expected] of [['+34 (600) 000-001','34600000001'],['0034 600000001','34600000001'],['+44 7700 900123','447700900123']]){
   await page.evaluate(phone=>{waTestPatient.phone=phone;waTestOpened.length=0},phone);await page.locator('#waAppointmentBtn').click();
   assert.equal(new URL((await page.evaluate(()=>waTestOpened))[0]).pathname,'/'+expected);
  }
  for(const phone of ['', '123', '600000001 / 600000002', '600000001 ext 2']){
   await page.evaluate(phone=>{waTestPatient.phone=phone;waTestOpened.length=0;appointments[0].phone='699999999'},phone);
   await page.locator('#waAppointmentBtn').click();assert.deepEqual(await page.evaluate(()=>waTestOpened),[]);
   await page.locator('#atlasAppointmentWhatsappBack.open').waitFor();assert.match(await page.locator('#atlasAppointmentWhatsappStatus').innerText(),/teléfono falta o no es válido/);
   await page.locator('#atlasAppointmentWhatsappClose').click();
  }
  // Popup blocker offers an ordinary link while keeping the patient card open.
  await page.evaluate(()=>{waTestPatient.phone='600000001';window.open=()=>null});await page.locator('#waAppointmentBtn').click();
  assert.match(await page.locator('#atlasAppointmentWhatsappStatus a').getAttribute('href'),/^https:\/\/wa.me\/34600000001\?text=/);
  await page.screenshot({path:path.join(root,'whatsapp-fallback-synthetic.png')});
  await page.locator('#atlasAppointmentWhatsappClose').click();
  // Resolve an uncached patient by stable ID only; never write or use a same-name patient.
  await page.evaluate(()=>{
   patientMaster.splice(1,1);window.waTestCalls=[];waTestOpened.length=0;
   window.open=url=>{waTestOpened.push(url);return {opener:null,location:{set href(v){waTestOpened.push(v)}},close(){waTestOpened.push('closed')}}};
   window.atlasCentralRequest=async(action,payload)=>{if(action!=='patients:resolve')return [];waTestCalls.push({action,payload});return {id:'synthetic-patient-1',patient_number:'TEST-1',first_name:'Paciente',last_name_1:'ficticio',phone:'600000003',email:'resolved@example.invalid'}};
  });
  await page.locator('#waAppointmentBtn').click();await page.waitForFunction(()=>waTestOpened.length===2);
  assert.equal(new URL((await page.evaluate(()=>waTestOpened))[1]).pathname,'/34600000003');
  assert.deepEqual(await page.evaluate(()=>waTestCalls),[{action:'patients:resolve',payload:{id:'synthetic-patient-1'}}]);
  assert.match(new URL((await page.evaluate(()=>waTestOpened))[1]).searchParams.get('text'),/resolved@example.invalid/);
  await page.evaluate(()=>{waTestOpened.length=0;waTestAlerts.length=0;window.atlasCentralRequest=async()=>{throw new Error('Fallo sintético')}});
  await page.locator('#waAppointmentBtn').click();assert.deepEqual(await page.evaluate(()=>waTestOpened),['about:blank','closed']);assert.match((await page.evaluate(()=>waTestAlerts))[0],/Fallo sintético/);
  await page.evaluate(()=>{waTestOpened.length=0;waTestAlerts.length=0;window.atlasCentralRequest=async()=>({id:'wrong-id',phone:'600000004'})});
  await page.locator('#waAppointmentBtn').click();assert.deepEqual(await page.evaluate(()=>waTestOpened),['about:blank','closed']);assert.match((await page.evaluate(()=>waTestAlerts))[0],/ficha vinculada/);
  // Changing appointments while a lookup is pending must close the reserved window.
  await page.evaluate(()=>{waTestOpened.length=0;window.atlasCentralRequest=()=>new Promise(resolve=>window.finishWaLookup=resolve)});
  await page.locator('#waAppointmentBtn').click();
  await page.evaluate(()=>{selectedId='another-appointment';finishWaLookup({id:'synthetic-patient-1',patient_number:'TEST-1',phone:'600000001'})});
  await page.waitForFunction(()=>waTestOpened.includes('closed'));assert.deepEqual(await page.evaluate(()=>waTestOpened),['about:blank','closed']);
  await page.evaluate(()=>{selectedId='synthetic-appointment';patientMaster.push(waTestPatient);delete appointments[0].patientRemoteId;appointments[0].patientCode='TEST-1';waTestOpened.length=0;waTestPatient.phone='600000001'});
  await page.locator('#waAppointmentBtn').click();assert.equal(new URL((await page.evaluate(()=>waTestOpened))[0]).pathname,'/34600000001');
  await page.screenshot({path:path.join(root,'whatsapp-appointment-synthetic.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,agendaScripts: scripts,statuses:states,externalRequests:'blocked',pageErrors:errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
