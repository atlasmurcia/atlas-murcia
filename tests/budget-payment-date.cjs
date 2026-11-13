const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ficha=fs.readFileSync(__dirname+'/../modules/ficha.html','utf8'),agenda=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8'),shell=fs.readFileSync(__dirname+'/../atlas.html','utf8');
const block=ficha.match(/<script id="atlas-budget-payment-date-v1">([\s\S]*?)<\/script>/);
assert.ok(block,'Debe existir el helper de fecha de cobro');
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-11-13T09:25:40.000Z']))}static now(){return new Date('2026-11-13T09:25:40.000Z').getTime()}}
const context={window:{},Date:FixedDate,Intl,Number,String,Math};
vm.createContext(context);vm.runInContext(block[1],context);
assert.equal(context.window.atlasMadridDate(new FixedDate('2026-11-12T23:30:00.000Z')),'2026-11-13');
assert.equal(context.window.atlasMadridDate(new FixedDate('2026-11-13T00:30:00.000Z')),'2026-11-13');
assert.equal(context.window.atlasIsValidDate('2026-11-12'),true,'Permite una fecha pasada válida');
assert.equal(context.window.atlasIsValidDate('2026-02-30'),false,'Rechaza una fecha imposible');
assert.equal(context.window.atlasBudgetPaymentInstant('2026-11-12'),'2026-11-12T09:25:40.000Z','Conserva la hora de Murcia en invierno');
assert.equal(context.window.atlasBudgetPaymentInstant('2026-07-01'),'2026-07-01T08:25:40.000Z','Conserva la hora de Murcia en verano');
assert.match(ficha,/id="budgetPaymentDate" type="date"/);
assert.match(ficha,/paymentDate>today/,'El cobro rechaza fechas futuras');
assert.match(ficha,/partial,paymentDate\]\)/,'La fecha forma parte de la referencia idempotente del intento');
assert.match(ficha,/date:window\.atlasBudgetPaymentInstant\(paymentDate\)/);
assert.match(agenda,/Fecha del cobro: '\+escF\(paymentDate\)/,'La impresión fiscal muestra la fecha del cobro');
assert.match(shell,/\.gte\('paid_at',madridStart\(from\)\)/,'El informe de ventas filtra por la fecha elegida en el pago');
assert.match(shell,/select\('paid_at'\).*payment_paid_at/s,'La vista de factura obtiene la fecha de cobro del pago');
for(const file of ['atlas.html','modules/agenda.html','modules/ficha.html'])for(const script of fs.readFileSync(__dirname+'/../'+file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/src=|application\/json/.test(script[1]))new vm.Script(script[2])}
console.log('Fecha de cobro: zona horaria de Murcia, fechas pasadas, fecha inválida, rechazo futuro, referencia de cobro, informes y vista de factura.');
