const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const root=process.cwd();
const rows=[
 {id:'synthetic-reserva',paid_at:'2026-01-15T12:00:00Z',patient:'Paciente sintético A',amount:100,method:'card',metadata:{services:['RESERVA'],payment_method_label:'Tarjeta'}},
 {id:'synthetic-traccion',paid_at:'2026-02-15T12:00:00Z',patient:'Paciente sintético B',amount:60,method:'card',metadata:{services:['TRACCION'],payment_method_label:'Tarjeta'}},
 {id:'synthetic-fisio-control',paid_at:'2026-03-15T12:00:00Z',patient:'Paciente sintético C',amount:45,method:'card',metadata:{services:['Fisio Control'],payment_method_label:'Tarjeta'}},
 {id:'synthetic-unmapped',paid_at:'2026-04-15T12:00:00Z',patient:'Paciente sintético D',amount:15,method:'card',metadata:{services:['Concepto sin catálogo'],payment_method_label:'Tarjeta'}}
];
const fixture=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Clasificación sintética de ventas</title><style>body{margin:0;font:14px Arial}header{padding:10px;background:#e7f5fa}iframe{width:100%;height:calc(100vh - 40px);border:0}</style><header>Vista de prueba · datos ficticios</header><iframe id="agenda" src="/modules/agenda.html"></iframe><script>
const frame=document.getElementById('agenda');window.requests=[];const rows=${JSON.stringify(rows)};
frame.onload=()=>frame.contentWindow.postMessage({type:'atlas:central-ready',organizationId:'synthetic-org',clinicId:'synthetic-clinic',userId:'synthetic-user',managementAccess:true},'*');
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.data?.type!=='atlas:central-db-request')return;const message=event.data;requests.push({action:message.action,payload:message.payload});let data=[];if(message.action==='settings:list')data=[{section:'sales',payload:{categories:['VALORACION','FISIOTERAPIA'],services:[{id:'traction',name:'TRACCION',category:'TRACCION',price:60,active:true},{id:'physio',name:'Fisio Control',category:'FISIO CONTROL',price:45,active:true}],products:[],stockMovements:[]}}];else if(message.action==='sales:report')data=rows.filter(row=>String(row.paid_at||row.issue_date).slice(0,10)>=message.payload.from&&String(row.paid_at||row.issue_date).slice(0,10)<=message.payload.to);event.source.postMessage({type:'atlas:central-db-response',requestId:message.requestId,ok:true,data},'*')});
</script></html>`;

(async()=>{
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/fixture'){res.setHeader('Content-Type','text/html');return res.end(fixture)}const filename=path.resolve(root,'.'+pathname);if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)){res.writeHead(404);return res.end()}res.setHeader('Content-Type',pathname.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(filename))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
  const frame=page.frameLocator('#agenda'),runtime=page.frames().find(item=>item.url().includes('/modules/agenda.html'));
  await frame.locator('#statsNav').waitFor({state:'attached'});
  await runtime.evaluate(()=>{document.getElementById('statsNav').click();openStatisticsReport('Ventas','Por categorías','📊')});
  const body=frame.locator('#salesStatsBody');
  await body.locator('details').waitFor({state:'attached',timeout:20000});
  await body.locator('details').evaluate(element=>element.open=true);
  assert.match(await body.textContent(),/VALORACION[\s\S]*RESERVA/);
  assert.match(await body.textContent(),/TRACCION[\s\S]*60,00\s*€/);
  assert.match(await body.textContent(),/FISIO CONTROL[\s\S]*45,00\s*€/);
  assert.match(await body.textContent(),/Conceptos sin correspondencia con un servicio configurado · 1 · 15,00\s*€/);
  assert.match(await body.textContent(),/Importe clasificado[\s\S]*205,00\s*€/);
  await page.screenshot({path:'/private/tmp/atlas-murcia-classification-synthetic.png',fullPage:true});
  assert.deepEqual(errors.filter(message=>!message.includes('statisticsSalesError is not defined')),[]);
  console.log('Informe de categorías sintético: RESERVA en VALORACION, categorías propias visibles y solo el concepto desconocido pendiente.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
