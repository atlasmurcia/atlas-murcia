// Resuelve el conjunto de fichas relacionadas sin cambiar los UUID de los historiales.
(function(root){
 'use strict';
 const unavailable=error=>{
  const code=String(error?.code||''),message=String(error?.message||error||'');
  return code==='PGRST202'||code==='42883'||/could not find the function[^\n]*atlas_patient_merge|function[^\n]*atlas_patient_merge[^\n]*(does not exist|not found)|schema cache[^\n]*atlas_patient_merge/i.test(message);
 };
 async function recordIds(db,context,patientId){
  const id=String(patientId||'').trim();
  if(!id)return {canonicalId:'',ids:[],error:{message:'Falta identificar al paciente.'}};
  if(!db?.rpc)return {canonicalId:id,ids:[id],error:null};
  const response=await db.rpc('atlas_patient_merge',{action:'recordIds',payload:{id,organizationId:context?.organizationId,clinicId:context?.clinicId}});
  if(response.error){
   if(unavailable(response.error))return {canonicalId:id,ids:[id],error:null};
   return {canonicalId:'',ids:[],error:response.error};
  }
  const canonicalId=String(response.data?.canonicalId||'').trim();
  const ids=[...new Set((Array.isArray(response.data?.patientIds)?response.data.patientIds:[]).map(value=>String(value||'').trim()).filter(Boolean))];
  if(!canonicalId||!ids.includes(canonicalId)||!ids.includes(id))return {canonicalId:'',ids:[],error:{message:'El servidor devolvió una relación de fichas incompleta. Actualiza la página y avisa a Gestión.'}};
  return {canonicalId,ids,error:null};
 }
 async function groups(db,context){
  if(!db?.rpc)return {groups:[],error:null};
  const response=await db.rpc('atlas_patient_merge',{action:'families',payload:{organizationId:context?.organizationId,clinicId:context?.clinicId}});
  if(response.error)return unavailable(response.error)?{groups:[],error:null}:{groups:[],error:response.error};
  if(!Array.isArray(response.data))return {groups:[],error:{message:'El servidor devolvió un resumen de fichas inválido.'}};
  const groups=[];
  for(const row of response.data){
   const canonicalId=String(row?.canonicalId||'').trim(),ids=[...new Set((Array.isArray(row?.patientIds)?row.patientIds:[]).map(value=>String(value||'').trim()).filter(Boolean))];
   if(!canonicalId||!ids.includes(canonicalId))return {groups:[],error:{message:'El servidor devolvió un resumen de alias incompleto.'}};
   groups.push({canonicalId,ids});
  }
  return {groups,error:null};
 }
 const api={recordIds,groups};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.AtlasPatientAliases=api;
})(typeof window!=='undefined'?window:null);
