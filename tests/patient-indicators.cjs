const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../modules/patient-indicators.js'),'utf8'),{window,Date,Intl});
const calculate=window.atlasCalculatePatientIndicators;
const empty=()=>({patient:{},appointments:[],payments:[],budgets:[],debts:[]});
const now=Date.parse('2026-11-06T09:00:00Z');
const appointment=(status,starts_at,services=['Fisioterapia'])=>({status,starts_at,services});
const payment=(amount,extra={})=>({id:Math.random().toString(),amount,status:'completed',paid_at:'2026-11-05T09:00:00Z',...extra});
let input=empty();
input.appointments=[appointment('completed','2026-10-01T08:00:00Z'),appointment('completed','2026-11-05T08:00:00Z'),appointment('pending','2026-11-01T08:00:00Z'),appointment('pending','2026-11-07T08:00:00Z'),appointment('confirmed','2026-11-08T08:00:00Z'),appointment('cancelled','2026-11-06T10:00:00Z'),appointment('no_show','2026-11-05T07:00:00Z'),appointment('completed','2026-11-05T10:00:00Z',['Llamada seguimiento'])];
let result=calculate(input,now);
assert.equal(result.completed,2);assert.equal(result.pending,3);assert.equal(result.progress,40);
assert.equal(result.next,'2026-11-07T08:00:00Z');assert.equal(result.last,'2026-11-05T08:00:00Z');
assert.equal(calculate(empty(),now).progress,null);
input=empty();input.budgets=[{id:'budget',status:'accepted',total:1000},{id:'draft',status:'draft',total:5000}];
input.payments=[payment(200,{budget_id:'budget'}),payment(100,{budget_id:'budget',status:'cancelled'}),payment(50)];
result=calculate(input,now);assert.equal(result.balance,800);assert.equal(result.collected,250);assert.equal(result.totalSales,1050);
input.payments.push(payment(750,{budget_id:'budget',metadata:{settled_amount:800}}));
result=calculate(input,now);assert.equal(result.balance,0);assert.equal(result.totalSales,1000); // Descuento manual de 50, sin duplicar el pago parcial.
input=empty();input.patient={historical_income:1200,historical_debt:50,historical_financials_at:'2026-10-01T00:00:00Z'};
input.payments=[payment(1200,{paid_at:'2026-09-01T00:00:00Z'}),payment(100),payment(-20,{status:'refunded'}),payment(300,{status:'cancelled'})];
result=calculate(input,now);assert.equal(result.collected,1280);assert.equal(result.totalSales,1330);
input.debts=[{is_settled:true,amount_remaining:0}];assert.equal(calculate(input,now).balance,0);
input.debts=[{is_settled:false,amount_remaining:20}];assert.equal(calculate(input,now).balance,20);
input.patient.historical_financials_at=null;assert.equal(calculate(input,now).totalSales,null);
// El lector pagina y aplica el ámbito de organización, clínica y paciente a cada página.
async function testLoader(){
 const log=[],tables={patients:[{id:'p'}],appointments:Array.from({length:1001},(_,i)=>({id:String(i),status:'completed',starts_at:'2026-10-01T08:00:00Z',services:['Fisio']})),payments:[],budgets:[],patient_debts:[]};
 let fail=false,missing=false;
 const db={from(table){const filters=[];return {select(){return this},eq(key,value){filters.push([key,value]);return this},is(key,value){filters.push([key,value]);return this},order(key){assert.equal(key,'id');return this},async maybeSingle(){log.push({table,filters});return {data:missing?null:tables[table][0],error:null}},async range(from,to){log.push({table,filters,from,to});return {data:tables[table].slice(from,to+1),error:fail&&table==='payments'?new Error('Sin acceso'):null}}}}};
 const context={organizationId:'org',clinicId:'clinic'};
 result=await window.atlasLoadPatientIndicators(db,context,'p');assert.equal(result.completed,1001);
 const pages=log.filter(entry=>entry.table==='appointments');assert.equal(pages.length,3);assert.equal(pages[2].from,1000);
 for(const entry of log){assert.ok(entry.filters.some(([k,v])=>k==='organization_id'&&v==='org'));assert.ok(entry.filters.some(([k,v])=>k==='clinic_id'&&v==='clinic'));assert.ok(entry.filters.some(([k,v])=>k===(entry.table==='patients'?'id':'patient_id')&&v==='p'))}
 fail=true;await assert.rejects(window.atlasLoadPatientIndicators(db,context,'p'),/Sin acceso/);
 missing=true;const count=log.length;await assert.rejects(window.atlasLoadPatientIndicators(db,context,'other'),/no pertenece/);assert.equal(log.length,count+1);
 console.log('Indicadores: citas sin plan, histórico, saldos, descuentos, anulaciones, paginación y errores verificados.');
}
testLoader().catch(error=>{console.error(error);process.exitCode=1});
