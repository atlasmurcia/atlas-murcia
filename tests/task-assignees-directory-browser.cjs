const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_PATH||'playwright');
const shell=fs.readFileSync('atlas.html','utf8'),agenda=fs.readFileSync('modules/agenda.html','utf8');
const helpers=shell.slice(shell.indexOf(' async function clinicTaskDirectory('),shell.indexOf(' async function addActorNames('));
const styles=agenda.match(/<style[^>]*>[\s\S]*?<\/style>/)[0]+agenda.match(/<style id="atlas-internal-tasks-main-style">[\s\S]*?<\/style>/)[0];
const markup=agenda.slice(agenda.indexOf('<section id="atlasTasksBack"'),agenda.indexOf('</script>',agenda.indexOf('<script id="atlas-internal-tasks-main-runtime">'))+9);
const mock=`const context={organizationId:'synthetic-org',clinicId:'synthetic-murcia'},patientMaster=[],rows=[{user_id:'synthetic-fisio',full_name:'Fisio de prueba',role:'Fisioterapeuta'},{user_id:'synthetic-manager',full_name:'Gestión de prueba',role:'Gestión'},{user_id:'synthetic-reception',full_name:'Recepción de prueba',role:'Recepción'},{user_id:'synthetic-auxiliary',full_name:'Auxiliar de prueba',role:'Auxiliar'}];
window.fixtureRpcCalls=[];window.fixtureTasks=[];
const db={from(){throw Error('La lectura directa de perfiles ajenos no está disponible')},async rpc(name,args){window.fixtureRpcCalls.push({name,args});return {data:rows,error:null}}};
${helpers}
window.atlasInternalChatRequestV136=async()=>null;
window.atlasCentralRequest=async(action,p={})=>{if(action==='internalTasks:assignees')return (await clinicTaskDirectory()).data.filter(p=>p.area);if(action==='communications:pendingTasks')return [];if(action==='internalTasks:list')return window.fixtureTasks;if(action==='internalTasks:create'||action==='internalTasks:update'){const input=action==='internalTasks:create'?p:p.changes,assigned=await validateClinicTaskAssignee(input.assignedTo);if(assigned.error)throw assigned.error;const task={id:'synthetic-task',status:'pending',title:input.title,area:input.area,task_type:input.taskType,due_at:input.dueAt||new Date().toISOString(),assigned_to:assigned.data,assigned_name:assigned.name,assigned_display_name:assigned.name};window.fixtureTasks=[task];return task}throw Error('Acción de prueba inesperada '+action)};`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ATLAS_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1150,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html lang="es"><meta charset="utf-8">'+styles+'<body><aside><div class="nav active">Agenda</div></aside><script>'+mock+'</script>'+markup+'</body></html>');
  await page.locator('#atlasInternalTasksNav').click();await page.locator('[data-task-area="fisio"]').click();await page.locator('#atlasTasksNew').click();
  const names=await page.locator('#atlasTaskAssigned option').allTextContents();assert.deepEqual(names,['Sin asignar','Fisio de prueba','Gestión de prueba']);
  await page.locator('#atlasTaskAssigned').selectOption('synthetic-fisio');await page.locator('#atlasTaskTitle').fill('Revisar material de prueba');
  await page.screenshot({path:process.env.ATLAS_TASK_SCREENSHOT||'/private/tmp/murcia-task-assignees-desktop.png'});
  await page.locator('#atlasTaskSave').click();await page.locator('#atlasTaskFormBack').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.fixtureTasks[0].assigned_to),'synthetic-fisio');assert.equal(await page.evaluate(()=>window.fixtureTasks[0].assigned_name),'Fisio de prueba');
  await page.locator('[data-task-edit]').click();assert.equal(await page.locator('#atlasTaskAssigned').inputValue(),'synthetic-fisio');
  await page.locator('#atlasTaskArea').selectOption('recepcion');await page.locator('#atlasTaskAssigned').selectOption('synthetic-reception');
  const receptionNames=await page.locator('#atlasTaskAssigned option').allTextContents();assert(receptionNames.includes('Recepción de prueba')&&receptionNames.includes('Gestión de prueba'));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#atlasTaskAssigned').isVisible(),true);
  await page.screenshot({path:'/private/tmp/murcia-task-assignees-mobile.png'});
  await page.locator('#atlasTaskArea').selectOption('auxiliar');await page.locator('#atlasTaskAssigned').selectOption('synthetic-auxiliary');
  await page.locator('#atlasTaskAssigned').selectOption('');await page.locator('#atlasTaskSave').click();await page.locator('#atlasTaskFormBack').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.fixtureTasks[0].assigned_to),null);
  assert.deepEqual(errors,[]);assert((await page.evaluate(()=>window.fixtureRpcCalls)).every(call=>call.name==='atlas_chat_directory'&&call.args.p_clinic_id==='synthetic-murcia'));
  console.log('PASS Chrome: directorio real con respuestas ficticias, fisio y Gestión visibles, guardar/editar/desasignar y áreas correctas; escritorio y móvil; red bloqueada.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
