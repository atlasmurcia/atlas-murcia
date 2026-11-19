(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.atlasCancellationTrace=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const text=(value,max=100)=>typeof value==='string'?value.slice(0,max):null;
 const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
 const entryPoints=new Set(['agenda_detail','patient_list_via_agenda','patient_charge_list','unreported']);
 function activation(event,control){return {at:new Date().toISOString(),control,reportedTrusted:event?.isTrusted===true?true:event?.isTrusted===false?false:null,reportedPointerClicks:Number.isInteger(event?.detail)&&event.detail>=0?Math.min(event.detail,10):null}}
 function open(appointment,entryPoint,event,control){return {entryPoint:entryPoints.has(entryPoint)?entryPoint:'unreported',reviewedAppointmentId:String(appointment.centralId||appointment.id||''),reviewedClientRef:text(appointment.centralRef||appointment.clientRef||''),reviewedVersion:text(appointment.centralUpdatedAt||appointment.updated_at||''),opened:activation(event,control)}}
 function confirm(origin,event,control){return {...origin,confirmed:activation(event,control)}}
 function reportedActivation(value,controls){if(!value||!controls.includes(value.control))return null;return {at:date(value.at),control:value.control,reportedTrusted:typeof value.reportedTrusted==='boolean'?value.reportedTrusted:null,reportedPointerClicks:Number.isInteger(value.reportedPointerClicks)&&value.reportedPointerClicks>=0&&value.reportedPointerClicks<=10?value.reportedPointerClicks:null}}
 function screen(source,agenda,ficha){return source===agenda?'agenda':source===ficha?'ficha':'unknown'}
 function create({sourceScreen,action,requestId,origin,selected,affected,actorId,actorName,at,operationId}){
  const reported=origin&&typeof origin==='object'?origin:{};
  let entryPoint='unreported';
  if(sourceScreen==='agenda'&&['agenda_detail','patient_list_via_agenda'].includes(reported.entryPoint))entryPoint=reported.entryPoint;
  if(sourceScreen==='ficha'&&reported.entryPoint==='patient_charge_list')entryPoint=reported.entryPoint;
  const validAction=action==='appointments:cancel'?'appointments:cancel':'appointments:upsertMany';
  return {version:1,operationId,requestId:text(requestId),recordedAt:at,sourceScreen:['agenda','ficha'].includes(sourceScreen)?sourceScreen:'unknown',action:validAction,entryPoint,actorId:actorId||null,actorName:text(actorName,160),selectedAppointmentId:selected?.id||null,selectedClientRef:text(selected?.client_ref),affectedAppointmentId:affected?.id||null,affectedClientRef:text(affected?.client_ref),previousStatus:text(affected?.status,30),previousVersion:text(affected?.updated_at),previousStartsAt:date(affected?.starts_at),previousEndsAt:date(affected?.ends_at),reviewedAppointmentId:text(reported.reviewedAppointmentId),reviewedClientRef:text(reported.reviewedClientRef),reviewedVersion:text(reported.reviewedVersion),opened:validAction==='appointments:cancel'?reportedActivation(reported.opened,['deleteBtn','patientAppointmentCancelOpen']):null,confirmed:validAction==='appointments:cancel'?reportedActivation(reported.confirmed,['confirmCancelBtn','patientAppointmentCancelConfirm']):null};
 }
 function preserve(previous,incoming){
  const before=previous||{},next={...(incoming||{})};delete next.cancellationTraceEvents;delete next.lastCancellationTrace;
  const events=Array.isArray(before.cancellationTraceEvents)?before.cancellationTraceEvents.filter(event=>event?.version===1):[];
  const history=Array.isArray(next.history)?next.history.filter(entry=>!entry?.cancellationTrace):[];
  const recorded=Array.isArray(before.history)?before.history.filter(entry=>entry?.cancellationTrace?.version===1):[];
  next.history=history.concat(recorded).sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
  if(events.length){next.cancellationTraceEvents=events.slice();next.lastCancellationTrace=events[events.length-1]}
  return next;
 }
 function append(metadata,event){const next={...(metadata||{})},events=Array.isArray(next.cancellationTraceEvents)?next.cancellationTraceEvents:[];if(events.some(old=>old.operationId===event.operationId&&old.affectedAppointmentId===event.affectedAppointmentId))return next;next.cancellationTraceEvents=[...events,event];next.lastCancellationTrace=event;return next}
 function describe(event){if(!event||event.version!==1)return '';const screens={agenda:'Agenda',ficha:'Ficha del paciente',unknown:'Pantalla no identificada'},entries={agenda_detail:'Detalle de cita',patient_list_via_agenda:'Listado de citas de la ficha → Agenda',patient_charge_list:'Citas de la ficha',unreported:'Acceso no informado'},action=event.action==='appointments:cancel'?'Confirmar cancelación':'Guardado con cambio a cancelada';return `${screens[event.sourceScreen]||screens.unknown} · ${entries[event.entryPoint]||entries.unreported} · ${action}`}
 return {activation,open,confirm,screen,create,preserve,append,describe};
});
