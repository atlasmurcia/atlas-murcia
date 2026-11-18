const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../modules/agenda.html'),'utf8');
const scripts=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
for(const script of scripts)new vm.Script(script[2]);
const configScript=scripts.find(m=>m[2].includes('function applyRuntimeSettings'))[2];
const name='María Pilar Iniesta Cárceles',other='Profesional ficticio';
const noop=()=>{};
function setup(cached,failCentral=false){
 const elements=new Map(),listeners=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',hidden:false,style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,querySelectorAll:()=>[],querySelector:()=>null,getAttribute:()=>null,setAttribute:noop});return elements.get(id)};
 const cache=new Map();if(cached)cache.set('atlasAlicanteCompanyConfig_V1',JSON.stringify(cached));
 let centralRequests=0;
 const ctx={console:{log:noop,warn:noop,error:noop},Date,JSON,Map,Set,setTimeout:()=>1,clearTimeout:noop,queueMicrotask,
 document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:noop,documentElement:element('root')},
 localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},
 parent:{postMessage(msg){if(msg.type==='atlas:central-db-request'){centralRequests++;assert.equal(msg.action,'settings:list');if(failCentral)queueMicrotask(()=>listeners.forEach(fn=>fn({data:{type:'atlas:central-db-response',requestId:msg.requestId,ok:false,error:'Fallo de sincronización simulado'}})))}}},
 appointments:[],professionals:[name,other],agendaBlocks:[],agendaAvailabilityOverrides:[],therapies:[],therapyDurations:{},equipment:[],resources:[name,other],specialColumns:[],qualifiedProfessionals:()=>[],normalizeSearch:x=>String(x).toLowerCase(),professionalsForTherapy:()=>[],render:noop,
 mins:t=>{const [h,m]=t.split(':').map(Number);return h*60+m},alicanteTherapyProfessionals:{},
 addEventListener:(type,fn)=>{if(type==='message')listeners.push(fn)},atlasCacheWrite:(k,v)=>cache.set(k,v),
 timeStr:n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
 ctx.window=ctx;for(const id of ['cfgHome','cfgClose','cfgTabs'])ctx[id]=element(id);
 vm.createContext(ctx);
 const base=source.slice(source.indexOf('const schedules={'),source.indexOf('const patients=[];'));
 vm.runInContext(base+'\nglobalThis.schedules=schedules;',ctx);
 vm.runInContext(configScript.replace(' window.atlasAgendaConfig=()=>cfg;',' window.testLoadSettings=loadCentralSettings;\n window.atlasAgendaConfig=()=>cfg;'),ctx);
 return {ctx,element,requests:()=>centralRequests,cache};
}
function checkGrid(env,date,end){
 const {ctx,element}=env;
 Object.assign(ctx,{currentDate:date,lastRenderedAgendaDate:'',simulation:[],dateLabel:()=>date,equipmentUnits:()=>1,blockAppliesOnDate:()=>false,ensureCalendarDelegation:noop,renderCurrentTimeLine:noop,updateStats:noop,refreshWaitingRoom:noop,refreshWaitlist:noop,AGENDA_FEATURES:{dragDrop:false}});
 element('view').value='all';element('patientFilter').hidden=true;
 const start=source.indexOf('function render(){'),finish=source.indexOf('const renderWithoutPatientIndex=render;',start);
 vm.runInContext(source.slice(start,finish)+'\nrender();',ctx);
 const html=element('cal').innerHTML;
 for(const time of ['13:15','13:30','13:45']){
  const cell=[...html.matchAll(/<div class="([^"]*)" data-resource="([^"]*)" data-time="([^"]*)"/g)].find(m=>m[2]===name&&m[3]===time);
  assert.ok(cell,time+' exists');const available=ctx.mins(time)<end;
  assert.equal(cell[1].includes('shift-on'),available,date+' '+time+' shading');
  assert.equal(cell[1].includes('clickable'),available,date+' '+time+' interaction');
 }
 return html;
}
(async()=>{
 const fresh=setup(null);assert.equal(JSON.stringify(fresh.ctx.schedules[name][3]),'[[570,810]]');
 assert.equal(JSON.stringify(fresh.ctx.schedules[name][2]),'[[510,810],[990,1230]]');
 for(const date of ['2026-11-25','2026-12-02','2026-12-09'])checkGrid(fresh,date,810);
 const company={professionals:[{name,active:true,therapies:[],schedule:{2:[['08:30','13:30']],3:[['10:00','13:30']]}},{name:other,active:true,therapies:[],schedule:{3:[['08:00','15:00']]}}]};
 const saved=setup(company,true);
 assert.equal(JSON.stringify(saved.ctx.schedules[name][3]),'[[600,810]]');
 assert.equal(JSON.stringify(saved.ctx.schedules[other][3]),'[[480,900]]');
 await saved.ctx.testLoadSettings();assert.equal(saved.requests(),1);
 assert.equal(JSON.stringify(saved.ctx.schedules[name][3]),'[[600,810]]');
 checkGrid(saved,'2026-11-25',810);
 assert.equal(JSON.stringify(JSON.parse(saved.cache.get('atlasAlicanteCompanyConfig_V1'))),JSON.stringify(company));
 saved.ctx.agendaAvailabilityOverrides=[{id:1,kind:'open',date:'2026-11-25',resource:name,start:'10:00',end:'14:00'}];
 checkGrid(saved,'2026-11-25',840);checkGrid(saved,'2026-12-02',810);
 saved.ctx.agendaAvailabilityOverrides=[{id:2,kind:'closed',date:'2026-11-25',resource:name}];
 assert.equal(saved.ctx.professionalIntervalsForDate(name,'2026-11-25').length,0);
 console.log('OK: sintaxis, horario base, martes intacto, tres miércoles, horario guardado, sincronización fallida, otro profesional, casillas y clics, aperturas puntuales y cierres. Sin consultas reales.');
})().catch(e=>{console.error(e);process.exitCode=1});
