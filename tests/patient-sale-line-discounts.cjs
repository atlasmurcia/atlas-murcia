const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const agenda=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8'),ficha=fs.readFileSync(__dirname+'/../modules/ficha.html','utf8');
const commonStart=agenda.indexOf(' const euros=value=>'),commonEnd=agenda.indexOf(' const modal=document.createElement',commonStart);
const discountStart=agenda.indexOf(' const lineDiscountPercent=row=>'),discountEnd=agenda.indexOf(' const rowTemplate=',discountStart);
const line=(prefix,source=agenda)=>{const start=source.indexOf(prefix);assert.notEqual(start,-1,'No se encontró '+prefix);return source.slice(start,source.indexOf('\n',start))};
assert.ok(commonStart>=0&&commonEnd>commonStart);assert.ok(discountStart>=0&&discountEnd>discountStart);
const rows=[
 {kind:'service',catalogId:'service-a',description:'Servicio A',category:'Fisioterapia',quantity:1,unitPrice:'100,00',discountPercent:'10'},
 {kind:'service',catalogId:'service-b',description:'Servicio B',category:'Fisioterapia',quantity:2,unitPrice:'50,00',discountPercent:'20'},
 {kind:'product',catalogId:'product-a',description:'Producto A',category:'Producto',quantity:1,unitPrice:'20,00',discountPercent:'75'}
];
const finalInputs=rows.map(()=>({value:''})),rowElements=rows.map((_,index)=>({dataset:{row:String(index)},querySelector:selector=>selector==='[data-final-line]'?finalInputs[index]:null}));
const fields={atlasDirectSaleDeductionType:{value:'discount'},atlasDirectSaleDiscountAmount:{value:'10,00'},atlasDirectSaleOriginalSubtotal:{},atlasDirectSaleLineDiscountShown:{},atlasDirectSaleSubtotal:{},atlasDirectSaleDeductionLabel:{},atlasDirectSaleReasonLabel:{},atlasDirectSaleDiscountShown:{},atlasDirectSaleTotal:{}};
const euros=value=>Number(value||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const context={rows,document:{querySelectorAll:selector=>{assert.equal(selector,'#atlasDirectSaleLines [data-row]');return rowElements},getElementById:id=>fields[id]},euros};
vm.createContext(context);
vm.runInContext(agenda.slice(commonStart,commonEnd)+agenda.slice(discountStart,discountEnd)+line(' function recalc(){')+line(' function validatedLines(){')+';this.recalculate=recalc;this.validateLines=validatedLines;',context);
const totals=context.recalculate();
assert.equal(totals.originalSubtotal,220);
assert.equal(totals.lineDiscountAmount,30);
assert.equal(totals.subtotal,190);
assert.equal(totals.discountAmount,10);
assert.equal(totals.total,180);
assert.equal(fields.atlasDirectSaleOriginalSubtotal.textContent,euros(220));
assert.equal(fields.atlasDirectSaleLineDiscountShown.textContent,euros(30));
assert.deepEqual(finalInputs.map(input=>input.value),['90.00','80.00','20.00']);
const savedLines=context.validateLines();
assert.equal(savedLines[0].discountPercent,10);
assert.equal(savedLines[1].discountPercent,20);
assert.equal(savedLines[2].discountPercent,0);
rows[0].discountPercent='101';
assert.throws(()=>context.validateLines(),/entre 0 y 100/);
for(const [file,html] of [['atlas.html',fs.readFileSync(__dirname+'/../atlas.html','utf8')],['modules/agenda.html',agenda],['modules/ficha.html',ficha]]){
 for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|application\/json/.test(script[1]))new vm.Script(script[2],{filename:file});
}
assert.match(agenda,/line_discount_percent\?\?l\.discountPercent/);
assert.match(agenda,/line_discount_percent\?\?line\.discountPercent/);
assert.match(ficha,/line_discount_percent\?\?x\.discountPercent/);
console.log('Venta desde ficha: descuentos por servicio, subtotal, total, líneas guardadas y desglose de recibo/factura; solo datos ficticios.');
