const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const agenda=fs.readFileSync(path.join(__dirname,'../modules/agenda.html'),'utf8');
const ficha=fs.readFileSync(path.join(__dirname,'../modules/ficha.html'),'utf8');
const shell=fs.readFileSync(path.join(__dirname,'../atlas.html'),'utf8');

assert.match(ficha,/appointmentAction:'reschedule'/,'La ficha debe pedir la reprogramación de la cita existente');
assert.doesNotMatch(ficha,/copyAppointment:a/,'Reprogramar no debe copiar la cita anulada');
assert.match(agenda,/window\.atlasRescheduleCancelledAppointmentCentral/,'La agenda debe guardar la reprogramación como operación confirmada');
assert.match(agenda,/appointments:rescheduleCancelled/,'La agenda debe usar la operación atómica de reprogramación');
assert.match(agenda,/current\.status!=='Cancelada'/,'Solo se debe reprogramar una cita anulada');
assert.match(agenda,/assertWritable\(current\)/,'Las citas históricas deben seguir protegidas');
assert.match(shell,/else if\(m\.action==='appointments:rescheduleCancelled'\)/,'El puente central debe aceptar la reprogramación');

const actionStart=shell.indexOf("else if(m.action==='appointments:rescheduleCancelled')");
const actionEnd=shell.indexOf("else if(m.action==='appointments:delete')",actionStart);
const action=shell.slice(actionStart,actionEnd);
for(const preserved of ['patient_id','services','resources','professionals'])assert(!new RegExp('changes=\\{[^}]*'+preserved).test(action),'La operación no debe sobrescribir '+preserved);
for(const changed of ["status:'pending'",'starts_at:startsAt.toISOString()','ends_at:endsAt.toISOString()','cancelled_at:null'])assert(action.includes(changed),'Falta el cambio controlado '+changed);
assert(action.includes(".eq('updated_at',current.updated_at)"),'La actualización debe impedir sobrescribir cambios de otra persona');
assert(action.includes('reprogrammedFrom'),'Debe conservarse la trazabilidad de la fecha original');

console.log('Reprogramación segura comprobada: misma cita, datos originales preservados y cambio atómico de estado, fecha y hora.');
