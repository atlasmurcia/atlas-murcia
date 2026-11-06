const assert=require('node:assert/strict'),{summarize,today,bounds,presenceDraft}=require('../modules/centre-presence.js');
const date='2026-11-06',arrival='2026-11-06T09:00:00Z',complete='2026-11-06T09:10:00Z',departure='2026-11-06T10:00:00Z';
const base={date,status:'En sala',patient:'Nombre sintético',attendance:{arrivedAt:arrival}},a={...base,id:'a',centralId:'a',patientRemoteId:'patient-a'},duplicate={...a,id:'a2',centralId:'a2'},b={...base,id:'b',centralId:'b',patientRemoteId:'patient-b'};
let rows=[a,duplicate,b,{...base,id:'c',patientRemoteId:'c',status:'Confirmada'},{...base,id:'d',patientRemoteId:'d',status:'Realizada',attendance:{}},{...base,id:'e',patientRemoteId:'e',status:'Cancelada'},{...base,id:'y',patientRemoteId:'y',date:'2026-11-05'}];
let result=summarize(rows,date);assert.equal(result.total,2);assert.equal(result.waiting.length,2);
const done={...a,status:'Realizada',resource:'Equipo de prueba',attendance:{status:'completed',completedAt:complete,sessionConsumed:true},centerPresence:{stage:'waiting',arrivedAt:arrival,updatedAt:arrival}};
result=summarize([done,duplicate,b],date);assert.equal(result.total,2);assert.equal(result.treating.length,1);assert.equal(result.waiting.length,1);assert.equal(result.treating[0].resource,'Equipo de prueba');
// La llegada de otra cita del mismo paciente basta: el servidor reemplaza attendance al completar.
const next={...done,id:'siguiente',centralId:'siguiente',centerPresence:undefined};
assert.equal(summarize([a,next],date).treating.length,1);
assert.equal(summarize([next],date).total,0); // Sin llegada, no se inventa presencia por hora o por sesión.
const legacy={...next,history:[{at:arrival,action:'Paciente en sala'}]};assert.equal(summarize([legacy],date).treating.length,1);
const exit=presenceDraft(done,'left','',departure,arrival),backToWait=presenceDraft(done,'waiting','','2026-11-06T09:20:00Z',arrival);
assert.equal(summarize([a,next,exit],date).total,0);assert.equal(summarize([backToWait],date).waiting.length,1);
assert.equal(summarize([exit,{...next,attendance:{completedAt:'2026-11-06T10:10:00Z'}}],date).total,0); // Registro tardío no reabre una salida.
const reentry=presenceDraft(done,'waiting','','2026-11-06T11:00:00Z','2026-11-06T11:00:00Z');assert.equal(summarize([exit,reentry],date).waiting.length,1);
assert.equal(summarize([{...a,status:'Pendiente',centerPresence:{stage:'treating'}}],date).total,0);
assert.equal(summarize([{...done,historico:true}],date).total,0);
assert.equal(summarize([{...base,id:'unlinked-a'},{...base,id:'unlinked-b'}],date).total,2);
// Cambiar presencia no cambia ni consume la sesión ni toca cobros, precios o servicios.
for(const stage of ['waiting','treating','left']){const original={...done,paymentStatus:'Sin cobrar',amount:25,services:['Equipo de prueba']},draft=presenceDraft(original,stage,'Equipo de prueba',departure,arrival);for(const field of ['status','attendance','paymentStatus','amount','services'])assert.deepEqual(draft[field],original[field]);assert.equal(original.centerPresence.stage,'waiting')}
assert.equal(presenceDraft({...a,status:'Pendiente'},'waiting','',arrival,arrival).status,'En sala');
assert.equal(today(new Date('2026-11-05T23:30:00Z')),date);assert.equal(bounds(date).from,'2026-11-05T23:00:00.000Z');assert.equal(bounds(date).to,'2026-11-06T23:00:00.000Z');
const hours=d=>(Date.parse(bounds(d).to)-Date.parse(bounds(d).from))/3600000;assert.equal(hours('2026-03-29'),23);assert.equal(hours('2026-10-25'),25);
console.log('Presencia: llegada → equipo realizado → espera → salida; varias citas, cobro intacto, sin llegadas ficticias y horario de Madrid.');
