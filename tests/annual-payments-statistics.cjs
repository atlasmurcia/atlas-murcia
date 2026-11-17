const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const agenda=fs.readFileSync(path.join(__dirname,'../modules/agenda.html'),'utf8');
const shell=fs.readFileSync(path.join(__dirname,'../atlas.html'),'utf8');

assert.match(agenda,/function statsPreviousYear\(\).*year\+'-01-01'.*year\+'-12-31'/,'Año anterior debe consultar el año natural completo');
assert.match(agenda,/function updateStats\(force=false\)\{[\s\S]*?if\(force\).*renderStatisticsDashboard/,'Abrir Estadísticas debe mostrar el escritorio');
assert.doesNotMatch(agenda,/force\|\|panel\?\.classList\.contains\('open'\)/,'Una actualización de Agenda no debe expulsar del informe abierto');
assert.match(agenda,/activeStatisticsReport==='General'\)return renderGeneral\(\)/,'General debe usar el informe central exacto');
assert.match(agenda,/Comprobando todos los cobros del periodo/,'General debe informar mientras consulta todo el periodo');
assert.match(agenda,/registro central de cobros para todo el periodo seleccionado/,'General debe identificar la fuente contable completa');
assert.match(agenda,/record_type==='invoice_rectification'/,'Las rectificaciones deben incluirse en el neto');
assert.match(agenda,/amount:refund\?-Math\.abs/,'Una rectificación positiva o negativa en origen siempre debe restar');
assert.match(agenda,/atlasRefreshCentralSalesStatistics\?\.\(\)/,'Buscar debe volver a consultar el servidor aunque el periodo no cambie');
assert.match(agenda,/atlas:central-cash-changed/,'Un cobro nuevo debe invalidar el informe abierto');
assert.match(agenda,/statisticsExportRows=\[\['Fecha','Paciente','Empleado','Forma de pago','Importe','Tipo'\]/,'La exportación debe usar las mismas filas centrales visibles');

const actionStart=shell.indexOf("else if(m.action==='sales:report')");
const actionEnd=shell.indexOf("else if(m.action==='invoices:listForPayment')",actionStart);
const report=shell.slice(actionStart,actionEnd);
assert.ok(actionStart>0&&actionEnd>actionStart,'Debe existir la consulta central de ventas');
assert.match(report,/for\(let offset=0;;offset\+=500\)/,'Los cobros deben leerse en páginas hasta terminar');
assert.match(report,/\.range\(offset,offset\+499\)/,'Cada página debe tener un rango estable');
assert.match(report,/if\(\(page\.data\|\|\[\]\)\.length<500\)break/,'La lectura solo debe terminar al recibir la última página');
assert.match(report,/\.gte\('paid_at',madridStart\(from\)\)\.lt\('paid_at',madridStart/,'El servidor debe filtrar el periodo completo con horario de Madrid');

console.log('Cobros anuales: año natural completo, informe estable, fuente central paginada, rectificaciones y exportación coherente.');
