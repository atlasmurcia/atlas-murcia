// Copias independientes: solo se heredan los datos de reserva, nunca su identidad o cobros.
(()=>{
 const $=id=>document.getElementById(id);
 const trigger=$('duplicateAppointmentBtn');if(!trigger)return;
 let source=null,rows=[],busy=false;
 const style=document.createElement('style');style.textContent=`
 #duplicateAppointmentsBack{z-index:10060;padding:16px}
 #duplicateAppointmentsBack .modal{width:min(820px,96vw);max-height:90vh;overflow:auto}
 .duplicate-row{display:grid;grid-template-columns:minmax(130px,1fr) minmax(110px,1fr) auto;gap:10px;align-items:end;padding:12px 0;border-bottom:1px solid #dce4eb}
 .duplicate-row .duplicate-state{grid-column:1/-1;margin:0;white-space:pre-wrap}
 #duplicateAppointmentSummary{white-space:pre-wrap;overflow-wrap:anywhere}
 #duplicateAppointmentsMessage{white-space:pre-wrap}
 @media(max-width:520px){.duplicate-row{grid-template-columns:1fr 1fr}.duplicate-row button{grid-column:1/-1}}
 `;document.head.appendChild(style);
 const back=document.createElement('div');back.id='duplicateAppointmentsBack';back.className='modalback';back.innerHTML=`
 <section class="modal" role="dialog" aria-modal="true" aria-labelledby="duplicateAppointmentsTitle">
 <h2 id="duplicateAppointmentsTitle">Duplicar cita en varios días</h2>
 <p>Elige los días y ajusta la hora de cada copia. Se crearán citas pendientes e independientes, con el mismo paciente, servicios, fisioterapeuta, duración y observaciones.</p>
 <div class="callout" id="duplicateAppointmentSummary"></div>
 <div id="duplicateAppointmentRows"></div>
 <button type="button" id="addDuplicateAppointmentDay" style="margin-top:12px">＋ Añadir día</button>
 <p id="duplicateAppointmentsMessage" role="status" aria-live="polite"></p>
 <div class="actions"><button type="button" class="primary" id="saveDuplicateAppointments">Crear citas duplicadas</button><button type="button" id="closeDuplicateAppointments">Cerrar</button></div>
 </section>`;document.body.appendChild(back);
 const message=text=>$('duplicateAppointmentsMessage').textContent=text;
 function nextDay(date){const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+1);return value.toISOString().slice(0,10)}
 function makeCopy(original,date,time){
  const services=[...(original.services?.length?original.services:[original.therapy])].filter(Boolean);
  const therapists={...original.therapists};
  for(const service of services)if(serviceCompetency(service)&&!therapists[service]&&original.professional)therapists[service]=original.professional;
  const id='duplicate-'+crypto.randomUUID();
  return {id,centralRef:'atlas-'+id,patient:original.patient,patientCode:original.patientCode,patientRemoteId:original.patientRemoteId,
   therapy:services[0],services,professional:original.professional||'',therapists,
   resource:original.resource||'',resources:[...(original.resources||[original.resource])].filter(Boolean),
   date,time,duration:Number(original.duration),endTime:timeStr(mins(time)+Number(original.duration)),notes:original.notes||'',
   status:'Pendiente',history:[],forced:false,forceReason:'',conflictOverride:false,planConflict:false,
   duplicatedFrom:original.centralId||original.centralRef||String(original.id)};
 }
 function paint(){
  const list=$('duplicateAppointmentRows');list.replaceChildren();
  rows.forEach((row,index)=>{
   const box=document.createElement('div');box.className='duplicate-row';
   for(const [key,type,label] of [['date','date','Fecha'],['time','time','Hora de inicio']]){
    const field=document.createElement('label');field.className='field';field.textContent=label+' · copia '+(index+1);
    const input=document.createElement('input');input.type=type;input.value=row[key];input.required=true;
    if(type==='time')input.step='60';input.disabled=busy||row.locked;
    input.setAttribute('aria-label',label+' de la copia '+(index+1));
    input.oninput=()=>{row[key]=input.value;row.appointment=null;row.error='';box.querySelector('.duplicate-state').textContent=row.time?'Finaliza a las '+timeStr(mins(row.time)+Number(source.duration))+' · '+source.duration+' min':'';message('');};field.appendChild(input);box.appendChild(field);
   }
   const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar día';remove.disabled=busy||row.locked;
   remove.onclick=()=>{rows.splice(index,1);paint();};box.appendChild(remove);
   const state=document.createElement('p');state.className='small duplicate-state';
   state.textContent=row.saved?'✓ Cita creada':row.error||(row.locked?'Pendiente de confirmar. Pulsa Reintentar para comprobar la misma cita.':'Finaliza a las '+timeStr(mins(row.time)+Number(source.duration))+' · '+source.duration+' min');
   box.appendChild(state);list.appendChild(box);
  });
  $('saveDuplicateAppointments').disabled=busy||!rows.some(row=>!row.saved);
  $('saveDuplicateAppointments').textContent=busy?'Guardando citas…':rows.some(row=>row.locked&&!row.saved)?'Reintentar citas pendientes':'Crear citas duplicadas';
  $('addDuplicateAppointmentDay').disabled=busy||rows.some(row=>row.locked&&!row.saved);
  $('closeDuplicateAppointments').disabled=busy;
 }
 function addDay(){const last=rows.at(-1);rows.push({date:nextDay(last?.date||source.date),time:source.time,locked:false,saved:false,error:'',appointment:null});paint();}
 function validationError(appointment,pending){
  const {date,time,duration}=appointment;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)return 'Selecciona una fecha válida.';
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isFinite(duration)||duration<=0||mins(time)+duration>=1440)return 'Indica una hora válida que permita finalizar la cita en el mismo día.';
  if(!appointment.patientCode||!patientByCode(appointment.patientCode))return 'Selecciona una ficha de paciente válida en la cita original.';
  if(!appointment.services.length)return 'La cita original necesita al menos un servicio.';
  for(const service of appointment.services){
   if(serviceCompetency(service)&&!qualifiedProfessionals(service).includes(appointment.therapists[service]))return 'El fisioterapeuta original no está disponible para '+service+'. Revisa la asignación antes de duplicar.';
  }
  const block=blockFor(appointment);if(block)return 'Horario bloqueado: '+(block.reason||'elige otro día u otra hora.');
  const schedule=appointmentWithinAllTherapistSchedules(appointment);if(!schedule.ok)return schedule.prof+' no trabaja en ese tramo. Elige otro día u otra hora.';
  const otherCopies=pending.filter(other=>other.id!==appointment.id&&!appointments.some(saved=>saved.id===other.id));
  if(conflictsFor(appointment).length||conflictsInSet(appointment,[...appointments.filter(other=>other.id!==appointment.id),...otherCopies]).length)return 'Esta copia se solapa con otra cita o copia. Elige otra fecha u hora.';
  return '';
 }
 trigger.onclick=()=>{
  if(busy)return;
  if(!rows.some(row=>row.locked&&!row.saved)){
   const selected=appointments.find(appointment=>appointment.id===selectedId);if(!selected)return;
   source=JSON.parse(JSON.stringify(selected));rows=[];
   $('duplicateAppointmentSummary').textContent=[source.patient,(source.services||[source.therapy]).join(' + '),[...new Set([...Object.values(source.therapists||{}),source.professional].filter(Boolean))].join(' · '),source.duration+' min · '+source.time+' · Original: '+source.date,source.notes||'Sin observaciones'].join('\n');
   message('La cita original se conserva. Las copias no se crearán hasta pulsar «Crear citas duplicadas».');addDay();
  }else message('Hay copias pendientes de confirmar. Reintenta estas mismas citas antes de iniciar otra duplicación.');
  $('drawer').classList.remove('open');back.classList.add('open');paint();
  back.querySelector('input:not(:disabled)')?.focus();
 };
 $('addDuplicateAppointmentDay').onclick=addDay;
 $('closeDuplicateAppointments').onclick=()=>{if(!busy)back.classList.remove('open');};
 back.addEventListener('keydown',event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();back.classList.remove('open');}});
 $('saveDuplicateAppointments').onclick=async()=>{
  if(busy)return;
  const pending=rows.filter(row=>!row.saved);if(!pending.length)return;
  for(const row of pending)if(!row.appointment)row.appointment=makeCopy(source,row.date,row.time);
  const candidates=pending.map(row=>row.appointment);
  let invalid=false;
  for(const row of pending){
   // Una respuesta perdida se confirma con la misma referencia, sin cambiar la reserva.
   if(row.locked)continue;
   row.error=validationError(row.appointment,candidates);if(row.error)invalid=true;
  }
  if(invalid){message('Revisa las copias indicadas. No se ha creado ninguna cita nueva.');paint();return;}
  busy=true;paint();message('Guardando las citas en el servidor…');
  try{
   for(const row of pending){
    if(!row.locked){const error=validationError(row.appointment,[]);if(error){row.error=error;break;}}
    if(typeof window.atlasPersistAppointmentCentral!=='function')throw new Error('Espera a que termine de cargar la agenda central.');
    row.locked=true;row.error='';row.appointment.history=[{at:new Date().toISOString(),user:agendaActorName(),action:'Cita creada por duplicación'}];
    try{await window.atlasPersistAppointmentCentral(row.appointment);}
    catch(error){row.error='No se ha confirmado esta copia. Reintenta para comprobar la misma cita: '+(error.message||'Error de conexión');break;}
    row.saved=true;
    const index=appointments.findIndex(appointment=>appointment.id===row.appointment.id);
    if(index<0)appointments.push(row.appointment);else appointments[index]=row.appointment;
    save();render();
   }
   const count=rows.filter(row=>row.saved).length;
   message(count===rows.length?'✓ '+count+' cita(s) creadas. Cada una se puede editar o cancelar por separado.':count+' de '+rows.length+' cita(s) confirmadas. Revisa las filas pendientes; las ya creadas no se repetirán.');
  }catch(error){message('No se pudo completar la duplicación: '+(error.message||'Error desconocido'));}
  finally{busy=false;paint();}
 };
})();
