const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const {chromium}=require(process.env.ATLAS_PLAYWRIGHT_PATH||'playwright');

const atlas=fs.readFileSync('atlas.html','utf8');
const style=atlas.match(/<style id="atlas-v136-internal-chat-style">([\s\S]*?)<\/style>/)?.[0];
const markup=atlas.slice(atlas.indexOf('<button id="atlasInternalChatLauncher"'),atlas.indexOf('<script id="atlas-v136-internal-chat">'));
const script=atlas.match(/<script id="atlas-v136-internal-chat">([\s\S]*?)<\/script>/)?.[1];
assert(style&&markup&&script,'No se encontró el chat interno');

const shell=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px Arial;background:#f4f7f9;margin:0;min-height:100vh}</style>${style}${markup}<script>
const fixtureRows=[
 {id:'synthetic-old',client_ref:'synthetic-old',organization_id:'synthetic-org',clinic_id:'synthetic-clinic',sender_user_id:'synthetic-sender',recipient_user_id:'synthetic-recipient',sender_name:'Equipo de prueba',recipient_name:'Recepción de prueba',body:'Mensaje anterior de prueba',created_at:new Date(Date.now()-60000).toISOString(),read_at:new Date(Date.now()-30000).toISOString(),deleted_at:null,deleted_by_user_id:null,deleted_by_name:null},
 {id:'synthetic-latest',client_ref:'synthetic-latest',organization_id:'synthetic-org',clinic_id:'synthetic-clinic',sender_user_id:'synthetic-sender',recipient_user_id:'synthetic-recipient',sender_name:'Equipo de prueba',recipient_name:'Recepción de prueba',body:'Último mensaje de prueba',created_at:new Date().toISOString(),read_at:new Date().toISOString(),deleted_at:null,deleted_by_user_id:null,deleted_by_name:null}
];
const directory=[{user_id:'synthetic-sender',full_name:'Equipo de prueba',role:'Gestión'},{user_id:'synthetic-recipient',full_name:'Recepción de prueba',role:'Recepción'}];
window.fixtureReadRpcCompleted=false;
window.ATLAS_CENTRAL_CONTEXT={userId:'synthetic-recipient',profileName:'Recepción de prueba',role:'recepcion',managementAccess:false,organizationId:'synthetic-org',clinicId:'synthetic-clinic'};
const builder={select(){return this},eq(){return this},gte(){return this},order(){return this},then(resolve,reject){return Promise.resolve({data:fixtureRows.slice(),error:null}).then(resolve,reject)}};
window.ATLAS_CENTRAL_DB={auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-recipient'}}},error:null})},from(){return builder},rpc:async(name,args)=>{
 if(name==='atlas_chat_directory')return {data:directory,error:null};
 if(name==='atlas_chat_mark_unread'){
  const row=fixtureRows.filter(item=>item.organization_id===args.p_organization_id&&item.clinic_id===args.p_clinic_id&&item.sender_user_id===args.p_sender_user_id&&item.recipient_user_id==='synthetic-recipient'&&!item.deleted_at).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)).at(-1);
  if(row?.read_at){row.read_at=null;return {data:[{...row}],error:null}}
  return {data:[],error:null};
 }
 if(name==='atlas_chat_mark_read'){
  await new Promise(resolve=>setTimeout(resolve,350));
  const updated=fixtureRows.filter(item=>item.organization_id===args.p_organization_id&&item.clinic_id===args.p_clinic_id&&item.sender_user_id===args.p_sender_user_id&&item.recipient_user_id==='synthetic-recipient'&&!item.read_at&&!item.deleted_at);
  updated.forEach(item=>item.read_at=new Date().toISOString());window.fixtureReadRpcCompleted=true;
  return {data:updated.map(item=>({...item})),error:null};
 }
 return {data:[],error:null};
}};
const nativeInterval=window.setInterval.bind(window);window.setInterval=(fn,ms)=>nativeInterval(fn,ms===15000?100:ms);
window.AudioContext=undefined;window.webkitAudioContext=undefined;
</script><script>${script}</script>`;

(async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(shell)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.ATLAS_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#atlasInternalChatLauncher').waitFor({state:'visible'});
  await page.locator('#atlasInternalChatLauncher').click();
  const sender=page.getByRole('button',{name:/Abrir conversación con Equipo de prueba/});
  await sender.waitFor({state:'visible'});
  if(await page.locator('#atlasInternalChatMarkUnread').isHidden())await sender.click();
  await page.locator('#atlasInternalChatMarkUnread').waitFor({state:'visible'});
  assert.equal(await page.locator('#atlasInternalChatBadge').textContent(),'0');
  await page.locator('#atlasInternalChatMarkUnread').click();
  await page.getByText('Conversación marcada como no leída',{exact:true}).waitFor();
  await page.getByText('● Chat pendiente de abrir',{exact:true}).waitFor();
  assert.equal(await page.locator('#atlasInternalChatBadge').textContent(),'1');
  assert.equal(await page.evaluate(()=>fixtureRows.find(row=>row.id==='synthetic-latest').read_at),null);
  assert.notEqual(await page.evaluate(()=>fixtureRows.find(row=>row.id==='synthetic-old').read_at),null,'Solo el último mensaje debe volver a quedar sin leer');
  await page.screenshot({path:'/private/tmp/atlas-chat-unread-list.png',fullPage:true});
  await page.getByRole('button',{name:'Equipo de prueba · 1 pendiente de abrir'}).click();
  await page.waitForFunction(()=>document.getElementById('atlasInternalChatBadge').textContent==='0',null,{timeout:250});
  assert.equal(await page.locator('.atlas-chat-user-pending').count(),0,'El aviso desaparece localmente al abrir la conversación');
  assert.equal(await page.evaluate(()=>window.fixtureReadRpcCompleted),false,'El contador debe quitarse antes de que responda el servidor');
  await page.screenshot({path:'/private/tmp/atlas-chat-unread-cleared.png',fullPage:true});
  await page.waitForFunction(()=>window.fixtureReadRpcCompleted,null,{timeout:1500});
  assert.notEqual(await page.evaluate(()=>fixtureRows.find(row=>row.id==='synthetic-latest').read_at),null,'El servidor debe confirmar la lectura');
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('#atlasInternalChatPanel').evaluate(el=>getComputedStyle(el).display==='grid'));
  assert.equal(await page.locator('#atlasInternalChatMarkUnread').textContent(),'Marcar no leído');
  const unreadButtonBox=await page.locator('#atlasInternalChatMarkUnread').boundingBox(),panelBox=await page.locator('#atlasInternalChatPanel').boundingBox();
  assert(unreadButtonBox.x+unreadButtonBox.width<=panelBox.x+panelBox.width,'El botón no debe quedar recortado en móvil: '+JSON.stringify({unreadButtonBox,panelBox,computed:await page.locator('#atlasInternalChatPerson').evaluate(el=>({width:getComputedStyle(el).width,minWidth:getComputedStyle(el).minWidth,maxWidth:getComputedStyle(el).maxWidth,boxSizing:getComputedStyle(el).boxSizing,parent:{width:el.parentElement.getBoundingClientRect().width,grid:getComputedStyle(el.parentElement).gridTemplateColumns},self:{right:el.getBoundingClientRect().right,css:el.getAttribute('style')},label:getComputedStyle(el.firstElementChild).width,button:getComputedStyle(el.lastElementChild).width,media:matchMedia('(max-width: 640px)').matches}))}));
  await page.screenshot({path:'/private/tmp/atlas-chat-unread-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Chat interno: marcado como no leído, indicador visible, apertura limpia el aviso de inmediato y el servidor confirma la lectura; escritorio y móvil, solo datos sintéticos.');
 }finally{if(browser)await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
