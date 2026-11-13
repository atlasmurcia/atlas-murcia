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
   window.atlasLoadAppointmentDate=async date=>{
    await new Promise(resolve=>setTimeout(resolve,150));
    appointments=[{id:'selected',centralId:'synthetic-central-id',patientRemoteId:p.remoteId,patientCode:p.code,patient:p.name,date,time:'11:30',endTime:'12:00',duration:30,status:'Pendiente',therapy:'VACU',services:['VACU'],resource:'VACU',resources:['VACU'],professionals:[],history:[],notes:''}];
   };
  });
  for(const action of ['move','cancel']){
   await page.evaluate(action=>{
    document.getElementById('modalBack').classList.remove('open');document.getElementById('cancelBack').classList.remove('open');
    window.dispatchEvent(new MessageEvent('message',{data:{type:'atlasAlicante:show-patient',patient:{remoteId:'patient-test',code:'TEST-1',name:'Paciente de prueba'},appointmentId:'selected',date:'2026-11-16',appointmentAction:action}}));
   },action);
   await page.locator(action==='move'?'#modalBack.open':'#cancelBack.open').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>String(selectedId)),'selected');
   assert.equal(await page.evaluate(()=>currentDate),'2026-11-16');
   if(action==='move')assert.equal(await page.locator('#mDate').inputValue(),'2026-11-16');
   await page.screenshot({path:path.join(__dirname,'../'+action+'-synthetic.png')});
  }
  console.log(JSON.stringify({result:'Ambos formularios abiertos para la cita seleccionada',errors,blockedExternalRequests:requests.length}));
  assert.equal(errors.length,0);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
