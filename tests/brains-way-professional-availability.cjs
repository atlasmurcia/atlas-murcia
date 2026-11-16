const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8');
function definition(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);for(let end=html.indexOf('}',start);end>=0;end=html.indexOf('}',end+1)){const source=html.slice(start,end+1);try{new vm.Script('('+source+')');return source}catch{}}throw new Error(name)}
const durationMatch=html.match(/const therapyProfessionalDurations=(\{[\s\S]*?\});\nconst therapiesWithoutProfessional/);assert.ok(durationMatch,'therapy professional durations');
const date='2026-11-12',time='18:00',professional='Fisio sintético';
const elements={mDate:{value:date},mTime:{value:time},mDuration:{value:'30'}};
const ctx={console,Date,Object,Set,currentDate:date,editingId:null,appointments:[],schedules:{[professional]:{4:[[480,1260]]}},agendaAvailabilityOverrides:[],document:{getElementById:id=>elements[id]},therapiesWithoutProfessional:new Set(),atlasIsNonClinicalContactAppointment:()=>false,physicalmMode:()=>'',physicalmUnscheduledAssistant:()=>false,qualifiedProfessionals:()=>[professional]};
vm.createContext(ctx);vm.runInContext('this.therapyProfessionalDurations='+durationMatch[1],ctx);
const names=['mins','intervalsOverlap','normalizeSearch','professionalIntervalsForDate','appointmentTherapists','professionalDuration','professionalAvailableForService'];
vm.runInContext(names.map(definition).join('\n'),ctx);
const aliases=['Brains Way','BRAINS WAY (TERAPIA TRANSCRANEAL)'];
for(const service of aliases){
 assert.equal(ctx.therapyProfessionalDurations[service],15,service+' therapist duration');
 assert.equal(ctx.professionalDuration({therapy:service,services:[service],professional,duration:30}),15,service+' appointment therapist reservation');
}
const existing={id:'synthetic-existing',date,status:'Pendiente',time:'18:15',duration:30,therapy:'BRAINS WAY (TERAPIA TRANSCRANEAL)',services:['BRAINS WAY (TERAPIA TRANSCRANEAL)'],professional};
ctx.appointments.push(existing);
assert.equal(ctx.professionalAvailableForService(professional,'BRAINS WAY (TERAPIA TRANSCRANEAL)'),true,'the prior therapy equipment interval starts after this 15-minute therapist interval');
existing.time='18:10';
assert.equal(ctx.professionalAvailableForService(professional,'BRAINS WAY (TERAPIA TRANSCRANEAL)'),false,'an actual therapist overlap remains blocked');
console.log('Brains Way: 30 min de equipo, 15 min de fisioterapeuta; franjas adyacentes libres y solapamientos reales bloqueados.');
