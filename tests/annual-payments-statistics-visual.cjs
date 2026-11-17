const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd();
const rows=[
 {id:'pay-2026-jan',paid_at:'2026-01-15T10:00:00Z',patient:'Paciente sintético A',amount:100,method:'card',metadata:{services:['Servicio sintético'],payment_method_label:'Tarjeta'}},
 {id:'pay-2026-mar',paid_at:'2026-03-10T10:00:00Z',patient:'Paciente sintético B',amount:50,method:'cash',metadata:{services:['Servicio sintético'],payment_method_label:'Metálico'}},
 {id:'rect-2026-mar',record_type:'invoice_rectification',payment_id:'pay-2026-mar',paid_at:'2026-03-11',issue_date:'2026-03-11',patient:'Paciente sintético B',amount:20,method:'cash',service:'Factura rectificativa sintética',metadata:{}},
 {id:'pay-2025-feb',paid_at:'2025-02-15T10:00:00Z',patient:'Paciente sintético C',amount:80,method:'transfer',metadata:{services:['Servicio sintético'],payment_method_label:'Transferencia'}},
 {id:'pay-2025-dec',paid_at:'2025-12-20T10:00:00Z',patient:'Paciente sintético D',amount:120,method:'card',metadata:{services:['Servicio sintético'],payment_method_label:'Tarjeta'}},
 {id:'pay-2024-jun',paid_at:'2024-06-10T10:00:00Z',patient:'Paciente sintético E',amount:70,method:'cash',metadata:{services:['Servicio sintético'],payment_method_label:'Metálico'}}
];
const fixture=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Cobros anuales · prueba sintética</title><style>body{margin:0;font:14px Arial}header{padding:10px;background:#e7f5fa}iframe{width:100%;height:calc(100vh - 40px);border:0}</style><header>Prueba aislada · cobros ficticios · sin acceso a datos clínicos</header><iframe id="agenda" src="/modules/agenda.html"></iframe><script>
const frame=document.getElementById('agenda');window.requests=[];const rows=${JSON.stringify(rows)};
frame.onload=()=>frame.contentWindow.postMessage({type:'atlas:central-ready',organizationId:'synthetic-org',clinicId:'synthetic-clinic',userId:'synthetic-user',managementAccess:true},'*');
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='atlas:central-db-request')return;const message=event.data;requests.push({action:message.action,payload:message.payload});let data=[];if(message.action==='settings:list')data=[{section:'sales',payload:{categories:['SERVICIOS'],services:[{id:'service',name:'Servicio sintético',category:'SERVICIOS',price:50,active:true}],products:[],stockMovements:[]}}];else if(message.action==='sales:report')data=rows.filter(row=>String(row.paid_at||row.issue_date).slice(0,10)>=message.payload.from&&String(row.paid_at||row.issue_date).slice(0,10)<=message.payload.to);else if(message.action==='statistics:servicesPerformed')data={services:message.payload.from.startsWith('2025')?9:message.payload.from.startsWith('2024')?4:12,appointments:0};event.source.postMessage({type:'atlas:central-db-response',requestId:message.requestId,ok:true,data},'*')});
</script></html>`;
(async()=>{
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/fixture'){res.setHeader('Content-Type','text/html');return res.end(fixture)}const filename=path.resolve(root,'.'+pathname);if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',pathname.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(filename))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');const frame=page.frameLocator('#agenda'),runtime=page.frames().find(item=>item.url().includes('/modules/agenda.html'));
  await frame.locator('#statsNav').waitFor({state:'attached'});await runtime.evaluate(()=>{document.getElementById('statsNav').click();openStatisticsReport('Ventas','General','💶')});
  await frame.locator('#salesStatsBody').getByText('Datos verificados directamente').waitFor({timeout:20000});
  assert.equal(await frame.locator('#statsStart').inputValue(),'2026-01-01');assert.match(await frame.locator('#statsEnd').inputValue(),/^2026-/);
  assert.match(await frame.locator('#salesStatsBody').textContent(),/Cobros confirmados\s*2/);assert.match(await frame.locator('#salesStatsBody').textContent(),/130,00\s*€/);
  const initialRequests=(await page.evaluate(()=>requests)).filter(item=>item.action==='sales:report').length;await frame.getByRole('button',{name:/Buscar/}).click();await page.waitForFunction(count=>requests.filter(item=>item.action==='sales:report').length>count,initialRequests);await page.waitForFunction(()=>{const text=document.querySelector('iframe').contentDocument.querySelector('#salesStatsBody')?.textContent||'';return /130,00\s*€/.test(text)&&!text.includes('Comprobando todos los cobros')});assert.equal(await frame.locator('#statisticsTitle').textContent(),'💶 General');
  await frame.getByRole('button',{name:'Año anterior'}).click();await frame.locator('#statsStart').waitFor();await page.waitForFunction(()=>{const doc=document.querySelector('iframe').contentDocument,text=doc.querySelector('#salesStatsBody')?.textContent||'';return doc.querySelector('#statsStart')?.value==='2025-01-01'&&/200,00\s*€/.test(text)});
  assert.equal(await frame.locator('#statsEnd').inputValue(),'2025-12-31');assert.match(await frame.locator('#salesStatsBody').textContent(),/Cobros confirmados\s*2/);assert.match(await frame.locator('#salesStatsBody').textContent(),/200,00\s*€/);
  await runtime.evaluate(()=>render());assert.equal(await frame.locator('#statsBack').evaluate(element=>element.classList.contains('open')),true);assert.equal(await frame.locator('#statisticsTitle').textContent(),'💶 General');assert.equal(await frame.locator('#statsStart').inputValue(),'2025-01-01');
  await frame.getByRole('button',{name:'Año anterior'}).click();await page.waitForFunction(()=>{const doc=document.querySelector('iframe').contentDocument,text=doc.querySelector('#salesStatsBody')?.textContent||'';return doc.querySelector('#statsStart')?.value==='2024-01-01'&&/70,00\s*€/.test(text)&&/Servicios realizados\s*4/.test(text)});assert.equal(await frame.locator('#statsEnd').inputValue(),'2024-12-31');assert.match(await frame.locator('#salesStatsBody').textContent(),/70,00\s*€/);
  await page.screenshot({path:'/private/tmp/atlas-murcia-cobros-anuales-synthetic.png',fullPage:true});
  assert.deepEqual(errors,[]);const salesRequests=(await page.evaluate(()=>requests)).filter(item=>item.action==='sales:report');assert(salesRequests.some(item=>item.payload.from==='2025-01-01'&&item.payload.to==='2025-12-31'));assert(salesRequests.some(item=>item.payload.from==='2024-01-01'&&item.payload.to==='2024-12-31'));
  console.log('Pantalla sintética: cobros completos de 2026, 2025 y 2024; año natural, rectificación neta e informe conservado tras actualizar Agenda.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
