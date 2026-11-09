const assert=require('node:assert/strict');
const rules=require('../modules/budget-equipment-template.js');
const services=[
 {name:'Osteopatía',sessions:6,price:60},{name:'Readaptación',sessions:10,price:35},
 {name:'DPA',sessions:10,price:45},{name:'PHYSICALM ESTATICO',sessions:10,price:15},
 {name:'Robot',sessions:1,price:55},{name:'VacuSport',sessions:1,price:25},
 {name:'iMoove',sessions:10,price:20},{name:'Physicalm dinámico',sessions:10,price:15},
 {name:'Camilla de flexión-distracción',sessions:6,price:65},{name:'SIS',sessions:10,price:25}
];
const original=JSON.stringify(services),lines=rules.template(services),byName=new Map(lines.map(line=>[line[0],line]));
assert.equal(JSON.stringify(services),original);
assert.equal(byName.get('Robot')[1],10);assert.equal(byName.get('VacuSport')[1],10);
assert.equal(byName.get('PHYSICALM ESTATICO')[1],6);assert.equal(byName.get('Physicalm dinámico')[1],6);
assert.deepEqual(lines.map(line=>line[0]),['DPA','Robot','VacuSport','SIS','Readaptación','Osteopatía','iMoove','Physicalm dinámico','PHYSICALM ESTATICO','Camilla de flexión-distracción']);
assert.ok(lines.slice(0,5).every(line=>line[3]===0));assert.ok(lines.slice(5).every(line=>line[3]===0&&line[2]>0));
assert.equal(lines.reduce((sum,line)=>sum+line[1]*line[2]*(1-line[3]/100),0),2980);
for(const name of ['Vacu','ATT Robotic'])assert.equal(rules.sessions({name,sessions:1}),10);
for(const name of ['Phisicalm estático','Phisicalm dinámico'])assert.equal(rules.sessions({name,sessions:10}),6);
console.log('Plantilla: cantidades, alias, orden, precios visibles y regalos sin descuento automático verificados.');

assert.equal(rules.eligible({createdAt:"2026-11-06T10:22:13Z"}),false);
assert.equal(rules.eligible({createdAt:"2026-11-06T10:22:14Z"}),true);
assert.equal(rules.eligible({createdAt:"2026-11-07T10:00:00Z"}),true);
assert.equal(rules.eligible({}),false);
assert.equal(rules.eligible({createdAt:"incorrecta"}),false);

// Sesiones por defecto del catálogo y de «Todas las terapias»; no se aplican a líneas guardadas.
const variants=['Artrosis','Disco','Hueso','Ligamento','Músculo','Nervio','Postcirugía','Tendón','Osteoporosis'];
const defaults=[{name:'BRAINS WAY (TERAPIA TRANSCRANEAL)',expected:10},{name:'FISIOAVANZADA',expected:6},...['FLEX','OSTEOSPIN'].flatMap(family=>variants.map(variant=>({name:'MBST '+family+' '+variant,expected:variant==='Osteoporosis'?10:9})))];
for(const {name,expected} of defaults){const service={name,sessions:1,price:73.25};assert.equal(rules.sessions(service),expected,name);assert.deepEqual(rules.template([service]),[[name,expected,73.25,0]],name);assert.equal(service.sessions,1,'La regla no cambia su entrada');}
for(const name of ['MBST Músculo','MBST Tendón','MBST Ligamento','MBST Hueso','mbst flex músculo'])assert.equal(rules.sessions({name,sessions:1}),9,name);
for(const name of ['Resonancia MBST FLEX REACTIVACION','Resonancia MBST OSTEO REACTIVACION','Fisioterapia','Otra terapia'])assert.equal(rules.sessions({name,sessions:4}),4,name);

const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(__dirname+'/../modules/budget-equipment-template.js','utf8');
const saved={id:1,createdAt:'2026-11-07T10:00:00Z',lines:[['FISIOAVANZADA',3,45,15],['MBST FLEX Artrosis',4,150,0]],payments:[]},savedBefore=JSON.stringify(saved);
const ctx={therapyCatalog:[],budgetTemplates:{todas:{lines:[]}},budgets:[saved],currentBudgetId:1,document:{getElementById:()=>null},applyBudgetTemplate(){},addBudgetLine(){},alert(){}};
ctx.window={atlasApplyServiceCatalog(services){ctx.therapyCatalog.splice(0,ctx.therapyCatalog.length,...services.map(service=>({...service})));return true}};
vm.createContext(ctx);vm.runInContext(source,ctx);
for(const price of [45,80]){ctx.window.atlasApplyServiceCatalog(defaults.map(({name})=>({name,sessions:1,price})));for(const {name,expected} of defaults){assert.equal(ctx.therapyCatalog.find(s=>s.name===name).sessions,expected);const line=ctx.budgetTemplates.todas.lines.find(l=>l[0]===name);assert.equal(line[1],expected);assert.equal(line[2],price);}assert.equal(JSON.stringify(saved),savedBefore,'Recargar catálogo conserva cantidades, precios y descuentos ya guardados');}
console.log('Sesiones predeterminadas: BRAINS WAY 10, FISIOAVANZADA 6 y FLEX/OSTEOSPIN 9 salvo Osteoporosis 10; recarga del catálogo y presupuestos anteriores comprobados.');
