const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd();
const baseline=require('node:child_process').execFileSync(process.env.GIT_BIN||'git',['show','HEAD:modules/agenda.html'],{cwd:root,maxBuffer:8*1024*1024});
const services=[{id:500043,name:'MASAJE CL AFILIADOS',category:'FISIOTERAPIA',reference:'MASAJE CL AFILIADOS',price:0,duration:45,online:false,active:true},{id:'synthetic-physio',name:'Fisioterapia',category:'FISIOTERAPIA',price:0,duration:30,online:false,active:true},{id:'synthetic-inactive',name:'Servicio inactivo sintético',price:0,duration:15,active:false}];
const fixture=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Agenda · comprobación sintética</title><style>body{margin:0;font:14px Arial}header{padding:12px;background:#e7f5fa}iframe{width:100%;height:calc(100vh - 42px);border:0}</style><header>Prueba aislada · datos sintéticos · sin acceso al servidor clínico</header><iframe id="agenda" src="/modules/agenda.html"></iframe><script>
const frame=document.getElementById('agenda');window.requests=[];
const sales={categories:['FISIOTERAPIA'],services:${JSON.stringify(services)},products:[],stockMovements:[]};
frame.onload=()=>frame.contentWindow.postMessage({type:'atlas:central-ready',organizationId:'synthetic-org',clinicId:'synthetic-clinic',userId:'synthetic-user'},'*');
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='atlas:central-db-request')return;const message=event.data;requests.push(message.action);let data=[];if(message.action==='settings:list')data=[{section:'sales',payload:sales}];event.source.postMessage({type:'atlas:central-db-response',requestId:message.requestId,ok:true,data},'*')});
</script></html>`;
(async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),pathname=url.pathname;if(pathname==='/fixture'||pathname==='/fixture-baseline'){res.setHeader('Content-Type','text/html');return res.end(pathname==='/fixture-baseline'?fixture.replace('src="/modules/agenda.html"','src="/modules/agenda.html?baseline=1"'):fixture)}if(pathname==='/modules/agenda.html'&&url.searchParams.has('baseline')){res.setHeader('Content-Type','text/html');return res.end(baseline)}const filename=path.resolve(root,'.'+pathname);if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',pathname.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(filename))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const baselinePage=await browser.newPage(),baselineErrors=[];
  baselinePage.on('pageerror',error=>baselineErrors.push(error.message));
  await baselinePage.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await baselinePage.goto('http://127.0.0.1:'+server.address().port+'/fixture-baseline');
  await baselinePage.frameLocator('#agenda').locator('#cfgSaved').filter({hasText:'Configuración central sincronizada'}).waitFor({state:'attached',timeout:20000});
  await baselinePage.close();
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  const frame=page.frameLocator('#agenda');
  await frame.locator('#mServicesOptions input[value="MASAJE CL AFILIADOS"]').waitFor({state:'attached',timeout:20000});
  await frame.locator('#cfgSaved').filter({hasText:'Configuración central sincronizada'}).waitFor({state:'attached',timeout:20000});
  const runtime=page.frames().find(frame=>frame.url().includes('/modules/agenda.html'));
  await runtime.evaluate(()=>openModal());
  await frame.locator('#mServices summary').click();
  await frame.locator('#mServicesOptions input[value="MASAJE CL AFILIADOS"]').check();
  assert.equal(await frame.locator('#mDuration').inputValue(),'45');
  assert.equal(await frame.locator('#mTherapy').inputValue(),'MASAJE CL AFILIADOS');
  assert.equal(await frame.locator('#mServicesOptions input[value="Servicio inactivo sintético"]').count(),0);
  await runtime.evaluate(()=>renderServiceChecks());
  assert.equal(await frame.locator('#mServicesOptions input[value="MASAJE CL AFILIADOS"]').isChecked(),true);
  assert.equal(await frame.locator('#mTherapy').inputValue(),'MASAJE CL AFILIADOS');
  await page.screenshot({path:'/private/tmp/'+path.basename(root)+'-service-selector.png',fullPage:true});
  assert.deepEqual(errors,baselineErrors,'No new browser runtime errors');
  assert.equal((await page.evaluate(()=>requests)).some(action=>action.startsWith('appointments:save')),false);
  console.log('Pantalla sintética: servicio seleccionable, 45 minutos, Online desactivado, selección conservada y servicio inactivo excluido. Sin errores nuevos de JavaScript.');
  if(baselineErrors.length)console.log('Avisos preexistentes, también reproducidos antes del cambio:',JSON.stringify(baselineErrors));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
