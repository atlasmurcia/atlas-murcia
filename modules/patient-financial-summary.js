// Cargos ya existentes: presupuestos aceptados y deuda registrada. La asistencia no interviene.
(()=>{
 const amount=v=>Math.round(Number(v||0)*100)/100;
 function calculate(budgets,payments,debts){
  const accepted=budgets.filter(b=>['accepted','aceptado'].includes(String(b.status||'').toLowerCase()));
  const active=p=>!p.cancelled_at&&['completed','refunded'].includes(p.status);
  const charges=accepted.map(b=>{
   const linked=payments.filter(p=>active(p)&&(String(p.budget_id||'')===String(b.id)||p.metadata?.budget_client_ref&&p.metadata.budget_client_ref===b.client_ref));
   const paid=amount(linked.reduce((sum,p)=>sum+(p.status==='refunded'&&Number(p.amount)>=0?0:Number(p.metadata?.settled_amount??p.amount??0)),0));
   const remaining=amount(Math.max(0,amount(b.total)-paid));
   return {id:b.id,name:b.name||'Presupuesto',amount:amount(b.total),paid,remaining,status:remaining===0?'Pagado':paid>0?'Pagado parcialmente':'Pendiente de pago'};
  });
  const debt=amount(debts.filter(d=>!d.is_settled).reduce((sum,d)=>sum+Math.max(0,Number(d.amount_remaining||0)),0));
  return {charges,registeredDebt:debt,budgetBalance:amount(charges.reduce((sum,c)=>sum+c.remaining,0)),balance:amount(charges.reduce((sum,c)=>sum+c.remaining,0)+debt)};
 }
 async function load(db,context,patientId){
  if(!patientId)throw Error('Selecciona un paciente.');
  const scoped=q=>q.eq('organization_id',context.organizationId).eq('clinic_id',context.clinicId);
  const found=await scoped(db.from('patients').select('id')).eq('id',patientId).is('deleted_at',null).maybeSingle();
  if(found.error)throw found.error;if(!found.data)throw Error('El paciente no pertenece a esta clínica.');
  async function all(table,columns,softDelete=true){
   const data=[],size=500;for(let offset=0;;offset+=size){let q=scoped(db.from(table).select(columns)).eq('patient_id',patientId);if(softDelete)q=q.is('deleted_at',null);const page=await q.order('id',{ascending:true}).range(offset,offset+size-1);if(page.error)throw page.error;data.push(...(page.data||[]));if((page.data||[]).length<size)return data;}
  }
  const [budgets,payments,debts]=await Promise.all([all('budgets','id,client_ref,name,status,total'),all('payments','id,budget_id,amount,status,metadata,cancelled_at'),all('patient_debts','id,amount_remaining,is_settled',false)]);
  return calculate(budgets,payments,debts);
 }
 window.atlasCalculateFinancialSummary=calculate;window.atlasLoadFinancialSummary=load;
})();
