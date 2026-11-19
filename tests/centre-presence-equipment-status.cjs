const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {presenceDraft}=require('../modules/centre-presence.js');
const source=fs.readFileSync('modules/agenda.html','utf8');
for(const [index,script] of [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(script[1],{filename:'agenda-script-'+index});
const context={effectiveStatus:a=>a.status,professionalDuration:()=>15,appointmentTop:()=>3,patientByCode:()=>null};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function professionalHoldHtml('),source.indexOf('\nfunction mergeIntervals(')),context);
const arrival='2026-11-19T10:00:00Z',at='2026-11-19T11:00:00Z';
const base={id:'synthetic',patient:'Paciente de prueba',date:'2026-11-19',time:'12:00',duration:30,resources:['Robot'],services:['Robot'],paymentStatus:'Sin cobrar',amount:25};
for(const status of ['Pendiente','En sala','Realizada']){
 const original={...base,status,attendance:status==='Realizada'?{status:'completed',sessionConsumed:true}:{status:'arrived',arrivedAt:arrival}};
 for(const resource of ['Robot','SIS']){
  const draft=presenceDraft(original,'treating',resource,at,arrival);
  assert.equal(draft.status==='Realizada',status==='Realizada');
  for(const field of ['paymentStatus','amount','services'])assert.deepEqual(draft[field],original[field]);
  assert.equal(draft.attendance.sessionConsumed,original.attendance.sessionConsumed);
  for(const render of [context.apptHtml,context.professionalHoldHtml]){
   const html=render(draft,false,'Robot');
   assert.equal(/class="appt[^"]*pending/.test(html),status!=='Realizada');
  }
 }
}
console.log('Cambio de equipo: cita sin completar, color pendiente en agenda y reserva profesional, cobros y consumo intactos.');
