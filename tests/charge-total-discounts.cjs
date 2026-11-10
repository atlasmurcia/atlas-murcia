const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8');
const start=source.indexOf(' const selectedRows=()=>'),end=source.indexOf(' function ensureDiscount()',start);
const values=[25,15,65,45,20,60,65,45],discounts=[10,100,100,10,10,100,100,10];
const rows=values.map((value,index)=>{const select={checked:true},discount={value:String(discounts[index])},final={value:''},input={value:String(value),parentElement:{querySelector:selector=>selector==='[data-charge-final]'?final:discount}};return{select,input,discount,final,classList:{contains:()=>false},querySelector:()=>select,querySelectorAll:()=>[input]}});
const ids={atlasSelectedServicesTotal:{value:''},appointmentChargeTotal:{value:''},appointmentChargeDiscount:{value:'0'},appointmentChargeDiscountInfo:{textContent:''},confirmAppointmentChargeBtn:{},atlasCalculatedChargeTotal:{textContent:''},atlasCalculatedChargeDetail:{textContent:''}};
const ctx={document:{querySelectorAll:selector=>selector==='.atlas-day-charge-row'?rows:rows.map(row=>row.input),getElementById:id=>ids[id]},groupProducts:[],sales:{products:[]},hesc:String,money:n=>Number(n).toFixed(2)+' €',jointServiceAmount:null};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';this.recalculate=updateGroupTotal;',ctx);
function total(expected){ctx.recalculate();assert.equal(Number(ids.appointmentChargeTotal.value),expected);assert.equal(ids.atlasCalculatedChargeTotal.textContent,expected.toFixed(2)+' €')}
total(121.5);assert.equal(ids.atlasSelectedServicesTotal.value,'121.50');assert.deepEqual(rows.map(r=>r.final.value),['22.50','0.00','0.00','40.50','18.00','0.00','0.00','40.50']);assert.match(ids.atlasCalculatedChargeDetail.textContent,/Servicios con descuentos: 121.50/);
ids.appointmentChargeDiscount.value='10';total(109.35);assert.equal(ids.atlasSelectedServicesTotal.value,'109.35');assert.match(ids.atlasCalculatedChargeDetail.textContent,/Descuento conjunto: 10 %/);
ids.appointmentChargeDiscount.value='0';rows[0].select.checked=false;total(99);rows[0].select.checked=true;
rows[0].input.value='30';total(126);rows[0].input.value='25';
ctx.jointServiceAmount=100.01;total(100.01);ctx.jointServiceAmount=null;
rows.forEach(r=>r.discount.value='100');total(0);assert.equal(ids.confirmAppointmentChargeBtn.disabled,true);
ctx.sales.products.push({id:'test-product',name:'Producto de prueba',price:20,cost:10,stock:2});ctx.groupProducts.push({productId:'test-product',quantity:1,unitPrice:20});ids.appointmentChargeDiscount.value='10';total(18);assert.equal(ids.atlasSelectedServicesTotal.value,'0.00');assert.equal(ids.confirmAppointmentChargeBtn.disabled,false);
assert.ok(source.includes('Importe manual conjunto (opcional, €)'));assert.ok(source.includes('Dejar vacío para cálculo automático'));
for(const file of ['atlas.html','modules/agenda.html'])for(const script of fs.readFileSync(__dirname+'/../'+file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/src=|application\/json/.test(script[1]))new vm.Script(script[2])}
console.log('Total automático: descuentos por servicio, 100 %, descuento conjunto, selección, cambio de precio, importe opcional y productos; sin registrar cobros.');
