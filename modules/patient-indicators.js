// Resumen de lectura: no modifica citas, presupuestos, cobros ni datos del paciente.
(()=>{
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const money=value=>Math.round((value+Number.EPSILON)*100)/100;
 const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const activePayment=row=>['completed','refunded'].includes(row.status)&&!row.cancelled_at;
 function calculate({patient,appointments,payments,budgets,debts},now=Date.now()){
  const clinical=appointments.filter(row=>!(row.services||[]).some(service=>/^(avisos?$|llamada\b|seguimiento\b)/.test(norm(service))));
  const done=clinical.filter(row=>row.status==='completed');
  const pending=clinical.filter(row=>['pending','confirmed','arrived','in_progress'].includes(row.status));
  const upcoming=pending.filter(row=>Number.isFinite(Date.parse(row.starts_at))&&Date.parse(row.starts_at)>=now).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at))[0];
  const last=done.filter(row=>Number.isFinite(Date.parse(row.starts_at))&&Date.parse(row.starts_at)<=now).sort((a,b)=>Date.parse(b.starts_at)-Date.parse(a.starts_at))[0];
  const valid=payments.filter(activePayment),hasHistory=patient.historical_income!=null;
  // La foto histórica ya incluye los cobros anteriores al corte de la migración.
  // Sin fecha de corte no se puede sumar el histórico y los cobros sin duplicar.
  const cutoff=Date.parse(patient.historical_financials_at),historyUnverifiable=hasHistory&&!Number.isFinite(cutoff);
  const collected=money((hasHistory?number(patient.historical_income):0)+valid.filter(row=>!hasHistory||Date.parse(row.paid_at)>cutoff).reduce((sum,row)=>sum+number(row.amount),0));
  const budgetBalance=budgets.filter(row=>['accepted','Aceptado'].includes(row.status)).reduce((sum,budget)=>{
   const paid=valid.filter(row=>String(row.budget_id||'')===String(budget.id)||row.metadata?.budget_client_ref&&row.metadata.budget_client_ref===budget.client_ref);
   const settled=paid.reduce((total,row)=>total+number(row.metadata?.settled_amount??row.amount),0);
   return sum+Math.max(0,money(number(budget.total)-settled));
  },0);
  // Una deuda saldada vale cero: no resucitar la deuda histórica al saldarla.
  const historicalBalance=debts.length?debts.filter(row=>!row.is_settled).reduce((sum,row)=>sum+Math.max(0,number(row.amount_remaining)),0):Math.max(0,number(patient.historical_debt));
  const balance=money(budgetBalance+historicalBalance);
  return {completed:done.length,pending:pending.length,next:upcoming?.starts_at||null,last:last?.starts_at||null,progress:done.length+pending.length?Math.round(done.length/(done.length+pending.length)*100):null,balance,totalSales:historyUnverifiable?null:money(collected+balance),collected:historyUnverifiable?null:collected,checkedAt:new Date(now).toISOString()};
 }
 async function load(db,context,patientId){
  if(!patientId)throw new Error('Selecciona un paciente.');
  const scoped=query=>query.eq('organization_id',context.organizationId).eq('clinic_id',context.clinicId);
  const patient=await scoped(db.from('patients').select('id,historical_income,historical_debt,historical_financials_at')).eq('id',patientId).is('deleted_at',null).maybeSingle();
  if(patient.error)throw patient.error;if(!patient.data)throw new Error('El paciente no pertenece a esta clínica.');
  async function all(table,columns,softDelete=true){
   const rows=[],size=500;
   for(let offset=0;;offset+=size){
    let query=scoped(db.from(table).select(columns)).eq('patient_id',patientId);
    if(softDelete)query=query.is('deleted_at',null);
    const page=await query.order('id',{ascending:true}).range(offset,offset+size-1);
    if(page.error)throw page.error;rows.push(...(page.data||[]));if((page.data||[]).length<size)return rows;
   }
  }
  const [appointments,payments,budgets,debts]=await Promise.all([
   all('appointments','id,starts_at,status,services'),
   all('payments','id,budget_id,amount,status,paid_at,cancelled_at,metadata'),
   all('budgets','id,client_ref,status,total'),
   all('patient_debts','id,amount_remaining,is_settled',false)
  ]);
  return calculate({patient:patient.data,appointments,payments,budgets,debts});
 }
 window.atlasCalculatePatientIndicators=calculate;
 window.atlasLoadPatientIndicators=load;
})();
