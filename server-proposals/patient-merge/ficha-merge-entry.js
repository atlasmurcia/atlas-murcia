/* Cargar al final de ficha.html junto a los estilos y controlador. Oculto si no hay backend validado. */
(function(){
 'use strict';
 let scope=null,current=null,instance=null;const pending=new Map();
 function request(action,payload={}){return new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(requestId);reject(Error('La respuesta se ha interrumpido. Comprueba el estado de la operación.'));},30000);
  pending.set(requestId,{resolve,reject,timer});parent.postMessage({type:'atlas:patient-merge-request',requestId,action,payload},location.origin);
 });}
 const button=document.createElement('button');button.className='btn';button.textContent='Fusionar ficha duplicada';button.hidden=true;
 document.querySelector('.hero .actions')?.append(button);
 const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1140px,96vw);max-height:92vh;overflow:auto;border:1px solid #b9ced9;border-radius:15px;padding:24px';
 const close=document.createElement('button');close.textContent='Cerrar';close.className='btn';close.style.float='right';dialog.append(close);
 const body=document.createElement('div');dialog.append(body);document.body.append(dialog);
 close.onclick=()=>{if(instance?.flow.busy)return;dialog.close();};dialog.addEventListener('cancel',e=>{if(instance?.flow.busy)e.preventDefault();});
 button.onclick=()=>{if(!current?.remoteId||!scope)return;instance?.destroy();instance=mountPatientMerge(body,{request,scope,currentPatientId:current.remoteId,onChanged:()=>{button.hidden=true;}});dialog.showModal();};
 window.addEventListener('message',async e=>{
  if(e.origin!==location.origin||e.source!==parent)return;const m=e.data||{};
  if(m.type==='atlas:patient-merge-response'&&pending.has(m.requestId)){
   const p=pending.get(m.requestId);pending.delete(m.requestId);clearTimeout(p.timer);m.ok?p.resolve(m.data):p.reject(Object.assign(Error(m.error),{code:m.code}));return;
  }
  if(m.type==='atlas:load-patient'&&m.patient){current=m.patient;button.hidden=!scope||!current.remoteId;}
  if(m.type==='atlas:central-ready'){
   button.hidden=true;scope=null;
   try{const capabilities=await request('patients:mergeCapabilities');if(capabilities.enabled){scope={organizationId:m.organizationId,clinicId:m.clinicId};button.hidden=!current?.remoteId;}}catch(e){/* No ofrecer una acción que el servidor no ha habilitado. */}
  }
 });
})();
