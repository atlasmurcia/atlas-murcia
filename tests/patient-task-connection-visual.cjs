// Full ficha and actual shell routing, with synthetic responses and a delayed task script.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_PATH||'playwright');
const atlas=fs.readFileSync('atlas.html','utf8');
const shellMarkup=atlas.match(/<div class="shell">[\s\S]*?(?=<script>)/)[0];
const shellScript=atlas.match(/<script>\s*(const agendaFrame=[\s\S]*?)<\/script>/)[1];
const readyRouter=atlas.match(/<script id="atlas-visible-module-navigation-v42">[\s\S]*?<\/script>/)[0];
const patient={remoteId:'synthetic-patient',code:'9991',name:'Paciente sintético de prueba',firstName:'Paciente sintético',surname1:'de prueba',active:true};
const mock=`window.ATLAS_CENTRAL_CONTEXT={userId:'synthetic-user',organizationId:'synthetic-org',clinicId:'synthetic-clinic',ownerAccess:true,managementAccess:true,profileName:'Equipo de prueba'};window.fixtureEarlyReady=0;window.fixtureRequests=[];window.atlasCentralSend=()=>{const w=document.getElementById('fichaFrame').contentWindow;if(w){if(!w.fixtureTaskScriptStarted)window.fixtureEarlyReady++;w.postMessage({type:'atlas:central-ready',...window.ATLAS_CENTRAL_CONTEXT},'*')}};window.addEventListener('message',e=>{const m=e.data||{};if(m.type==='atlas:central-db-request'){window.fixtureRequests.push(m.action);const rows=m.action==='internalTasks:list'?[{id:'synthetic-task',patient_id:m.payload.patientId,title:'Revisar documentación de prueba',status:'pending',area:'recepcion'}]:[];e.source.postMessage({type:'atlas:central-db-response',requestId:m.requestId,ok:true,data:rows},'*')}});`;
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f4f7fa;font:14px system-ui}.top{display:flex;gap:8px;padding:10px;flex-wrap:wrap}.module{display:none;width:100%;height:calc(100vh - 80px);border:0}.module.on{display:block}</style>'+shellMarkup+'<script>'+mock+'</script><script>'+shellScript+'</script>'+readyRouter;
(async()=>{
 const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html)}
  if(path==='/modules/ficha.html'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync('modules/ficha.html'))}
  if(path==='/modules/budget-equipment-template.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync('modules/budget-equipment-template.js'))}
  if(path==='/modules/ficha-patient-tasks.js'){
   await new Promise(resolve=>setTimeout(resolve,600));res.setHeader('Content-Type','application/javascript');
   return res.end('window.fixtureTaskScriptStarted=true;\n'+fs.readFileSync(process.env.ATLAS_TASK_SCRIPT_OVERRIDE||'modules/ficha-patient-tasks.js','utf8'));
  }
  if(path.startsWith('/modules/')){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><p>Datos sintéticos de prueba</p>')}
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.ATLAS_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.evaluate(patient=>window.postMessage({type:'atlas:patient-selected',patient,appointments:[],openFicha:true},'*'),patient);
  const ficha=page.frameLocator('#fichaFrame');await ficha.locator('[data-t="tareasPaciente"]').click();
  await ficha.locator('#tareasPaciente').getByText('Revisar documentación de prueba',{exact:true}).waitFor({timeout:8000});
  assert((await page.evaluate(()=>window.fixtureEarlyReady))>0,'The context was sent before the task script loaded');
  assert(!(await ficha.locator('#tareasPaciente').innerText()).includes('Esperando la conexión'));
  await page.screenshot({path:'/private/tmp/murcia-task-connection-full-ficha.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/murcia-task-connection-full-ficha-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Ficha completa y enrutador real: tareas visibles tras perder el aviso inicial; escritorio y móvil. Avisos previos: '+await page.evaluate(()=>window.fixtureEarlyReady));
 }finally{if(browser)await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
