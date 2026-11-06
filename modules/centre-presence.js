/* Presencia operativa confirmada en las citas centrales de Murcia. */
(function(root){
 'use strict';
 const patientKey=a=>a.patientRemoteId?'id:'+a.patientRemoteId:a.patientCode?'code:'+a.patientCode:'appointment:'+(a.centralId||a.id);
 function today(now=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}
 function bounds(date){const start=Date.parse(date+'T00:00:00Z'),midnight=value=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));const local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);return new Date(value-(local-value)).toISOString()};return{from:midnight(start),to:midnight(start+86400000)}}
 function summarize(rows,date){
  const groups=new Map();
  for(const a of rows){
   if(a.date!==date||a.status!=='En sala'||a.deleted_at)continue;
   const presence=a.centerPresence||a.metadata?.centerPresence||{},stage=['waiting','treating','left'].includes(presence.stage)?presence.stage:'waiting',attendance=a.attendance||a.metadata?.attendance||{};
   const eventAt=Date.parse(presence.updatedAt||attendance.arrivedAt||'')||0,key=patientKey(a),previous=groups.get(key);
   if(!previous||eventAt>previous.eventAt||eventAt===previous.eventAt&&a.centralId>previous.appointment.centralId)groups.set(key,{key,stage,eventAt,appointment:a,resource:presence.resource||'',arrivedAt:presence.arrivedAt||attendance.arrivedAt||'',waitingSince:presence.waitingSince||presence.arrivedAt||attendance.arrivedAt||''});
  }
  const patients=[...groups.values()].filter(x=>x.stage!=='left').sort((a,b)=>(Date.parse(a.arrivedAt)||Infinity)-(Date.parse(b.arrivedAt)||Infinity));
  return{patients,waiting:patients.filter(x=>x.stage==='waiting'),treating:patients.filter(x=>x.stage==='treating'),total:patients.length};
 }
 const api={patientKey,today,bounds,summarize};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.AtlasCentrePresence=api;
 if(typeof window==='undefined'||typeof appointments==='undefined')return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clock=value=>value?new Date(value).toLocaleTimeString('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit'}):'sin hora registrada';
 let rows=[],loaded=false,lastUpdated='',loadError='',busy=false,inflight=null,reloadTimer=null;
 const panel=document.getElementById('waitingBack'),list=document.getElementById('waitingList'),button=document.getElementById('waitingRoomBtn');
 if(!panel||!list||!button)return;
 const style=document.createElement('style');style.textContent='.centre-kpis{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.centre-kpis>div{flex:1;min-width:140px;background:#eef8fc;padding:12px;border-radius:10px}.centre-kpis b{display:block;font-size:26px;color:#086d98}.centre-patient{border:1px solid #dce4eb;border-left:5px solid #e59a00;border-radius:10px;margin:10px 0;padding:12px}.centre-patient.treating{border-left-color:#0b7fb0;background:#f1faff}.centre-patient .actions{margin-top:10px}.centre-patient select{max-width:100%}.centre-state{font-size:12px;margin:8px 0;color:#526674}.centre-state.error{color:#a32b24}.centre-status{font-weight:700;color:#086d98}';document.head.appendChild(style);
 const description=panel.querySelector('.small');if(description)description.textContent='Hoy · Llegadas e inicio de tratamiento registrados por el equipo y confirmados en el servidor. La hora prevista de la cita no cambia la presencia.';
 const state=document.createElement('div');state.className='centre-state';state.setAttribute('role','status');list.before(state);
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Actualizar';refresh.onclick=()=>load();document.getElementById('closeWaitingBtn').before(refresh);
 function activeFor(key){return rows.filter(a=>a.date===today()&&patientKey(a)===key&&['Pendiente','Confirmada','En sala'].includes(a.status)&&!a.historico&&!a.metadata?.historico)}
 function resourcesFor(a){const assigned=[...(a.resources||[a.resource]).filter(Boolean)],known=typeof equipment==='undefined'?[]:equipment;return [...new Set(assigned.filter(value=>known.includes(value)))]}
 function snapshot(){return summarize(rows,today())}
 function paint(){
  const summary=snapshot(),badge=document.getElementById('waitingBadge');
  if(badge)badge.textContent=loaded?String(summary.total):'—';
  let detail=document.getElementById('centrePresenceDetail');if(!detail){detail=document.createElement('span');detail.id='centrePresenceDetail';detail.style.cssText='margin-left:7px;font-weight:600';button.append(detail)}detail.textContent=loaded?' · '+summary.treating.length+' en tratamiento · '+summary.waiting.length+' en espera':'';
  state.className='centre-state'+(loadError?' error':'');state.textContent=busy?'Guardando en el servidor…':loadError?'No se ha podido actualizar. '+(lastUpdated?'Última confirmación: '+clock(lastUpdated)+'. ':'')+loadError:loaded?'Actualizado a las '+clock(lastUpdated)+' · Se comprueba cada 30 segundos.':'Cargando presencia central…';
  const alertBox=document.getElementById('waitingAlert');if(alertBox){alertBox.className=loaded&&summary.waiting.length?'waiting-alert':'waiting-alert hidden';if(loaded&&summary.waiting.length)alertBox.innerHTML='<div><b>'+summary.waiting.length+' pacientes en sala de espera</b></div><button type="button" data-centre-open>Ver pacientes</button>';alertBox.querySelector('[data-centre-open]')?.addEventListener('click',open)}
  if(!loaded){list.innerHTML='<div class="callout">Esperando confirmación del servidor. No se muestra un cero sin comprobar los datos.</div>';return}
  list.innerHTML='<div class="centre-kpis"><div><span>En el centro</span><b>'+summary.total+'</b></div><div><span>En tratamiento</span><b>'+summary.treating.length+'</b></div><div><span>Sala de espera</span><b>'+summary.waiting.length+'</b></div></div>'+(summary.patients.map((patient,index)=>{
   const a=patient.appointment,choices=activeFor(patient.key),options=choices.map(choice=>'<option value="'+esc(choice.centralId||choice.id)+'" '+(String(choice.centralId||choice.id)===String(a.centralId||a.id)?'selected':'')+'>'+esc(choice.time+' · '+(choice.services||[choice.therapy]).filter(Boolean).join(' + '))+'</option>').join('');
   return '<article class="centre-patient '+patient.stage+'" data-centre-key="'+index+'"><b>'+esc(a.patient)+'</b><div class="centre-status">'+(patient.stage==='treating'?'En tratamiento · '+esc(patient.resource||'Equipo no indicado'):'Sala de espera')+'</div><div class="small">Llegada: '+esc(clock(patient.arrivedAt))+'</div>'+(choices.length?'<div class="actions"><label>Cita <select data-centre-appointment>'+options+'</select></label><label>Tratamiento <select data-centre-resource></select></label></div><div class="actions"><button type="button" class="primary" data-centre-stage="treating">'+(patient.stage==='treating'?'Cambiar tratamiento':'Iniciar tratamiento')+'</button>'+(patient.stage==='treating'?'<button type="button" data-centre-stage="waiting">Volver a espera</button>':'')+'<button type="button" data-centre-stage="left">Salir del centro</button></div>':'<div class="small">Esta cita está protegida; no se puede cambiar desde este panel.</div>')+'</article>';
  }).join('')||'<div class="callout">No hay pacientes con llegada activa registrada hoy.</div>');
  list.querySelectorAll('[data-centre-key]').forEach(card=>{
   const patient=summary.patients[Number(card.dataset.centreKey)],select=card.querySelector('[data-centre-appointment]'),resource=card.querySelector('[data-centre-resource]');if(!select||!resource)return;
   const selected=()=>rows.find(a=>String(a.centralId||a.id)===select.value);
   const options=()=>{const a=selected(),values=[...resourcesFor(a),'Tratamiento con profesional'];resource.innerHTML=values.map(value=>'<option>'+esc(value)+'</option>').join('');if(values.includes(patient.resource))resource.value=patient.resource};select.onchange=options;options();
   card.querySelectorAll('[data-centre-stage]').forEach(control=>{control.disabled=busy;control.onclick=()=>change(selected(),control.dataset.centreStage,resource.value)});
  });
 }
 async function load(){
  if(inflight)return inflight;
  const date=today();
  inflight=(async()=>{try{const data=await window.atlasCentralRequest('appointments:list',bounds(date));if(!Array.isArray(data))throw new Error('El servidor no devolvió una lista de citas.');if(date!==today())return;rows=data.map(window.atlasCentralAppointmentFromRow);loaded=true;lastUpdated=new Date().toISOString();loadError=''}catch(error){loadError=String(error?.message||error)}finally{inflight=null;paint()}})();return inflight;
 }
 async function change(a,stage,resource=''){
  if(busy||!a)return;
  if(a.date!==today()||!['Pendiente','Confirmada','En sala'].includes(a.status))return alert('Solo se puede registrar presencia en una cita activa de hoy.');
  if(stage==='treating'&&!resource)return alert('Selecciona el tratamiento que va a iniciar.');
  busy=true;paint();
  try{
   const at=new Date().toISOString(),previous=snapshot().patients.find(p=>p.key===patientKey(a)),draft=JSON.parse(JSON.stringify(a)),arrival=previous?.arrivedAt||draft.centerPresence?.arrivedAt||draft.attendance?.arrivedAt||at;
   draft.status='En sala';draft.attendance={...(draft.attendance||{}),arrivedAt:arrival,status:'arrived'};
   draft.centerPresence={stage,resource:stage==='treating'?resource:'',arrivedAt:arrival,waitingSince:stage==='waiting'?at:'',updatedAt:at};
   draft.history=[...(draft.history||[]),{at,user:typeof agendaActorName==='function'?agendaActorName():'Equipo',action:stage==='treating'?'Inicio de tratamiento · '+resource:stage==='left'?'Salida del centro':'Paciente en sala de espera'}];
   await window.atlasPersistAppointmentCentral(draft);
   const index=appointments.findIndex(item=>String(item.centralId||item.id)===String(draft.centralId||draft.id));if(index>=0)appointments[index]=draft;
   const rowIndex=rows.findIndex(item=>String(item.centralId||item.id)===String(draft.centralId||draft.id));if(rowIndex>=0)rows[rowIndex]=draft;else rows.push(draft);
   lastUpdated=at;loadError='';render();
   parent.postMessage({type:'atlas:appointment-status-changed',appointment:draft},'*');
  }catch(error){loadError='Cambio sin confirmar: '+String(error?.message||error);alert(loadError)}finally{busy=false;paint();scheduleLoad()}
 }
 function scheduleLoad(){clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>{if(!document.hidden)load()},500)}
 function open(){paint();panel.classList.add('open');load()}
 openWaitingRoom=open;refreshWaitingRoom=paint;renderWaitingList=paint;button.onclick=open;
 const receive=()=>{const a=appointments.find(item=>String(item.id)===String(selectedId));if(a)change(a,'waiting')};
 receiveSelectedPatient=receive;const receiveButton=document.getElementById('receiveBtn');if(receiveButton)receiveButton.onclick=receive;
 const arrived=document.getElementById('atlasArrivedBtn');if(arrived)arrived.onclick=receive;
 const previousDrawer=window.openDrawer;window.openDrawer=function(id){previousDrawer(id);const a=appointments.find(item=>String(item.id)===String(id));let control=document.getElementById('centrePresenceDrawer');if(!control){control=document.createElement('button');control.id='centrePresenceDrawer';control.type='button';document.querySelector('#drawer .actions')?.append(control)}control.hidden=!a||a.date!==today()||!['Pendiente','Confirmada','En sala'].includes(a.status);control.textContent=a?.status==='En sala'&&a.centerPresence?.stage!=='left'?'Ver estancia / iniciar tratamiento':'Ha llegado · sala de espera';control.onclick=()=>{if(a?.status==='En sala'&&a.centerPresence?.stage!=='left')open();else receive()}};
 window.addEventListener('atlas:central-appointments-loaded',scheduleLoad);
 window.addEventListener('message',event=>{if(['atlas:central-ready','atlas:central-appointments-changed','atlas:server-recovered'].includes(event.data?.type))scheduleLoad()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleLoad()});setInterval(()=>{if(!document.hidden)load()},30000);
 api.reload=load;api.change=change;api.snapshot=snapshot;paint();scheduleLoad();
})(typeof window!=='undefined'?window:null);
