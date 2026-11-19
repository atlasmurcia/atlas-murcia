/* Cargar en atlas.html, después de la conexión central. Sin claves añadidas. */
(function(){
 'use strict';
 const actions={mergePreview:'preview',mergeCommit:'commit',mergeUndo:'undo',mergeSearch:'search',mergeStatus:'status',mergeCapabilities:'capabilities',mergeResolve:'resolve'};
 window.addEventListener('message',async event=>{
  const m=event.data||{},frame=document.getElementById('fichaFrame');
  if(m.type!=='atlas:patient-merge-request'||event.origin!==location.origin||event.source!==frame?.contentWindow)return;
  const reply=result=>event.source.postMessage({type:'atlas:patient-merge-response',requestId:m.requestId,...result},event.origin);
  const context=window.ATLAS_CENTRAL_CONTEXT,action=actions[String(m.action||'').replace(/^patients:/,'')];
  if(!context||!action)return reply({ok:false,error:'Sesión o acción no válida.'});
  try{
   const {data,error}=await window.ATLAS_CENTRAL_DB.rpc('atlas_patient_merge',{action,payload:{...(m.payload||{}),organizationId:context.organizationId,clinicId:context.clinicId}});
   if(error)throw error;
   reply({ok:true,data});
   if(['commit','undo'].includes(action)){
    // La integración final debe invalidar además las cachés y colas de cada módulo.
    window.dispatchEvent(new CustomEvent('atlas:patient-merge-completed',{detail:{...data,action}}));
   }
  }catch(e){reply({ok:false,error:e.message||'No se pudo completar la operación.',code:e.code||''});}
 });
})();
