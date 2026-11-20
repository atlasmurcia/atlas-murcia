const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),baseline=process.env.EXPECT_AGENDA_RETURN_BUG==='1';
const A={remoteId:'synthetic-a',code:'TEST-A',name:'Paciente Ficticio A'},B={remoteId:'synthetic-b',code:'TEST-B',name:'Paciente Ficticio B'};
function scripts(html){return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);}
function fixture(html,script){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script>${script}</script></body>`);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{for(const entry of ['atlas.html','index.html']){
  const shell=fs.readFileSync(path.join(root,'atlas.html'),'utf8'),ficha=fs.readFileSync(path.join(root,'modules/ficha.html'),'utf8');
  const shellScript=scripts(shell).find(s=>s.includes('const agendaFrame=document.getElementById'));
  const bridge=scripts(ficha).find(s=>s.includes("const hero=document.querySelector('.hero');"));assert(bridge);
  const fichaSetup=`let patientRecordCode='',patientRecord={};function recordKey(){return 'synthetic-'+patientRecordCode}function readPatientRecord(){return {administrative:{},budgets:[]}};${['loadBudgetsForPatient','loadAdministrativeData','renderClinicalHistory','renderClinicalEvolutions','renderPatientDocuments','renderConsentList','renderDiagnosticTests','renderTreatmentControl','openPatientRoute'].map(n=>`function ${n}(){}`).join('')}`;
  const shellSetup="window.alerts=[];window.alert=x=>alerts.push(x);document.getElementById('atlasLogin')?.remove();document.getElementById('atlasPasswordChange')?.remove();";
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='synthetic.test'){external.push(url.hostname);return route.abort()}
   if(url.pathname==='/'&&entry==='index.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8')});
   if(url.pathname==='/'||url.pathname==='/atlas.html')return route.fulfill({contentType:'text/html',body:fixture(shell,shellSetup+shellScript)});
   if(url.pathname.endsWith('ficha.html'))return route.fulfill({contentType:'text/html',body:fixture(ficha,fichaSetup+bridge)});
   return route.fulfill({contentType:'text/html',body:'<html><body>Agenda ficticia<script>window.received=[];addEventListener("message",e=>received.push(e.data))</script></body></html>'});
  });
  await page.goto('https://synthetic.test/');
  await page.waitForFunction(()=>typeof agendaFrame!=='undefined');
  const select=patient=>page.evaluate(patient=>window.dispatchEvent(new MessageEvent('message',{source:agendaFrame.contentWindow,data:{type:'atlas:patient-selected',openFicha:true,patient,appointments:[]}})),patient);
  await select(A);await page.waitForFunction(()=>fichaFrame.style.visibility!=='hidden');
  const frame=page.frames().find(f=>f.url().includes('/modules/ficha.html'));assert(frame);
  await frame.locator('#backToAgendaBtn').click();await page.waitForTimeout(100);
  if(baseline){
   assert.equal(await page.evaluate(()=>atlasVisibleModule),'ficha');
   assert.match(await page.evaluate(()=>alerts[0]),/La ficha está cambiando de paciente/);
   console.log('REPRODUCED '+entry+': loaded record, actual Agenda button blocked by identity guard.');
   await page.close();continue;
  }
  assert.equal(await page.evaluate(()=>atlasVisibleModule),'agenda');
  assert.equal(await page.evaluate(()=>alerts.length),0);
  assert.equal(await page.evaluate(()=>selected.patient.remoteId),A.remoteId);
  await select(B);await page.waitForFunction(()=>fichaFrame.style.visibility!=='hidden');
  const emit=message=>page.evaluate(message=>window.dispatchEvent(new MessageEvent('message',{source:fichaFrame.contentWindow,data:message})),message);
  for(const type of ['atlas:show-patient','atlas:new-appointment','atlas:delete-patient-request']){
   await emit({type,patient:A});assert.equal(await page.evaluate(()=>atlasVisibleModule),'ficha');
   assert.equal(await page.evaluate(()=>selected.patient.remoteId),B.remoteId);
  }
  assert.equal(await page.evaluate(()=>alerts.length),3);
  // An action missing its patient must not be treated as a plain return.
  await emit({type:'atlas:show-patient',appointmentId:'synthetic-appointment',appointmentAction:'move'});
  assert.equal(await page.evaluate(()=>atlasVisibleModule),'ficha');
  assert.equal(await page.evaluate(()=>alerts.length),4);
  await frame.locator('#showInAgenda').click();await page.waitForFunction(()=>atlasVisibleModule==='agenda');
  const agenda=page.frames().find(f=>f.url().includes('/modules/agenda.html'));
  await agenda.waitForFunction(()=>received.some(m=>m.type==='atlasAlicante:show-patient'));
  assert.equal(await agenda.evaluate(()=>received.find(m=>m.type==='atlasAlicante:show-patient').patient.remoteId),B.remoteId);
  // Returning is safe even while identity acknowledgement is pending.
  await page.evaluate(()=>{mode('ficha');fichaFrame.style.visibility='hidden'});
  await emit({type:'atlas:new-appointment',patient:B});
  assert.equal(await page.evaluate(()=>atlasVisibleModule),'ficha');
  await emit({type:'atlas:show-patient'});
  assert.equal(await page.evaluate(()=>atlasVisibleModule),'agenda');
  assert.equal(await page.evaluate(()=>alerts.length),5);
  await page.evaluate(()=>{mode('ficha');selected=null});
  await emit({type:'atlas:show-patient'});
  assert.equal(await page.evaluate(()=>atlasVisibleModule),'agenda');
  assert.equal(await page.evaluate(()=>alerts.length),5);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.screenshot({path:path.join(require('node:os').tmpdir(),'murcia-agenda-return-'+entry+'.png')});
  console.log('PASS '+entry+': actual Agenda button; current patient agenda; stale, incomplete and loading actions blocked; return during loading and without a selection; no external requests or page errors.');
  await page.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
