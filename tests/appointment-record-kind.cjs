const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('modules/appointment-record-kind.js','utf8'),{window});
const isAppointment=window.atlasIsAppointmentRecord;
const visit={id:'synthetic-visit',date:'2026-10-14',time:'09:00',services:['Terapia de prueba'],status:'Realizada'};
for(const extra of [{},{paymentStatus:'Cobrado'},{centralPaymentId:'synthetic-payment',paidAmount:100},{historicalPaymentBasis:'Koibox: sesión incluida en una venta histórica ya cobrada'},{historico:true},{client_ref:'koibox:appointment:synthetic'},{services:['Terapia de prueba','Valoración']},{resources:[],professionals:[]},{status:'Cancelada'}])assert.equal(isAppointment({...visit,...extra}),true);
for(const kind of ['direct_sale','historical_sale']){
 assert.equal(isAppointment({...visit,metadata:{kind}}),false);
 assert.equal(isAppointment({...visit,kind}),false);
}
for(const ref of ['koibox-sale-synthetic','atlas-direct-sale-synthetic'])for(const key of ['id','centralRef','client_ref'])assert.equal(isAppointment({...visit,[key]:ref}),false);
const before=JSON.stringify(visit);isAppointment(visit);assert.equal(JSON.stringify(visit),before);
const html=fs.readFileSync('modules/ficha.html','utf8'),body=html.match(/function patientAppointments\(\)\{([^\n]+)\}/)[1];
const sale={...visit,id:'synthetic-sale',time:'09:33',services:['Terapia de prueba','Valoración'],metadata:{kind:'historical_sale'}};
window.ATLAS_PATIENT_APPOINTMENTS=[visit,sale];
const list=vm.runInNewContext('(function(){'+body+'})()',{window});assert.equal(list.length,1);assert.equal(list[0].id,visit.id);
const shell=fs.readFileSync(fs.existsSync('atlas.html')?'atlas.html':'index.html','utf8');
const filter=shell.match(/if\(\['appointments:list','appointments:listForPatient'\][^\n]*?result=\{\.\.\.result,data:result\.data\.filter\(window.atlasIsAppointmentRecord\)\};/)[0];
for(const action of ['appointments:list','appointments:listForPatient','payments:list','payments:listClinic','appointments:upsertMany']){
 const c={m:{action},result:{data:[visit,sale],error:null},window};vm.runInNewContext(filter,c);
 assert.equal(c.result.data.length,action==='appointments:list'||action==='appointments:listForPatient'?1:2);
}

// Agenda y pagos son ejes independientes: anticipar un cobro no crea una sesión.
const scheduled={...visit,id:'synthetic-prepaid-session',status:'Pendiente',paymentStatus:'Cobrado',centralPaymentId:'synthetic-advance'};
const cancelled={...visit,id:'synthetic-cancelled-session',status:'Cancelada',paymentStatus:'Cobrado',centralPaymentId:'synthetic-kept-payment'};
const advance={id:'synthetic-advance',appointment_id:null,status:'completed',payment_type:'deposit',amount:100,metadata:{kind:'budget'}};
const cancelledPayment={id:'synthetic-kept-payment',appointment_id:cancelled.id,status:'completed',amount:50};
const refunded={id:'synthetic-refund',appointment_id:cancelled.id,status:'refunded',amount:-50};
function readResult(action,rows){const c={m:{action},result:{data:rows,error:null},window};vm.runInNewContext(filter,c);return c.result.data;}
assert.equal(readResult('appointments:listForPatient',[]).length,0,'Un anticipo sin sesiones pautadas deja la agenda vacía');
const payments=[advance,cancelledPayment,refunded];
for(const action of ['payments:list','payments:listClinic']){
 const result=readResult(action,payments);assert.equal(result,payments);assert.equal(result.length,3);
 assert.equal(result[0].status,'completed');assert.equal(result[1].status,'completed');assert.equal(result[2].status,'refunded');
}
const timeline=readResult('appointments:listForPatient',[scheduled,cancelled,sale]);
assert.equal(timeline.length,2);assert.equal(timeline[0].status,'Pendiente');assert.equal(timeline[1].status,'Cancelada');
window.ATLAS_PATIENT_APPOINTMENTS=timeline;
const patientList=vm.runInNewContext('(function(){'+body+'})()',{window});
assert.equal(patientList.length,2);assert(patientList.some(a=>a.id===scheduled.id));assert(patientList.some(a=>a.id===cancelled.id));
assert.equal(cancelledPayment.status,'completed','La cancelación de una sesión no cancela su pago');
assert.equal(advance.appointment_id,null,'El anticipo continúa sin cita asociada');

for(const name of ['modules/ficha.html','modules/agenda.html',fs.existsSync('atlas.html')?'atlas.html':'index.html']){
 const source=fs.readFileSync(name,'utf8');assert(source.includes('appointment-record-kind.js?v=2'));
 for(const script of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=|type\s*=\s*["'](?:application\/json|importmap)/i.test(script[1])&&script[2].trim())new vm.Script(script[2],{filename:name});
}
console.log('Clasificación, anticipos sin citas, sesiones pagadas pendientes/canceladas, devoluciones intactas, listado real y sintaxis: OK (solo datos sintéticos).');
