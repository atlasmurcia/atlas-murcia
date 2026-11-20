const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),A={remoteId:'synthetic-a',code:'TEST-A',name:'Paciente Ficticio A'},B={remoteId:'synthetic-b',code:'TEST-B',name:'Paciente Ficticio B'};
function scripts(html){return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[2]);}
function fixture(html,script){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script>${script}</script></body>`);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{for(const clinic of ['murcia']){
  const dir=root,shell=fs.readFileSync(path.join(dir,clinic==='alicante'?'index.html':'atlas.html'),'utf8'),ficha=fs.readFileSync(path.join(dir,'modules/ficha.html'),'utf8');
  const shellScript=scripts(shell).find(s=>s.includes('const agendaFrame=document.getElementById'));
  const bridge=scripts(ficha).find(s=>s.includes("const hero=document.querySelector('.hero');"));assert(bridge);
  const fichaSetup=`window.alert=()=>{};let patientRecordCode='',patientRecord={};function recordKey(){return 'synthetic-'+patientRecordCode}function readPatientRecord(){return {administrative:{},budgets:[]}};${['loadBudgetsForPatient','loadAdministrativeData','renderClinicalHistory','renderClinicalEvolutions','renderPatientDocuments','renderConsentList','renderDiagnosticTests','renderTreatmentControl','openPatientRoute'].map(n=>`function ${n}(){}`).join('')}`;
  const shellSetup="window.alerts=[];window.alert=x=>alerts.push(x);document.getElementById('atlasLogin')?.remove();document.getElementById('atlasPasswordChange')?.remove();";
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='synthetic.test')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture(shell,shellSetup+shellScript)});
   if(url.pathname.endsWith('ficha.html'))return route.fulfill({contentType:'text/html',body:fixture(ficha,fichaSetup+bridge)});
   return route.fulfill({contentType:'text/html',body:'<html><body>Agenda ficticia<script>window.received=[];addEventListener("message",e=>received.push(e.data))</script></body></html>'});
  });
  await page.goto('https://synthetic.test/');
  await page.evaluate(()=>mode('agenda'));
  const select=async(patient,extra={})=>page.evaluate(({patient,extra})=>window.dispatchEvent(new MessageEvent('message',{source:agendaFrame.contentWindow,data:{type:'atlas:patient-selected',openFicha:true,patient,appointments:[],...extra}})),{patient,extra});
  await select(A,{targetPanel:'datos',recordRequestId:'A-request'});
  await page.waitForFunction(()=>fichaFrame.style.visibility!=='hidden');
  const frame=page.frames().find(f=>f.url().includes('/modules/ficha.html'));assert(frame);
  assert.equal(await frame.locator('.hero h1').innerText(),A.name);
  // The second patient must survive all of the first patient's delayed target-panel retries.
  await select(B,{recordRequestId:'B-request'});
  await page.waitForFunction(()=>fichaFrame.style.visibility!=='hidden');
  await page.waitForTimeout(450);
  assert.equal(await frame.locator('.hero h1').innerText(),B.name);
  assert.equal(await frame.locator('#patientCode').inputValue(),B.code);
  await page.evaluate(({A})=>window.dispatchEvent(new MessageEvent('message',{source:agendaFrame.contentWindow,data:{type:'atlas:patient-appointments-loaded',patient:A,recordRequestId:'A-request',appointments:[]}})),{A});
  assert.equal(await page.evaluate(()=>selected.patient.remoteId),B.remoteId);
  // A stale click emitted by the old record is refused by the shell.
  await page.evaluate(({A})=>window.dispatchEvent(new MessageEvent('message',{source:fichaFrame.contentWindow,data:{type:'atlas:new-appointment',patient:A}})),{A});
  assert.equal(await page.evaluate(()=>selected.patient.remoteId),B.remoteId);
  assert.equal(await page.evaluate(()=>alerts.length),1);
  await frame.locator('#newPatientAppointmentBtn').click();
  await page.waitForFunction(()=>atlasVisibleModule==='agenda');
  assert.equal(await page.evaluate(()=>selected.patient.remoteId),B.remoteId);
  const agenda=page.frames().find(f=>f.url().includes('/modules/agenda.html'));
  await agenda.waitForFunction(()=>received.some(m=>m.type==='atlas:new-appointment'));
  assert.equal(await agenda.evaluate(()=>received.find(m=>m.type==='atlas:new-appointment').patient.remoteId),B.remoteId);
  // No old content can be used while the new identity is not yet acknowledged.
  await select(A);
  await page.waitForFunction(()=>fichaFrame.style.visibility!=='hidden');
  await page.screenshot({path:path.join(require('node:os').tmpdir(),clinic+'-patient-identity-synthetic.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS '+clinic+': real shell and record bridge in Chrome; rapid switch, delayed panel, stale history, blocked old click, current new appointment, visible patient code; no page errors.');
  await page.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
