// Retira solo versiones anteriores. El contenido clínico no se modifica.
(function(root){
 'use strict';
 const fields='id,patient_id,record_type,content,occurred_at,created_at,updated_at,deleted_at';
 const compare=(a,b)=>String(b.occurred_at||b.created_at||'').localeCompare(String(a.occurred_at||a.created_at||''))||String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id));
 async function active(db,context,patientId){
  const rows=[];
  for(let offset=0;;offset+=500){
   const page=await db.from('clinical_records').select(fields).eq('organization_id',context.organizationId).eq('clinic_id',context.clinicId).eq('patient_id',patientId).eq('record_type','body_map').is('deleted_at',null).order('id',{ascending:true}).range(offset,offset+499);
   if(page.error)throw page.error;rows.push(...(page.data||[]));if((page.data||[]).length<500)break;
  }
  return rows.filter(row=>row.content?.record).sort(compare);
 }
 async function remove(db,context,payload){
  if(!context?.organizationId||!context?.clinicId||!context?.userId)throw new Error('La sesión no está preparada.');
  if(!(context.ownerAccess||context.managementAccess||context.permissions?.clinical_write===true))throw new Error('No tienes permiso para modificar registros clínicos.');
  const {patientId,versionId,currentVersionId}=payload||{};if(!patientId||!versionId||!currentVersionId)throw new Error('Falta identificar el paciente y las versiones del mapa.');
  const rows=await active(db,context,patientId),current=rows[0],target=rows.find(row=>String(row.id)===String(versionId));
  if(!current||String(current.id)!==String(currentVersionId))throw new Error('La versión actual ha cambiado. Actualiza el mapa antes de continuar.');
  if(String(versionId)===String(current.id))throw new Error('La versión actual del mapa no se puede eliminar.');
  if(!target)throw new Error('Esta versión anterior ya no está disponible. Actualiza el mapa.');
  let query=db.from('clinical_records').update({deleted_at:new Date().toISOString()}).eq('organization_id',context.organizationId).eq('clinic_id',context.clinicId).eq('patient_id',patientId).eq('record_type','body_map').eq('id',versionId).is('deleted_at',null);
  if(target.updated_at)query=query.eq('updated_at',target.updated_at);
  const result=await query.select('id,patient_id,record_type,deleted_at').maybeSingle();if(result.error)throw result.error;
  if(!result.data?.deleted_at)throw new Error('El servidor no ha confirmado la eliminación. Actualiza y vuelve a intentarlo.');
  return result.data;
 }
 const api={compare,active,remove};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.AtlasBodyMapVersions=api;
})(typeof window!=='undefined'?window:null);
