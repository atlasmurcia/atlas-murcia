/* Transporte autenticado. La base de datos decide permisos y disponibilidad. */
(function(){
 'use strict';
 const actions={mergePreview:'preview',mergeCommit:'commit',mergeUndo:'undo',mergeSearch:'search',mergeStatus:'status',mergeCapabilities:'capabilities'};
 const scopeKey=c=>c?[c.userId,c.organizationId,c.clinicId].join(':'):'';
 window.addEventListener('message',async event=>{
  const m=event.data||{},frame=document.getElementById('fichaFrame');
  if(m.type!=='atlas:patient-merge-request'||event.origin!==location.origin||event.source!==frame?.contentWindow||typeof m.requestId!=='string')return;
  const context=window.ATLAS_CENTRAL_CONTEXT,key=scopeKey(context),action=actions[String(m.action||'').replace(/^patients:/,'')];
  const reply=result=>{if(event.source===document.getElementById('fichaFrame')?.contentWindow)event.source.postMessage({type:'atlas:patient-merge-response',requestId:m.requestId,...result},event.origin);};
  if(!context||!action||!window.ATLAS_CENTRAL_DB?.rpc)return reply({ok:false,error:'La sesión no está preparada.',definitive:true});
  if(!m.scope||scopeKey(m.scope)!==key)return reply({ok:false,error:'La sesión ha cambiado. Vuelve a abrir la ficha.',definitive:true});
  try{
   const payload={...(m.payload||{}),organizationId:context.organizationId,clinicId:context.clinicId};
   const {data,error}=await window.ATLAS_CENTRAL_DB.rpc('atlas_patient_merge',{action,payload});
   if(error){const transport=/^PGRST00[0-3]$/.test(String(error.code||''))||!error.code;return reply({ok:false,error:error.message||'No se pudo completar la operación.',code:error.code||'',definitive:!transport});}
   if(scopeKey(window.ATLAS_CENTRAL_CONTEXT)!==key)return reply({ok:false,error:'La sesión ha cambiado. Comprueba el resultado al volver a entrar.',definitive:false});
   reply({ok:true,data});
   if((action==='commit'&&data?.verified&&data?.mergeId)||(action==='undo'&&data?.verified&&data?.reverted))
    window.dispatchEvent(new CustomEvent('atlas:patient-merge-completed',{detail:{...data,action}}));
  }catch(error){reply({ok:false,error:error.message||'Se ha interrumpido la conexión. Comprueba el estado.',definitive:false});}
 });
})();
