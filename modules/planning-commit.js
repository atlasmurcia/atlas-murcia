(function(root){
 'use strict';
 const arraysEqual=(a,b)=>JSON.stringify([...(a||[])].sort())===JSON.stringify([...(b||[])].sort());
 function verify(expected,result){
  if(!result||result.appliedCount!==expected.length||!Array.isArray(result.appointments)||result.appointments.length!==expected.length)throw new Error('El servidor no ha confirmado todas las citas. Conserva el borrador y comprueba el plan antes de reintentar.');
  const confirmed=new Map(result.appointments.map(row=>[row.client_ref,row]));
  if(confirmed.size!==expected.length)throw new Error('La confirmación contiene citas repetidas.');
  for(const row of expected){const saved=confirmed.get(row.client_ref);
   if(!saved?.id||!saved.updated_at||saved.patient_id!==row.patient_id||new Date(saved.starts_at).getTime()!==new Date(row.starts_at).getTime()||new Date(saved.ends_at).getTime()!==new Date(row.ends_at).getTime()||saved.status!=='pending'||saved.deleted_at||!arraysEqual(saved.services,row.services)||!arraysEqual(saved.resources,row.resources)||!arraysEqual(saved.professionals,row.professionals)||String(saved.metadata?.planId)!==String(row.metadata?.planId)||Number(saved.metadata?.professional_minutes)!==Number(row.metadata?.professional_minutes))throw new Error('La confirmación no coincide con el borrador completo. Revisa la agenda antes de continuar.');
   if(row.metadata?.pumpCourseId&&(saved.notes!==row.notes||['pumpCourseId','pumpNumber','pumpZone','pumpSession','budgetId'].some(key=>saved.metadata?.[key]!==row.metadata[key])))throw new Error('La confirmación no conserva la pauta, la zona y las observaciones de la bomba. Revisa la agenda antes de continuar.');
  }
  return expected.map(row=>confirmed.get(row.client_ref));
 }
 function resourceKey(value){const n=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');if(n.includes('magneto'))return'magnetophysio';if(n.includes('bomba'))return'bombadiamagnetica';if(n.includes('enrique'))return'aitoringlesbarrena';return n;}
 function reservation(row,localParts,resources,professionals){
  const start=localParts(row.starts_at),canonical=value=>{const key=resourceKey(value);return [...resources,...professionals].find(name=>resourceKey(name)===key)||String(value||'');},assigned=[...new Set((row.professionals||[]).map(canonical))];
  return{id:row.client_ref||row.id,centralId:row.id,centralRef:row.client_ref||row.id,date:start.date,time:start.time,duration:Math.max(1,Math.round((new Date(row.ends_at)-new Date(row.starts_at))/60000)),resources:[...new Set((row.resources||[]).map(canonical))],professional:assigned[0]||'',therapists:Object.fromEntries(assigned.map((name,i)=>['reservation-'+i,name])),professional_minutes:row.professional_minutes===null||row.professional_minutes===undefined?null:Number(row.professional_minutes),patient:'Reserva de agenda',patientCode:'reservation:'+row.id,status:'Pendiente',therapy:'Reserva de agenda',services:[]};
 }
 const api={verify,reservation,resourceKey};root.atlasPlanningCommit=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
