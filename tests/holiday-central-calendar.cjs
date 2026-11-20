// Synthetic browser and availability regression. All external requests are blocked.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const baseline=require('node:child_process').execFileSync('/usr/bin/git',['show','9d69c1986117499a205a778f6f8893661d4ef796:modules/agenda.html'],{cwd:path.resolve(__dirname,'..'),maxBuffer:8*1024*1024}).toString();
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'modules/agenda.html'),'utf8'),shell=fs.readFileSync(path.join(root,'atlas.html'),'utf8');
const requested=[['2027-01-01','Año Nuevo'],['2027-01-06','Epifanía del Señor'],['2027-03-19','San José'],['2027-03-25','Jueves Santo'],['2027-03-26','Viernes Santo'],['2027-03-30','Bando de la Huerta'],['2027-05-01','Fiesta del Trabajo'],['2027-06-09','Día de la Región de Murcia'],['2027-09-14','Romería de Nuestra Señora de la Fuensanta'],['2027-10-12','Fiesta Nacional de España'],['2027-11-01','Todos los Santos'],['2027-12-06','Día de la Constitución Española'],['2027-12-08','Inmaculada Concepción'],['2027-12-25','Natividad del Señor / Navidad']];
const extra=[['2026-12-08','Inmaculada'],['2026-12-25','Navidad']];
const holidays=[...requested,...extra].map(([date,name])=>({date,name}));
const hours=Object.fromEntries(Array.from({length:7},(_,d)=>[d,[['08:00','22:00']]]));
const config={hours,holidays,blocks:[],availabilityOverrides:[],settings:{allowHolidayOverride:false,warnOutside:true}};
const fixtureRows=[{section:'agenda',payload:config},{section:'company',payload:{professionals:[{name:'Profesional ficticio A',active:true,therapies:['Fisioterapia','Valoración'],schedule:hours},{name:'Profesional ficticio B',active:true,therapies:['Fisioterapia'],schedule:hours}]}},{section:'other',payload:{resources:[{name:'Equipo ficticio',active:true}]}},{section:'sales',payload:{services:[{name:'Fisioterapia',active:true,duration:30}],categories:[],products:[],stockMovements:[]}},{section:'ai_receptionist',payload:{duration:30,maxOptions:3,bookingService:'Fisioterapia'}}];
let syntax=0;
for(const [name,source] of [['agenda',html],['index',shell]])for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/\bsrc=|type=["'](?:application\/json|module)/.test(m[1]))continue;new vm.Script(m[2],{filename:name});syntax++;}
const findSlots=shell.split('\n').find(line=>line.includes('async function findAgendaSlots('));
const mock={select(){return this},eq(){return this},order(){return this},limit(){return this},maybeSingle(){return this},is(){return this},gte(){return this},lt(){return this},then(resolve){return Promise.resolve({data:[]}).then(resolve)}};
const context=vm.createContext({Date,Intl,Set,Math,Number,String,Array,db:{from:()=>Object.create(mock)},context:{},loadAgendaBridge:async()=>({agenda:config,company:fixtureRows[1].payload,revision:'synthetic'}),agendaRequestParts:()=>({}),agendaDateString:()=> '2026-11-20',agendaMadridParts:()=>({hour:0,minute:0}),agendaDateAdd:(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)},agendaLocalIso:(d,t)=>d+'T'+t+':00Z',agendaTimeMinutes:t=>Number(t.slice(0,2))*60+Number(t.slice(3)),agendaIsAdministrativeContact:()=>false,agendaIntervalsFor:()=>[['08:00','22:00']],agendaBlockMatches:()=>false,agendaSlotLabel:(d,t)=>d+' '+t});
vm.runInContext(findSlots,context);
const planner=vm.createContext({holidays:{},window:{atlasAgendaConfig:()=>config},Date,String,Math,Number,Array,planningRules:{clinicStart:480,clinicEnd:1320},mins:t=>Number(t.slice(0,2))*60+Number(t.slice(3))});
vm.runInContext(html.split('\n').find(line=>line.includes('window.atlasAlicanteClosedDay=function')),planner);
vm.runInContext(html.split('\n').find(line=>line.includes('function planWindows(')),planner);
const selected={availabilityMode:'dates',availabilityDates:[...requested.map(([date])=>({date,from:'08:00',to:'22:00'})),{date:'2027-03-31',from:'08:00',to:'22:00'}]};
for(const [date] of requested)assert.equal(planner.planWindows(selected,date).length,0,'Planner excludes even explicitly selected holiday '+date);
assert.equal(planner.planWindows(selected,'2027-03-31').length,1);
const fixture=`<!doctype html><html lang="es"><meta charset="utf-8"><style>body{margin:0;font:14px Arial}header{padding:9px;background:#17313d;color:white}iframe{width:100%;height:1000px;border:0}</style><header>Prueba Murcia · datos ficticios · sin conexión al CRM</header><iframe id="agenda" src="/modules/agenda.html"></iframe><script>const frame=document.getElementById('agenda');window.requests=[];frame.onload=()=>frame.contentWindow.postMessage({type:'atlas:central-ready',organizationId:'synthetic-org',clinicId:'synthetic-clinic',userId:'synthetic-user'},'*');window.addEventListener('message',event=>{const m=event.data;if(event.source!==frame.contentWindow||m?.type!=='atlas:central-db-request')return;requests.push(m.action);event.source.postMessage({type:'atlas:central-db-response',requestId:m.requestId,ok:true,data:m.action==='settings:list'?${JSON.stringify(fixtureRows)}:[]},'*')});</script></html>`;
(async()=>{
 for(const [date] of requested)assert.equal((await context.findAgendaSlots({date})).slots.length,0,'FlowAtlas excludes '+date);
 assert((await context.findAgendaSlots({date:'2027-03-31'})).slots.length>0,'FlowAtlas keeps neighbouring open day');
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const baselinePage=await browser.newPage(),baselineErrors=[];baselinePage.on('pageerror',e=>baselineErrors.push(e.message));
 await baselinePage.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic-atlas.invalid')return r.abort();if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fixture});if(u.pathname==='/modules/agenda.html')return r.fulfill({contentType:'text/html',body:baseline});const f=path.resolve(root,'.'+u.pathname);return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({contentType:'application/javascript',body:fs.readFileSync(f)}):r.abort();});
 await baselinePage.goto('https://synthetic-atlas.invalid');await baselinePage.frames().find(f=>f.url().includes('/modules/agenda.html')).waitForFunction(()=>document.getElementById('cfgSaved').textContent.includes('Configuración central sincronizada'));await baselinePage.waitForTimeout(250);await baselinePage.close();
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic-atlas.invalid')return r.abort();if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:fixture});const filename=path.resolve(root,'.'+u.pathname);if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename))return r.abort();return r.fulfill({contentType:u.pathname.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(filename)});});
 await page.goto('https://synthetic-atlas.invalid');
 const frame=page.frames().find(f=>f.url().includes('/modules/agenda.html'));
 await frame.waitForFunction(()=>document.getElementById('cfgSaved').textContent.includes('Configuración central sincronizada'));
 await frame.evaluate(()=>{window.testAlerts=[];window.alert=x=>testAlerts.push(x);});
 for(const [date] of requested){
  const result=await frame.evaluate(date=>{
   currentDate=date;render();const closure=window.atlasAlicanteClosedDay(date);
   const views=['all','professional','equipment'].map(view=>{const select=document.getElementById('view');if([...select.options].some(o=>o.value===view))select.value=view;render();const cells=[...document.querySelectorAll('#cal .cell[data-resource][data-time]')];return {view,total:cells.length,closed:cells.filter(c=>c.classList.contains('atlas-calendar-closed')&&c.getAttribute('aria-disabled')==='true').length};});
   const blocks=resources.map(resource=>!!blockFor({date,time:'10:00',duration:30,resources:[resource],resource}));
   const slots=aiAvailableSlots(date,'');
   document.querySelector('#cal .cell[data-resource][data-time]').click();
   return {closure,views,blocks,offered:slots.map(x=>x.date),notice:document.getElementById('atlasCalendarClosedNotice').textContent,warning:testAlerts.at(-1)};
  },date);
  assert.equal(result.closure.type,'day');assert.deepEqual(result.closure.resources,['*']);assert(result.notice.includes('Festivo / Clínica cerrada'));assert(result.warning.includes('Festivo / Clínica cerrada'));
  for(const view of result.views){assert(view.total>0);assert.equal(view.total,view.closed,date+' '+view.view);}
  assert(result.blocks.length>0&&result.blocks.every(Boolean));assert(!result.offered.includes(date));
 }
 const annual=await frame.evaluate(()=>{currentDate='2027-03-30';atlasOpenYearCalendar();return {title:document.querySelector('#atlasYearCalendar h2').textContent,holidays:[...document.querySelectorAll('#atlasYearCalendarBody td.holiday')].map(c=>c.title)};});
 assert(annual.title.includes('2027'));assert.equal(annual.holidays.length,14);for(const [,name] of requested)assert(annual.holidays.includes(name));
 await frame.evaluate(()=>{document.getElementById('atlasYearCalendar').classList.remove('on');currentDate='2027-03-30';render();});
 const output=path.join(root,'../synthetic-closed-agenda.png');await page.screenshot({path:output});
 const open=await frame.evaluate(()=>{currentDate='2027-03-31';render();return {closure:atlasAlicanteClosedDay(currentDate),noticeHidden:document.getElementById('atlasCalendarClosedNotice').hidden,closed:document.querySelectorAll('#cal .atlas-calendar-closed').length};});
 assert.equal(open.closure,null);assert(open.noticeHidden);assert.equal(open.closed,0);
 const preserve=await frame.evaluate(()=>{const cfg=atlasAgendaConfig();return {count:cfg.holidays.length,legacy:atlasAlicanteClosedDay('2026-01-01'),extra:atlasAlicanteClosedDay('2026-12-25')};});assert.equal(preserve.count,16);assert(preserve.legacy&&preserve.extra);
 assert(!(await page.evaluate(()=>requests)).some(x=>/appointments:(save|upsert)|planning:apply/.test(x)));
 // Render must use the current central object even if browser cache is stale.
 const fresh=await frame.evaluate(()=>{const cfg=atlasAgendaConfig(),snapshot=JSON.stringify(cfg);localStorage.setItem('atlasAlicanteAgendaConfig_V1','{}');cfg.holidays.push({date:'2027-03-31',name:'Cierre ficticio temporal'});const closed=atlasAlicanteClosedDay('2027-03-31'),offered=aiAvailableSlots('2027-03-31','').some(x=>x.date==='2027-03-31');cfg.holidays.pop();cfg.settings.allowHolidayOverride=true;const forced=!!blockFor({date:'2027-03-30',time:'10:00',duration:30,resources:['Equipo ficticio']});cfg.settings.allowHolidayOverride=false;return {closed:!!closed,offered,forced,unchanged:JSON.stringify(cfg)===snapshot};});assert(fresh.closed&&!fresh.offered&&fresh.forced&&fresh.unchanged);
 assert.deepEqual(errors,baselineErrors,'No new browser errors');
 console.log(JSON.stringify({pass:true,syntaxScripts:syntax,requestedDates:requested.length,globalViewsPerDate:3,annualClosures:14,flowSearch:'14 excluded; adjacent day available',manual:'all columns blocked with holiday warning',cache:'central configuration wins; override cannot bypass',planner:'14 excluded even with explicit availability',preexistingBrowserErrors:baselineErrors,productionWrites:0,screenshot:output},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
