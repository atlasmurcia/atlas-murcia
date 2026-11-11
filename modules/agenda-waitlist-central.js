/* ATLAS Murcia · shared waitlist
   Stores the agenda waitlist in the authenticated Murcia database bridge.
   The old browser copy is imported once per browser and kept as a local backup. */
(()=>{
 const importMarker=()=>{const context=window.ATLAS_CHILD_CENTRAL_CONTEXT||{};return 'atlasMurciaSharedWaitlistImported_V1:'+String(context.organizationId||'')+':'+String(context.clinicId||'')};
 const imported=()=>{try{return localStorage.getItem(importMarker())==='1'}catch(error){return false}};
 const markImported=()=>{try{localStorage.setItem(importMarker(),'1')}catch(error){console.warn('No se pudo guardar la marca de importación local',error)}};
 const pending=new Map();let requestSeq=0,loadingPromise=null,syncReady=false,writeBusy=false;
 const notice=()=>document.getElementById('waitlistSyncNotice');
 function setNotice(message,error=false){
  let box=notice();
  if(!box){box=document.createElement('div');box.id='waitlistSyncNotice';box.className='callout';const list=document.getElementById('waitlistList');if(!list)return;list.parentNode.insertBefore(box,list)}
  box.textContent=message;box.style.borderColor=error?'#b42318':'#0b7fab';box.style.color=error?'#8b1e16':'';
 }
 function request(action,payload={}){
  const context=window.ATLAS_CHILD_CENTRAL_CONTEXT;
  if(!context?.organizationId||!context?.clinicId||!context?.userId)return Promise.reject(new Error('La sesión central de Murcia todavía no está preparada.'));
  return new Promise((resolve,reject)=>{
   const requestId='waitlist-'+Date.now()+'-'+(++requestSeq),timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('La conexión central no respondió a tiempo.'))},30000);
   pending.set(requestId,{resolve,reject,timer});parent.postMessage({type:'atlas:central-db-request',requestId,action,payload},'*');
  });
 }
 async function loadShared(){
  if(loadingPromise)return loadingPromise;
  loadingPromise=(async()=>{
   const local=Array.isArray(waitlist)?waitlist.map(entry=>({...entry})):[];
   let shared=await request('waitlist:list');
   if(!imported()){
    if(local.length){try{localStorage.setItem(importMarker()+':backup',JSON.stringify(local))}catch(error){console.warn('No se pudo crear la copia local de respaldo',error)}}
    for(let offset=0;offset<local.length;offset+=50)await request('waitlist:import',{entries:local.slice(offset,offset+50)});
    markImported();
    if(local.length)shared=await request('waitlist:list');
   }
   if(!Array.isArray(shared))throw new Error('La respuesta de la lista compartida no es válida.');
   const matched=new Set(waitlistMatchedIds.map(String));waitlist=shared.map(entry=>({...entry,createdAt:entry.createdAt||new Date().toISOString()}));
   waitlistMatchedIds=waitlist.filter(entry=>matched.has(String(entry.id))&&entry.status==='Activa').map(entry=>entry.id);save();refreshWaitlist();syncReady=true;
   setNotice('Lista de espera compartida · actualizada '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}));
   return waitlist;
  })().finally(()=>{loadingPromise=null});
  return loadingPromise;
 }
 function showOpen(){
  const back=document.getElementById('waitlistBack'),list=document.getElementById('waitlistList'),badge=document.getElementById('waitlistBadge');
  back.classList.add('open');if(!syncReady){badge.textContent='…';list.innerHTML='<div class="callout">Cargando la lista compartida de Murcia…</div>'}
  setNotice('Consultando la lista compartida de Murcia…');
  loadShared().catch(error=>{console.error('No se pudo cargar la lista compartida',error);if(!syncReady)list.innerHTML='<div class="callout">No se ha podido cargar la lista desde el servidor. No se muestra como vacía. Comprueba la conexión y vuelve a abrir la lista.</div>';setNotice('Error de conexión: no se han confirmado los datos compartidos.',true)});
 }
 const baseBookFromWaitlist=window.bookFromWaitlist;
 window.openWaitlist=showOpen;const waitlistButton=document.getElementById('waitlistBtn');if(waitlistButton)waitlistButton.onclick=showOpen;
 window.saveWaitlistEntry=async function(){
  if(!syncReady||writeBusy)return alert('Espera a que termine de cargar la lista compartida.');
  const editingId=window.atlasGetEditingWaitlistId?.()||'',previous=waitlist.find(entry=>String(entry.id)===String(editingId)),code=document.getElementById('wPatientCode').value,patient=patientByCode(code),patientText=document.getElementById('wPatient').value.trim();
  if(!patientText)return alert('Selecciona un paciente.');
  const startDate=document.getElementById('wStartDate').value,endDate=document.getElementById('wEndDate').value||startDate;
  if(!startDate||endDate<startDate)return alert('Revisa el rango de fechas.');
  const now=new Date().toISOString(),services=readWaitlistServices();
  const entry={id:editingId||'W'+Date.now()+'-'+Math.random().toString(36).slice(2,8),patientCode:code,patient:patient?.name||patientText,phone:patient?.phone||'',professional:document.getElementById('wProfessional').value,service:services[0]||'Cualquiera',services,startDate,endDate,startTime:document.getElementById('wStartTime').value,endTime:document.getElementById('wEndTime').value,duration:Number(document.getElementById('wDuration').value),bookedDate:document.getElementById('wBookedDate').value,notes:document.getElementById('wNotes').value.trim(),status:previous?.status||'Activa',createdAt:previous?.createdAt||now,updatedAt:now};
  writeBusy=true;const button=document.getElementById('saveWaitBtn');if(button)button.disabled=true;
  try{await request('waitlist:save',{entry});if(previous)Object.assign(previous,entry);else waitlist.push(entry);window.atlasClearEditingWaitlistId?.();logAgenda(previous?'Modificada preferencia de la lista de espera':'Añadido a lista de espera: '+entry.patient);save();document.getElementById('waitForm').classList.add('hidden');refreshWaitlist();setNotice('Cambio guardado en la lista compartida de Murcia.')}
  catch(error){console.error('No se pudo guardar en la lista compartida',error);alert('No se ha guardado la preferencia en el servidor. '+error.message)}
  finally{writeBusy=false;if(button)button.disabled=false}
 };
 if(typeof saveWaitBtn!=='undefined')saveWaitBtn.onclick=window.saveWaitlistEntry;
 window.setWaitlistStatus=async function(id,status){
  if(!syncReady||writeBusy)return alert('Espera a que termine de cargar la lista compartida.');
  const entry=waitlist.find(item=>String(item.id)===String(id));if(!entry)return;
  const updated={...entry,status,updatedAt:new Date().toISOString()};writeBusy=true;
  try{await request('waitlist:save',{entry:updated});Object.assign(entry,updated);waitlistMatchedIds=waitlistMatchedIds.filter(value=>value!==id);save();refreshWaitlist();setNotice('Cambio guardado en la lista compartida de Murcia.')}
  catch(error){console.error('No se pudo actualizar la lista compartida',error);alert('No se ha actualizado la lista compartida. '+error.message)}
  finally{writeBusy=false}
 };
 window.deleteWaitlist=async function(id){
  if(!confirm('¿Eliminar esta preferencia de la lista de espera?'))return;
  if(!syncReady||writeBusy)return alert('Espera a que termine de cargar la lista compartida.');
  writeBusy=true;
  try{await request('waitlist:delete',{id:String(id)});waitlist=waitlist.filter(entry=>String(entry.id)!==String(id));waitlistMatchedIds=waitlistMatchedIds.filter(value=>value!==id);save();refreshWaitlist();setNotice('Preferencia eliminada de la lista compartida de Murcia.')}
  catch(error){console.error('No se pudo eliminar de la lista compartida',error);alert('No se ha eliminado la preferencia en el servidor. '+error.message)}
  finally{writeBusy=false}
 };
 window.bookFromWaitlist=async function(id){
  if(!syncReady||writeBusy)return alert('Espera a que termine de cargar la lista compartida.');
  const entry=waitlist.find(item=>String(item.id)===String(id));if(!entry)return;
  const updated={...entry,status:'Contactado',updatedAt:new Date().toISOString()};writeBusy=true;
  try{await request('waitlist:save',{entry:updated});Object.assign(entry,updated);save();setNotice('Cambio guardado en la lista compartida de Murcia.');baseBookFromWaitlist(id)}
  catch(error){console.error('No se pudo actualizar la lista compartida',error);alert('No se ha podido continuar desde esta preferencia. '+error.message)}
  finally{writeBusy=false}
 };
 window.addEventListener('message',event=>{
  const message=event.data||{},item=pending.get(message.requestId);
  if(message.type!=='atlas:central-db-response'||!item)return;
  pending.delete(message.requestId);clearTimeout(item.timer);
  message.ok?item.resolve(message.data):item.reject(Object.assign(new Error(message.error||'Error en el servidor central'),{code:message.code||''}));
 });
 setInterval(()=>{
  const back=document.getElementById('waitlistBack'),form=document.getElementById('waitForm');
  if(!document.hidden&&back?.classList.contains('open')&&form?.classList.contains('hidden')&&!loadingPromise&&!writeBusy)loadShared().catch(error=>{console.warn('No se pudo actualizar la lista compartida',error);setNotice('No se ha podido actualizar. Se conserva la última lista confirmada.',true)});
 },20000);
})();
