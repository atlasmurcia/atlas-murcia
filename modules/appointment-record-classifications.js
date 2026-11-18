// Correcciones administrativas de lectura; nunca actualiza la cita histórica ni su pago.
(()=>{
 window.atlasLoadAppointmentRecordClassifications=async function(db,context){
  if(!context?.organizationId||!context?.clinicId)throw Error('Falta el ámbito de la clínica.');
  const result=await db.from('clinic_settings').select('payload').eq('organization_id',context.organizationId).eq('clinic_id',context.clinicId).eq('section','appointment_record_classifications').maybeSingle();
  if(result.error)throw result.error;
  const payload=result.data?.payload||{version:1,records:[]};
  window.atlasSetAppointmentRecordClassifications(payload);
  return payload;
 };
})();
