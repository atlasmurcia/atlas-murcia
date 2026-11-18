const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const agenda=fs.readFileSync(path.join(__dirname,'../modules/agenda.html'),'utf8');
const start=agenda.indexOf(' const statisticsServiceAliases=');
const end=agenda.indexOf(' let statisticsAppointmentRange=',start);
assert.ok(start>=0&&end>start,'El informe debe exponer el clasificador de ventas');

const lines=[
 {service:'RESERVA',amount:100},
 {service:'TRACCION',amount:20},
 {service:'Servicio de Fisio Control',amount:30},
 {service:'Servicio Magneto Physio',amount:40},
 {service:'Servicio 1ª Consulta',amount:10},
 {service:'Servicio Bomba Diamagnética',amount:15},
 {service:'CONCEPTO SIN CATÁLOGO',amount:5}
];
const categories=['VALORACION','FISIOTERAPIA'];
const services=[
 {name:'TRACCION',category:'TRACCION'},
 {name:'Servicio de Fisio Control',category:'FISIO CONTROL'},
 {name:'Servicio Magneto Physio',category:'MAGNETO PHYSIO'},
 {name:'Servicio 1ª Consulta',category:'1ª CONSULTA'},
 {name:'Servicio Bomba Diamagnética',category:'BOMBA DIAMAGNETICA'}
];
const context={lines,categories,services};
const normalizer="const norm=value=>String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();";
vm.runInNewContext(`${normalizer}\n${agenda.slice(start,end)}\nresult=configuredSalesHierarchy(lines,categories,services);`,context);
const result=context.result;
const byCategory=new Map(result.groups.map(group=>[group.category.label,group]));

for(const category of ['TRACCION','FISIO CONTROL','MAGNETO PHYSIO','1ª CONSULTA','BOMBA DIAMAGNETICA'])
 assert.ok(byCategory.has(category),`El informe debe incluir la categoría del catálogo ${category}`);
assert.equal(byCategory.get('VALORACION').services.find(row=>row.label==='RESERVA')?.value,100,'RESERVA debe clasificarse en VALORACION');
assert.equal(byCategory.get('TRACCION').category.value,20,'TRACCION debe quedar en su propia categoría');
assert.deepEqual(Array.from(result.unresolved,row=>row.label),['CONCEPTO SIN CATÁLOGO'],'Solo los conceptos sin servicio ni alias deben seguir pendientes');
assert.equal(result.unresolved[0].value,5);
assert.equal(result.classifiedTotal,215);
assert.match(agenda,/services\.map\(service=>String\(service\.category\|\|''\)\.trim\(\)\)/,'El filtro debe exponer las categorías definidas por los servicios');

console.log('Clasificación sintética: categorías propias, RESERVA en VALORACION y pendientes sin catálogo conservados.');
