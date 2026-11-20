const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8');
const legacy=source.split('\n').find(line=>line.includes('window.openAppointmentCharge=function(id){baseOpenCharge(id);'));
const start=source.lastIndexOf(' const previousOpenCharge=window.openAppointmentCharge;',source.indexOf(' function applyClubPrices('));
const end=source.indexOf('\n})();',start);
const charging=source.slice(start,end);
function setup(request){
 const inputs=[{value:'100.00'}],discount={value:'0'},appointments=[{id:'a',patientCode:'A',services:['Bomba Diamagnética']},{id:'b',patientCode:'B',services:['Bomba Diamagnética']}];
 const patients={A:{remoteId:'synthetic-a'},B:{remoteId:'synthetic-b'}};
 const summary={innerHTML:'',insertAdjacentHTML(_,html){this.innerHTML+=html}};
 const remove=token=>{summary.innerHTML=summary.innerHTML.replace(new RegExp('<div class="'+token+'">[\\s\\S]*?</div>','g'),'')};
 const base=()=>{inputs[0].value='100.00';summary.innerHTML=''};
 const context={appointments,patientByCode:code=>patients[code],baseOpenCharge:base,appointmentChargeDiscount:discount,appointmentChargeSummary:summary,money:String,console:{warn(){}},lostClientSpend:()=>{throw Error('El acumulado local no debe decidir la tarifa')},document:{getElementById:id=>id==='appointmentChargeDiscount'?discount:summary,querySelectorAll:selector=>selector==='[data-charge-price]'?inputs:selector.split(',').map(s=>({remove:()=>remove(s.trim().slice(1))}))},window:{openAppointmentCharge:base,updateChargeTotal(){},atlasClubPrice:(_,fallback)=>fallback,atlasCentralRequest:request}};
 vm.createContext(context);vm.runInContext(legacy,context);vm.runInContext(charging,context);
 return {context,inputs,summary,patients,open:id=>context.window.openAppointmentCharge(id)};
}
const row=(amount,extra={})=>({amount,status:'completed',patient_id:'synthetic-a',...extra});
module.exports=(async()=>{
 let count=0;
 for(const [name,rows,expected] of [
  ['bajo el mínimo',[row(600)],false],['mínimo exacto',[row(1300)],false],['supera el mínimo',[row(1300.01)],true],
  ['pagos parciales acumulados',[row(700),row(601)],true],['pagos anulados y pendientes',[row(600),row(900,{status:'cancelled'}),row(900,{status:'pending'})],false],
  ['sin pagos',[],false],['importe inválido',[row(1400),row('inválido')],false],['identidad distinta',[row(1400,{patient_id:'synthetic-b'})],false],
  ['sin identidad verificada',[row(1400,{patient_id:undefined})],false],['respuesta incorrecta',{},false],['importe numérico en texto',[row('1400.00')],true]
 ]){
  const test=setup(async()=>rows);assert.equal(await test.open('a'),expected,name);assert.equal(test.inputs[0].value,expected?'50.00':'100.00',name);assert.equal(test.summary.innerHTML.includes('class="atlas-charge-club"'),expected,name);count++;
 }
 const unavailable=setup(async()=>{throw Error('sin conexión')});assert.equal(await unavailable.open('a'),false);assert.equal(unavailable.inputs[0].value,'100.00');count++;
 const missing=setup(async()=>{throw Error('no debe consultar')});delete missing.patients.A.remoteId;assert.equal(await missing.open('a'),false);assert.equal(missing.inputs[0].value,'100.00');count++;
 const waiting=[];const race=setup(()=>new Promise(resolve=>waiting.push(resolve)));const first=race.open('a');const second=race.open('b');waiting[1]([row(600,{patient_id:'synthetic-b'})]);assert.equal(await second,false);waiting[0]([row(1500)]);assert.equal(await first,false);assert.equal(race.inputs[0].value,'100.00');assert(!race.summary.innerHTML.includes('class="atlas-charge-club"'));count++;
 // The grouped form must use the verified result, regardless of stale markup.
 const groupedLine=source.split('\n').find(line=>line.includes('window.openAppointmentCharge=async function(id){const request=++groupChargeRequest;'));
 const groupCalls=[],groupWaiting=[];
 const grouped={window:{},syncGroupedPayments:async()=>{},console,document:{getElementById:()=>({}),querySelector:()=>({})},previousOpenCharge:()=>new Promise(resolve=>groupWaiting.push(resolve)),appointments:[{id:'a'},{id:'b'}],renderGroup:(origin,club)=>groupCalls.push([origin.id,club]),confirmGroupCharge(){},openDrawer(){},alert(){}};
 vm.createContext(grouped);vm.runInContext('let groupChargeRequest=0;'+groupedLine,grouped);
 const ga=grouped.window.openAppointmentCharge('a');await new Promise(resolve=>setImmediate(resolve));groupWaiting[0](false);await ga;assert.deepEqual(groupCalls,[['a',false]]);count++;
 groupCalls.length=0;const old=grouped.window.openAppointmentCharge('a');await new Promise(resolve=>setImmediate(resolve));const current=grouped.window.openAppointmentCharge('b');await new Promise(resolve=>setImmediate(resolve));groupWaiting[2](false);await current;groupWaiting[1](true);await old;assert.deepEqual(groupCalls,[['b',false]]);count++;
 for(const file of ['modules/agenda.html','atlas.html'])for(const script of fs.readFileSync(__dirname+'/../'+file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|application\/json/.test(script[1]))new vm.Script(script[2],{filename:file});
 return `${count} comprobaciones sintéticas correctas: umbral, pagos, conexión, identidad, cambios de cita y cobro agrupado. Sintaxis correcta.`;
})();
if(require.main===module)module.exports.then(console.log).catch(error=>{console.error(error);process.exitCode=1});
