// Adaptador de lectura sobre appointments y payments existentes; nunca crea ni elimina registros.
(()=>{
 const text=v=>String(v??'');
 const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const cents=v=>Math.round(Number(v||0)*100);
 function appointmentState(row){
  if(row.deletedAt||row.deleted_at||row.status==='Eliminada')return 'Eliminada';
  const state=norm(row.status);
  if(['realizada','atendida','done','completed'].includes(state))return 'Realizada';
  if(['cancelada clinica','cancelada por la clinica'].includes(state))return 'Cancelada clínica';
  if(['cancelada usuario','cancelada por el paciente'].includes(state))return 'Cancelada usuario';
  if(['cancelada','cancelled','canceled'].includes(state))return /clin/.test(norm(row.cancelledBy||row.cancellationBy||row.metadata?.cancelledBy))?'Cancelada clínica':'Cancelada usuario';
  if(['confirmada','confirmado','confirmed'].includes(state))return 'Confirmada';
  if(['no presentado','no presentada','ausente','no_show'].includes(state))return 'No presentada';
  if(['reagendada','reprogramada','rescheduled'].includes(state))return 'Reagendada';
  if(['en sala','arrived','in_progress'].includes(state))return 'En atención';
  if(['pendiente','programada','pending','scheduled'].includes(state))return 'Pendiente';
  return state==='conflicto'?'Conflicto':'Sin estado confirmado';
 }
 const pending=row=>['Pendiente','Confirmada','En atención'].includes(appointmentState(row));
 function appointmentGroups(rows,now=Date.now()){
  const history=rows.filter(window.atlasIsAppointmentRecord);
  const stamp=a=>a.starts_at||a.date+'T'+(a.time||a.start||'00:00')+':00';
  return {history,pending:history.filter(pending),upcoming:history.filter(a=>pending(a)&&Date.parse(stamp(a))>=now),completed:history.filter(a=>appointmentState(a)==='Realizada'),cancelled:history.filter(a=>appointmentState(a).startsWith('Cancelada'))};
 }
 function paymentState(row){
  const state=norm(row.status);
  if(row.cancelled_at||['cancelled','canceled','anulado','anulada','cancelado'].includes(state))return 'Anulado';
  if(['failed','fallido'].includes(state))return 'Fallido';
  if(['pending','pendiente','pending_payment'].includes(state))return 'Pendiente de pago';
  if(['completed','paid','pagado','cobrado','refunded','devuelto'].includes(state))return Number(row.amount)<0||['refunded','devuelto'].includes(state)||row.payment_type==='refund'?'Devuelto':'Pagado';
  return row.status||'Sin estado confirmado';
 }
 function paymentGroups(rows){return {all:rows.slice(),paid:rows.filter(p=>paymentState(p)==='Pagado'),pending:rows.filter(p=>paymentState(p)==='Pendiente de pago'),refunds:rows.filter(p=>paymentState(p)==='Devuelto'),other:rows.filter(p=>['Anulado','Fallido'].includes(paymentState(p)))};}
 function allocations(payment){
  const meta=payment.metadata||{},group=meta.group_appointments;
  if(Array.isArray(group)&&group.length)return group.map(item=>({paymentId:payment.id,appointmentId:item.appointment_central_id||null,localAppointmentId:item.appointment_local_id||null,amount:Number.isFinite(Number(item.amount))?Number(item.amount):null}));
  return payment.appointment_id||meta.appointment_local_id?[{paymentId:payment.id,appointmentId:payment.appointment_id||null,localAppointmentId:meta.appointment_local_id||null,amount:Number(payment.amount)}]:[];
 }
 // El saldo se calcula sobre cargos expresos; no se deduce ningún cargo del estado asistencial.
 function chargeSummary(charges,payments,links){
  const byPayment=new Map(payments.map(p=>[text(p.id),p]));
  return charges.map(charge=>{
   let applied=0;for(const link of links.filter(x=>text(x.chargeId)===text(charge.id))){const p=byPayment.get(text(link.paymentId));if(p&&(paymentState(p)==='Pagado'||paymentState(p)==='Devuelto'&&Number(p.amount)<0))applied+=cents(link.amount);}
   const due=cents(charge.amount),remaining=Math.max(0,due-applied);
   return {...charge,paid:applied/100,remaining:remaining/100,paymentStatus:remaining===0?'Pagado':applied>0?'Pagado parcialmente':'Pendiente de pago'};
  });
 }
 // Lista cerrada: una respuesta financiera jamás puede sobrescribir status, fecha, profesional o servicios.
 const financialFields=['paymentStatus','cashMovementId','centralPaymentId','receiptNumber','receiptCode','invoiceNumber','paidAmount','paymentMethod','paymentMethodBreakdown','paidAt'];
 function applyPayment(appointment,fields){for(const key of financialFields)if(Object.hasOwn(fields,key))appointment[key]=fields[key];return appointment;}
 function paymentTiming(appointment){return appointmentState(appointment)==='En atención'?'consultation':pending(appointment)?'advance':appointmentState(appointment)==='Realizada'?'after_visit':'independent';}
 function operationType(payment){const meta=payment.metadata||{};if(payment.payment_type==='refund'||paymentState(payment)==='Devuelto')return 'Devolución';if(meta.payment_timing==='advance'||payment.payment_type==='deposit')return 'Pago anticipado';if(meta.payment_timing==='consultation')return 'Pago en consulta';if(meta.payment_timing==='after_visit')return 'Pago de servicio atendido';if(payment.payment_type==='partial')return 'Pago parcial';if(meta.operation_type==='adjustment')return 'Ajuste';return 'Pago';}
 function cancellationReview(appointment){
  const hasPayment=appointment.paymentStatus==='Cobrado'||Number(appointment.paidAmount)>0||appointment.centralPaymentId||appointment.historicalPaymentBasis;
  return hasPayment?'La cita está cancelada. El cobro se conserva y no se ha registrado ninguna devolución. ¿Quieres revisar si corresponde una devolución?':'';
 }
 window.atlasCareFinance=Object.freeze({appointmentState,appointmentGroups,paymentState,paymentGroups,allocations,chargeSummary,applyPayment,paymentTiming,operationType,cancellationReview});
})();
