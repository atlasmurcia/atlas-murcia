const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_PATH||'playwright');

const ficha=fs.readFileSync('modules/ficha.html','utf8');
const style=ficha.match(/<style>([\s\S]*?)<\/style>/)?.[0];
function extract(start,end){const from=ficha.indexOf(start),to=ficha.indexOf(end,from);assert(from>=0&&to>from,'No se encontró el bloque '+start);return ficha.slice(from,to).trim()}
const editor=extract('function ensureEvolutionEditor(){','function openEvolutionEditor(');
const open=extract('function openEvolutionEditor(','async function saveEvolutionRevision(){');
const save=extract('async function saveEvolutionRevision(){','window.renderClinicalEvolutions=');
assert(style&&editor&&open&&save,'Falta código del editor clínico');

const fixture=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}<style>body{padding:24px;background:#f4f7f9}main{max-width:900px;margin:auto}.event{background:#fff;padding:16px}</style><body><main><h1>Ficha de prueba · datos ficticios</h1><div id="clinicalEvolutionTimeline"></div><button id="openEditor">Abrir editor</button><select id="evolutionProfessional"><option>Profesional de prueba</option></select></main><script>
window.fixture={patientRecord:{evolutions:[]},syncCalls:[],notices:[],writes:0};
var patientRecord=window.fixture.patientRecord;
var editableEvolutionRows=[];
var original={id:42,centralId:'synthetic-central-original',centralRef:'synthetic-original',text:'Evolución de prueba',type:'Evolución fisioterapia',professional:'Profesional de prueba',createdAt:'2026-11-17T10:00:00.000Z'};
patientRecord.evolutions.push(original);editableEvolutionRows=[original];
var clone=value=>JSON.parse(JSON.stringify(value));
var escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
var evolutionVersion=record=>Number(record.revisionNumber||0);
var notifyClinical=message=>window.fixture.notices.push(message);
var writePatientRecord=()=>window.fixture.writes++;
var renderClinicalEvolutions=()=>{};
var syncClinical=async items=>{window.fixture.syncCalls.push(items.map(item=>({type:item.type,record:clone(item.record)})));return true};
${editor}
${open}
${save}
document.getElementById('openEditor').onclick=()=>openEvolutionEditor('synthetic-original');
</script></body></html>`;

(async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fixture)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.ATLAS_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#openEditor').click();
  const modal=page.locator('#clinicalEvolutionEditBack');
  await modal.waitFor({state:'visible',timeout:2500});
  assert.match(await modal.locator('label').filter({hasText:'Motivo de la modificación'}).textContent(),/opcional/i);
  await page.screenshot({path:'/private/tmp/atlas-evolution-edit-optional-reason.png',fullPage:true});
  await modal.locator('#clinicalEvolutionEditText').fill('Evolución corregida: valoración con tilde.');
  await modal.locator('#clinicalEvolutionEditSave').click();
  await modal.waitFor({state:'hidden'});
  let result=await page.evaluate(()=>({records:window.fixture.patientRecord.evolutions,calls:window.fixture.syncCalls,writes:window.fixture.writes}));
  assert.equal(result.records.length,2,'Debe conservarse la original y añadirse una revisión');
  assert.equal(result.records[0].centralId,'synthetic-central-original');
  assert.equal(result.records[1].revisionReason,'','Debe aceptar el motivo vacío');
  assert.equal(result.records[1].revisionOfRef,'synthetic-original');
  assert.equal(result.records[1].revisionRootRef,'synthetic-original');
  assert.equal(result.records[1].revisionNumber,1);
  assert.equal(result.records[1].editedBy,'Profesional de prueba');
  assert.equal(result.calls.length,1);

  await page.reload();await page.locator('#openEditor').click();
  await page.locator('#clinicalEvolutionEditText').fill('Evolución corregida con motivo.');
  await page.locator('#clinicalEvolutionEditReason').fill('Corrección ortográfica');
  await page.locator('#clinicalEvolutionEditSave').click();
  await page.locator('#clinicalEvolutionEditBack').waitFor({state:'hidden'});
  result=await page.evaluate(()=>window.fixture.patientRecord.evolutions.at(-1));
  assert.equal(result.revisionReason,'Corrección ortográfica','Debe conservar el motivo cuando se proporciona');

  await page.reload();await page.locator('#openEditor').click();
  await page.locator('#clinicalEvolutionEditText').fill('');
  await page.locator('#clinicalEvolutionEditSave').click();
  assert.equal(await page.locator('#clinicalEvolutionEditStatus').textContent(),'Escribe la evolución clínica.','La evolución sigue siendo obligatoria');
  result=await page.evaluate(()=>window.fixture.patientRecord.evolutions.length);
  assert.equal(result,1,'No debe crear revisión si el texto está vacío');
  assert.deepEqual(errors,[]);
  console.log('Evoluciones clínicas: guarda con motivo vacío o escrito, conserva versiones y trazabilidad, exige el texto y muestra el editor con datos sintéticos.');
 }finally{if(browser)await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
