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
assert.ok(lines.slice(0,5).every(line=>line[3]===0));assert.ok(lines.slice(5).every(line=>line[3]===100&&line[2]>0));
assert.equal(lines.reduce((sum,line)=>sum+line[1]*line[2]*(1-line[3]/100),0),1850);
for(const name of ['Vacu','ATT Robotic'])assert.equal(rules.sessions({name,sessions:1}),10);
for(const name of ['Phisicalm estático','Phisicalm dinámico'])assert.equal(rules.sessions({name,sessions:10}),6);
console.log('Plantilla: cantidades, alias, orden, precios visibles y regalos al 100 % verificados.');

assert.equal(rules.eligible({createdAt:"2026-11-06T10:22:13Z"}),false);
assert.equal(rules.eligible({createdAt:"2026-11-06T10:22:14Z"}),true);
assert.equal(rules.eligible({createdAt:"2026-11-07T10:00:00Z"}),true);
assert.equal(rules.eligible({}),false);
assert.equal(rules.eligible({createdAt:"incorrecta"}),false);
