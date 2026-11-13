const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ficha=fs.readFileSync(path.join(root,'modules/ficha.html'),'utf8');
const atlas=fs.readFileSync(path.join(root,'atlas.html'),'utf8');
const agenda=fs.readFileSync(path.join(root,'modules/agenda.html'),'utf8');
const script=(html,id)=>html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1];
// Parse every inline script in the affected pages without executing any app or network request.
for(const html of [ficha,atlas,agenda])for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);

async function checkBridge(){
 const start=atlas.indexOf("else if(m.action==='patient-photo:get')");
 const end=atlas.indexOf("else if(m.action==='documents:list')",start);
 const handler=new vm.Script('(async()=>{let result;if(false){}'+atlas.slice(start,end)+';return result})()');
 const rows=[{id:'d1',patient_id:'p1',organization_id:'org',clinic_id:'clinic',client_ref:'atlas-patient-photo',deleted_at:null,storage_path:'photo.jpg'}];
 let fail=false;
 const db={from(table){let filters=[],changes;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},update(value){changes=value;return q},async maybeSingle(){return q.single()},async single(){if(fail)return {error:{message:'Synthetic failure'}};const row=(table==='patients'?[{id:'p1',organization_id:'org',clinic_id:'clinic',deleted_at:null}]:rows).find(r=>filters.every(f=>f(r)));if(row&&changes)Object.assign(row,changes);return {data:row||null,error:null}}};return q}};
 const env={db,context:{organizationId:'org',clinicId:'clinic'},uploadPrivate:async()=>{},addSignedUrls:async rows=>rows.map(r=>({...r,storage_path_url:'synthetic-url'}))};
 const run=(action,patientId='p1',data)=>handler.runInNewContext({...env,m:{action,payload:{patientId,data}}});
 assert((await run('patient-photo:get')).data);
 assert.equal((await run('patient-photo:delete','other')).data.deleted,true);assert.equal(rows[0].deleted_at,null);
 fail=true;assert((await run('patient-photo:delete')).error);assert.equal(rows[0].deleted_at,null);fail=false;
 await run('patient-photo:delete');assert(rows[0].deleted_at);
 assert.equal((await run('patient-photo:get')).data,null);
 assert.equal((await run('patient-photo:delete')).data.deleted,true);
 await run('patient-photo:save','p1','data:image/jpeg;base64,synthetic');assert.equal(rows[0].deleted_at,null);
 assert((await run('patient-photo:get')).data);
}

async function checkScreen(){
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true,...(process.env.PHOTO_TEST_BROWSER_CHANNEL?{channel:process.env.PHOTO_TEST_BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>route.abort());
  const styles=Array.from(ficha.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g),m=>m[0]).join('');
  const editor=ficha.match(/<div id="patientPhotoEditor"[^\n]+/)[0].replace('class="patient-photo-editor"','class="patient-photo-editor on"');
  await page.setContent('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'<body><div class="avatar">PS</div>'+editor+'</body></html>');
  await page.evaluate(()=>{
   window.currentAtlasPatient={remoteId:'p1',code:'9999',name:'Paciente Sintético'};
   window.patientRecord={};window.writePatientRecord=()=>{};window.syntheticPhoto='';window.fail=false;window.requests=[];
   window.addEventListener('message',event=>{const m=event.data;if(m.type!=='atlas:central-db-request')return;requests.push(m);if(!fail){if(m.action==='patient-photo:save')syntheticPhoto=m.payload.data;if(m.action==='patient-photo:delete')syntheticPhoto=''}window.postMessage({type:'atlas:central-db-response',requestId:m.requestId,ok:!fail,data:m.action==='patient-photo:get'?(syntheticPhoto?{storage_path_url:syntheticPhoto}:null):{},error:fail?'Fallo sintético':null},'*')});
  });
  await page.addScriptTag({content:script(ficha,'atlas-v136-camera-save-confirmation')});
  await page.addScriptTag({content:script(ficha,'atlas-v136-patient-photo-file-server-save')});
  await page.evaluate(()=>{const input=document.getElementById('patientPhotoFile');input.insertAdjacentHTML('beforebegin','<button class="btn primary" type="button">📷 Hacer foto</button> <button class="btn" type="button">🖼 Elegir archivo</button>')});
  const file=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=420;const x=c.getContext('2d');x.fillStyle='#08b';x.fillRect(0,0,420,420);return Array.from(Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0)))}));
  const upload=async()=>{await page.locator('#patientPhotoFile').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:file});await page.click('#patientPhotoSave');await page.waitForFunction(()=>!document.getElementById('patientPhotoSave').disabled)};
  await upload();assert((await page.locator('#atlasPatientPhotoFileStatus').textContent()).includes('confirmada'));
  await upload();assert.equal(await page.evaluate(()=>requests.filter(r=>r.action==='patient-photo:save').length),2);
  await page.screenshot({path:'/private/tmp/murcia-photo-saved-desktop.png'});
  await page.evaluate(()=>window.fail=true);await page.click('#patientPhotoDelete');await page.waitForFunction(()=>!document.getElementById('patientPhotoDelete').disabled);
  assert((await page.locator('#atlasPatientPhotoFileStatus').textContent()).includes('No se ha podido eliminar'));assert(await page.evaluate(()=>!!patientRecord.photo));
  await page.evaluate(()=>window.fail=false);await page.click('#patientPhotoDelete');await page.waitForFunction(()=>!document.getElementById('patientPhotoDelete').disabled);
  assert.equal(await page.evaluate(()=>patientRecord.photo),'');assert.equal(await page.locator('.avatar').textContent(),'PS');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/murcia-photo-deleted-mobile.png'});
  assert(await page.locator('#patientPhotoSave').isVisible());assert(await page.locator('#patientPhotoDelete').isVisible());
  await page.evaluate(()=>window.postMessage({type:'atlas:load-patient',patient:currentAtlasPatient},'*'));await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>patientRecord.photo),'');
  await page.evaluate(()=>window.fail=true);await upload();assert((await page.locator('#atlasPatientPhotoFileStatus').textContent()).includes('No se ha podido guardar'));
  await page.evaluate(()=>window.fail=false);await upload();assert(await page.evaluate(()=>!!patientRecord.photo));
  // Deleted photos must be propagated as an empty string, including the agenda thumbnail.
  const thumbnail=script(agenda,'atlas-v136-patient-photo-thumbnails');
  await page.evaluate(()=>{window.patientMaster=[currentAtlasPatient];window.renderPatientsTable=()=>{window.thumbnailRendered=true}});
  await page.addScriptTag({content:thumbnail});await page.evaluate(()=>window.postMessage({type:'atlas:patient-photo-updated',patientId:'p1',data:''},'*'));await page.waitForFunction(()=>window.thumbnailRendered);assert.equal(await page.evaluate(()=>patientMaster[0].photo),'');
 }finally{await browser.close()}
}
(async()=>{await checkBridge();await checkScreen();console.log('Fotos: subir, reemplazar, eliminar, recargar, reintentar y miniaturas OK (solo datos sintéticos).')})().catch(error=>{console.error(error);process.exitCode=1});
