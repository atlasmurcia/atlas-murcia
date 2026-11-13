// Run with ATLAS_PLAYWRIGHT_PATH pointing to the installed Playwright package.
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_PATH||'playwright');
const agenda=fs.readFileSync('modules/agenda.html','utf8'),ficha=fs.readFileSync('modules/ficha.html','utf8');
const agendaStyle=agenda.match(/<style[^>]*>([\s\S]*?)<\/style>/)[0]+agenda.match(/<style id="atlas-internal-tasks-main-style">[\s\S]*?<\/style>/)[0];
const taskMarkup=agenda.slice(agenda.indexOf('<section id="atlasTasksBack"'),agenda.indexOf('</script>',agenda.indexOf('<script id="atlas-internal-tasks-main-runtime">'))+9);
const fichaStyle=ficha.match(/<style[^>]*>[\s\S]*?<\/style>/)[0]+ficha.match(/<style>\.patient-tasks-heading[\s\S]*?<\/style>/)[0];
const mock=`const patientMaster=[{remoteId:'synthetic-a',code:'9991',name:'Paciente Ámbar',phone:'000000001'},{remoteId:'synthetic-b',code:'9992',name:'Paciente Azul',phone:'000000002'}];let fixtureTasks=[];window.atlasCentralRequest=async(action,p={})=>{if(action==='communications:pendingTasks')return [];if(action==='internalTasks:list')return fixtureTasks;if(action==='internalTasks:create'){const master=patientMaster.find(x=>x.remoteId===p.patientId);fixtureTasks.push({id:'synthetic-task',title:p.title,notes:p.notes,area:p.area,task_type:p.taskType,status:'pending',patient_id:p.patientId,due_at:p.dueAt,patient:{first_name:master?.name,patient_number:master?.code}});return fixtureTasks.at(-1)}if(action==='internalTasks:update'){Object.assign(fixtureTasks[0],p.changes,{patient_id:p.changes.patientId});return fixtureTasks[0]}throw Error('Unexpected fixture action '+action)};`;
const shell=`<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe id="agendaFrame" src="/agenda-fixture"></iframe><iframe id="fichaFrame" src="/ficha-fixture" hidden></iframe><script>const a=document.getElementById('agendaFrame'),f=document.getElementById('fichaFrame');window.addEventListener('message',e=>{const m=e.data||{};if(m.type==='atlas:patient-selected'){a.hidden=true;f.hidden=false;f.contentWindow.postMessage({type:'atlas:load-patient',patient:m.patient,returnToTasks:m.returnToTasks},'*')}if(m.type==='atlas:show-patient'){f.hidden=true;a.hidden=false}if(m.type==='atlas:central-db-request'){const rows=m.action==='internalTasks:list'?[{patient_id:m.payload.patientId,title:'Revisar documentación de prueba',notes:'Ejemplo ficticio para comprobar la ficha',status:'pending',area:'recepcion'},{patient_id:m.payload.patientId,title:'Gestión de prueba completada',status:'completed',area:'recepcion'}]:[];e.source.postMessage({type:'atlas:central-db-response',requestId:m.requestId,ok:true,data:rows},'*')}});</script>`;
const pages={
 '/':shell,
 '/agenda-fixture':'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+agendaStyle+'<body><aside><div class="nav active">Agenda</div></aside><script>'+mock+'</script>'+taskMarkup+'<script>window.dispatchEvent(new MessageEvent("message",{data:{type:"atlas:central-ready",profileName:"Equipo de prueba",userId:"synthetic-user"}}));</script></body></html>',
 '/ficha-fixture':'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+fichaStyle+'<body><header><button class="btn" id="backToAgendaBtn" onclick="parent.postMessage({type:\'atlas:show-patient\'},\'*\')">← Volver a tareas</button></header><main><nav class="tabs"><button class="tab active" data-t="tareasPaciente">Tareas del paciente</button></nav><section id="tareasPaciente" class="panel active"></section></main><script src="/modules/ficha-patient-tasks.js"></script><script>window.addEventListener("message",e=>{const m=e.data||{};if(m.type!=="atlas:central-db-request")return;const rows=m.action==="internalTasks:list"?[{patient_id:m.payload.patientId,title:"Revisar documentación de prueba",notes:"Ejemplo ficticio para comprobar la ficha",status:"pending",area:"recepcion"},{patient_id:m.payload.patientId,title:"Gestión de prueba completada",status:"completed",area:"recepcion"}]:[];window.dispatchEvent(new MessageEvent("message",{data:{type:"atlas:central-db-response",requestId:m.requestId,ok:true,data:rows}}))});window.dispatchEvent(new MessageEvent("message",{data:{type:"atlas:central-ready"}}));</script></body></html>'
};
(async()=>{
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const body=pathname==='/modules/ficha-patient-tasks.js'?fs.readFileSync('modules/ficha-patient-tasks.js','utf8'):pages[pathname];res.writeHead(body?200:404,{'Content-Type':pathname.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});res.end(body||'Not found')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.ATLAS_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/');const a=page.frameLocator('#agendaFrame'),f=page.frameLocator('#fichaFrame');
  await a.locator('#atlasInternalTasksNav').click();await a.locator('#atlasTasksNew').click();
  await a.locator('#atlasTaskTitle').fill('Revisar documentación de prueba');await a.locator('#atlasTaskDue').fill(new Date().toISOString().slice(0,16));await a.locator('#atlasTaskPatientSearch').fill('ambar');
  await a.locator('#atlasTaskPatient').selectOption('synthetic-a');await a.locator('#atlasTaskPatientSearch').fill('Azul');
  assert.equal(await a.locator('#atlasTaskPatient').inputValue(),'synthetic-a');
  await page.screenshot({path:'/private/tmp/murcia-task-patient-search.png',fullPage:true});
  await a.locator('#atlasTaskSave').click();await a.locator('[data-linked-task-open]').waitFor();
  await page.screenshot({path:'/private/tmp/murcia-task-patient-card.png',fullPage:true});
  await a.getByRole('button',{name:'Ver ficha del paciente',exact:true}).click();
  await f.getByText('Paciente Ámbar · 1 pendiente(s)',{exact:true}).waitFor();await f.getByText('Completada',{exact:true}).waitFor();assert.equal(page.context().pages().length,1);
  await page.screenshot({path:'/private/tmp/murcia-patient-tasks-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/murcia-patient-tasks-mobile.png',fullPage:true});
  await f.locator('#backToAgendaBtn').click();await a.locator('#atlasTasksList').waitFor({state:'visible'});
  await a.locator('[data-task-edit]').click();assert.equal(await a.locator('#atlasTaskPatient').inputValue(),'synthetic-a');
  await a.locator('#atlasTaskPatient').selectOption('');await a.locator('#atlasTaskSave').click();await a.locator('#atlasTaskFormBack').waitFor({state:'hidden'});assert.equal(await a.locator('[data-linked-task-open]').count(),0);
  assert.deepEqual(errors,[]);console.log('Revisión visual correcta: buscar, crear y editar vínculo, abrir ficha y volver; escritorio y móvil. Solo datos sintéticos y conexiones locales.');
 }finally{if(browser)await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
