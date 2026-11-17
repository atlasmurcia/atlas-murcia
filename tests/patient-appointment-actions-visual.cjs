const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async dialog=>{errors.push(dialog.message());await dialog.dismiss()});
  const html=fs.readFileSync(path.join(__dirname,'../modules/agenda.html'),'utf8');
  await page.route('**/*',route=>{if(route.request().url()==='http://atlas.test/agenda.html')return route.fulfill({contentType:'text/html',body:html});requests.push(route.request().url());return route.abort()});
  await page.goto('http://atlas.test/agenda.html');
  await page.evaluate(()=>{
   const p={remoteId:'patient-test',code:'TEST-1',name:'Paciente de prueba',phone:'',active:true};
   patientMaster.splice(0,patientMaster.length,p);
   appointments=[];currentDate='2027-01-08';render();
   window.visualAppointmentStatus='Pendiente';
   window.atlasLoadAppointmentDate=async date=>{
    await new Promise(resolve=>setTimeout(resolve,150));
    appointments=[{id:'selected',centralId:'synthetic-central-id',patientRemoteId:p.remoteId,patientCode:p.code,patient:p.name,date,time:'11:30',endTime:'12:00',duration:30,status:window.visualAppointmentStatus,therapy:'VACU',services:['VACU'],resource:'VACU',resources:['VACU'],professionals:[],history:[],notes:''}];
   };
  });
  for(const action of ['move','cancel','reschedule']){
   await page.evaluate(action=>{
    document.getElementById('modalBack').classList.remove('open');document.getElementById('cancelBack').classList.remove('open');
    window.visualAppointmentStatus=action==='reschedule'?'Cancelada':'Pendiente';
    window.dispatchEvent(new MessageEvent('message',{data:{type:'atlasAlicante:show-patient',patient:{remoteId:'patient-test',code:'TEST-1',name:'Paciente de prueba'},appointmentId:'selected',date:'2026-11-16',appointmentAction:action}}));
   },action);
   await page.locator(action==='cancel'?'#cancelBack.open':'#modalBack.open').waitFor({state:'visible'});
   if(action!=='reschedule')assert.equal(await page.evaluate(()=>String(selectedId)),'selected');else assert.equal(await page.evaluate(()=>String(editingId)),'selected');
   assert.equal(await page.evaluate(()=>currentDate),'2026-11-16');
   if(action!=='cancel')assert.equal(await page.locator('#mDate').inputValue(),'2026-11-16');
   if(action==='reschedule'){
    assert.equal(await page.locator('#modalTitle').innerText(),'Reprogramar cita');
    assert.equal(await page.locator('#mStatus').inputValue(),'Pendiente');
    assert.equal(await page.locator('#mPatient').isEnabled(),false);
    assert.equal(await page.locator('#mProfessional').isEnabled(),false);
    assert.equal(await page.locator('#mDate').isEnabled(),true);
    assert.equal(await page.locator('#mTime').isEnabled(),true);
    assert.match(await page.locator('#mEditScope').innerText(),/sin crear una copia/i);
   }
   await page.screenshot({path:path.join(__dirname,'../'+action+'-synthetic.png')});
  }
  console.log(JSON.stringify({result:'Los formularios de modificar, anular y reprogramar abren la cita seleccionada',errors,blockedExternalRequests:requests.length}));
  assert.equal(errors.length,0);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
