/* El botón solo aparece tras la comprobación del servidor para esta sesión. */
(function(){
 'use strict';
 let scope=null,current=null,instance=null,generation=0,changedPatientId=null;const pending=new Map();
 const key=c=>c?[c.userId,c.organizationId,c.clinicId].join(':'):'';
 function request(action,payload={}){
  const requestScope=scope&&{...scope};
  if(!requestScope)return Promise.reject(Object.assign(Error('La sesión no está preparada.'),{definitive:true}));
  return new Promise((resolve,reject)=>{
   const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(requestId);reject(Error('La respuesta se ha interrumpido. Comprueba el estado de la operación.'));},30000);
   pending.set(requestId,{resolve,reject,timer,scopeKey:key(requestScope)});
   parent.postMessage({type:'atlas:patient-merge-request',requestId,action,payload,scope:requestScope},location.origin);
  });
 }
 const button=document.createElement('button');button.type='button';button.className='btn';button.id='atlasMergePatient';button.textContent='Fusionar ficha duplicada';button.hidden=true;
 document.querySelector('.hero .actions')?.append(button);
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Fusionar fichas duplicadas');dialog.className='atlas-patient-merge-dialog';
 const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.className='btn pm-close';dialog.append(close);
 const body=document.createElement('div');dialog.append(body);document.body.append(dialog);
 function closeDialog(){if(instance?.flow.busy||instance?.flow.uncertain)return;dialog.close();if(changedPatientId){parent.postMessage({type:'atlas:patient-merge-open',patientId:changedPatientId},location.origin);changedPatientId=null;}}
 close.onclick=closeDialog;dialog.addEventListener('cancel',e=>{if(instance?.flow.busy||instance?.flow.uncertain)e.preventDefault();});
 button.onclick=()=>{
  if(!current?.remoteId||!scope||dialog.open)return;
  instance?.destroy();const patientId=current.remoteId,session=key(scope);
  instance=mountPatientMerge(body,{request,scope:{...scope},currentPatientId:patientId,onChanged:result=>{
   if(key(scope)!==session||current?.remoteId!==patientId)return;
   changedPatientId=result.reverted?patientId:result.primaryId;button.hidden=true;parent.postMessage({type:'atlas:patient-merge-view-changed',result},location.origin);
  }});dialog.showModal();
 };
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==parent)return;const m=event.data||{};
  if(m.type==='atlas:patient-merge-response'){
   const p=pending.get(m.requestId);if(!p)return;
   pending.delete(m.requestId);clearTimeout(p.timer);
   if(p.scopeKey!==key(scope))return p.reject(Error('La sesión ha cambiado. Comprueba el estado al volver a entrar.'));
   m.ok?p.resolve(m.data):p.reject(Object.assign(Error(m.error||'No se pudo completar la operación.'),{code:m.code,definitive:m.definitive===true}));return;
  }
  if(m.type==='atlas:load-patient'){
   if(current?.remoteId!==m.patient?.remoteId){dialog.close();instance?.destroy();instance=null;}
   current=m.patient||null;button.hidden=true;
   if(scope)checkCapabilities();
  }
  if(m.type==='atlas:central-ready'){
   const next={userId:m.userId,organizationId:m.organizationId,clinicId:m.clinicId};
   if(!next.userId||!next.organizationId||!next.clinicId)return;
   if(key(next)!==key(scope)){dialog.close();instance?.destroy();instance=null;}
   scope=next;button.hidden=true;checkCapabilities();
  }
 });
 async function checkCapabilities(){
  const seq=++generation,session=key(scope),patient=current?.remoteId;
  try{const capabilities=await request('patients:mergeCapabilities');
   if(seq===generation&&session===key(scope)&&patient===current?.remoteId)button.hidden=!(capabilities?.enabled===true&&capabilities?.contract==='atlas-alias-preserved-v1'&&patient);
  }catch(error){if(seq===generation)button.hidden=true;}
 }
 parent.postMessage({type:'atlas:central-module-ready',module:'ficha'},location.origin);
})();
