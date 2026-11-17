const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const window={};vm.runInNewContext(fs.readFileSync('modules/patient-financial-summary.js','utf8'),{window});
const calculate=window.atlasCalculateFinancialSummary;
const budgets=[{id:'b',name:'Presupuesto ficticio',status:'accepted',total:100},{id:'draft',status:'draft',total:500}];
const payments=[{id:'p1',budget_id:'b',status:'completed',amount:30},{id:'p2',budget_id:'b',status:'completed',amount:20},{id:'annulled',budget_id:'b',status:'cancelled',amount:500},{id:'advance',budget_id:null,status:'completed',amount:200}];
let result=calculate(budgets,payments,[{amount_remaining:10,is_settled:false},{amount_remaining:900,is_settled:true}]);assert.equal(result.balance,60);assert.equal(result.charges[0].status,'Pagado parcialmente');assert.equal(result.charges[0].paid,50);
payments.push({id:'refund',budget_id:'b',status:'completed',amount:-20});assert.equal(calculate(budgets,payments,[]).balance,70);
// Los estados de asistencia no forman parte de las entradas del saldo.
const trace=[],tables={patients:[{id:'synthetic-patient'}],budgets,payments,patient_debts:[{amount_remaining:10,is_settled:false}]};let missing=false,fail=false;
const db={from(table){assert.notEqual(table,'appointments');const filters=[];return{select(){return this},eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},order(){return this},maybeSingle(){trace.push({table,filters});return Promise.resolve({data:missing?null:tables.patients[0],error:null})},range(from,to){trace.push({table,filters});return Promise.resolve({data:tables[table].slice(from,to+1),error:fail&&table==='payments'?Error('Sin conexión ficticia'):null})}}}};
(async()=>{
 const context={organizationId:'synthetic-org',clinicId:'synthetic-clinic'};
 const loaded=await window.atlasLoadFinancialSummary(db,context,'synthetic-patient');assert.equal(loaded.balance,80);
 for(const call of trace){assert(call.filters.some(([k,v])=>k==='organization_id'&&v===context.organizationId));assert(call.filters.some(([k,v])=>k==='clinic_id'&&v===context.clinicId));if(call.table!=='patients')assert(call.filters.some(([k,v])=>k==='patient_id'&&v==='synthetic-patient'));}
 tables.payments=Array.from({length:1001},(_,i)=>({id:'p'+i,budget_id:'b',amount:0.01,status:'completed'}));assert.equal((await window.atlasLoadFinancialSummary(db,context,'synthetic-patient')).budgetBalance,89.99);
 fail=true;await assert.rejects(window.atlasLoadFinancialSummary(db,context,'synthetic-patient'),/Sin conexión/);fail=false;
 missing=true;await assert.rejects(window.atlasLoadFinancialSummary(db,context,'other'),/no pertenece/);
 console.log('Saldo independiente de asistencia, parciales, devoluciones, deuda saldada, paginación, aislamiento por clínica y errores: OK.');
})().catch(e=>{console.error(e);process.exitCode=1});
