// Synthetic fixtures only. No network or clinical data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8');
function definition(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);for(let end=html.indexOf('}',start);end>=0;end=html.indexOf('}',end+1)){const s=html.slice(start,end+1);try{new vm.Script('('+s+')');return s}catch{}}throw Error(name)}
const functions=['normalizeSearch','physicalmMode','professionalDuration','appointmentTherapists','professionalHoldHtml','appointmentTop','appointmentStartSlot','mins','timeStr','mergeIntervals','totalIntervalMinutes','professionalOccupiedMinutes','aiAppointmentOverlap','localIso','localParts','toCentralStatus','toLocalStatus','cleanMetadata','clientRef','visibleResourcesForAppointment','toRow','fromRow','koiboxDisplay'];
const source=functions.map(definition).join('\n');
const professional='Terapeuta ficticio',patient={name:'Paciente ficticio',code:'SYNTHETIC',remoteId:'synthetic-patient'};
const c={console,Date,Map,Set,professionals:[professional],followUpDefaultResources:new Map(),pad:n=>String(n).padStart(2,'0'),patientFor:()=>patient,patientByRemoteId:()=>patient,atlasIsNonClinicalContactAppointment:()=>false,therapyProfessionalDurations:{Physicalm:15,'PHYSICALM DINAMICO':15,'PHYSICALM ESTATICO':0,Robot:15},therapiesWithoutProfessional:new Set(['PHYSICALM ESTATICO']),effectiveStatus:a=>a.status,appointmentPaymentClass:()=>'',shortPatient:n=>n};
vm.createContext(c);vm.runInContext(source,c);
const appointment={id:'synthetic',patient:patient.name,patientCode:patient.code,date:'2027-04-12',time:'10:00',duration:30,therapy:'PHYSICALM DINAMICO',services:['PHYSICALM DINAMICO'],resources:['Physicalm'],resource:'Physicalm',professional,therapists:{'PHYSICALM DINAMICO':professional},status:'Pendiente',professional_minutes:15};
for(const therapy of ['PHYSICALM DINAMICO','Physicalm dinámico'])assert.equal(c.professionalDuration({...appointment,therapy}),30);
for(const therapy of ['PHYSICALM ESTATICO','Physicalm estático'])assert.equal(c.professionalDuration({...appointment,therapy}),0);
assert.equal(c.professionalDuration({...appointment,professional:''}),0);
assert.equal(c.professionalDuration({...appointment,therapy:'Robot'}),15);
assert.equal(c.professionalOccupiedMinutes([appointment]),30);
assert(c.aiAppointmentOverlap(appointment,appointment.date,615,630,professional));
assert(!c.aiAppointmentOverlap(appointment,appointment.date,630,645,professional));
const row=c.toRow(appointment);assert.equal(row.metadata.professional_minutes,30);assert.equal((new Date(row.ends_at)-new Date(row.starts_at))/60000,30);
const reloaded=c.fromRow({...row,id:'synthetic-server',updated_at:'2026-11-19T12:00:00Z'});assert.equal(c.professionalDuration(reloaded),30);assert.equal(reloaded.professional,professional);
const display=c.professionalHoldHtml(reloaded,professional);assert(display.includes('30m profesional'));assert(display.includes('height:60px'));
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|application\/json/.test(match[1]))new vm.Script(match[2]);
console.log('PASS dynamic 30 minutes, static unchanged, other equipment unchanged, full occupancy, second-half conflict, adjacent slot, serializer, reload and actual column renderer; all inline scripts compile.');
module.exports={source,appointment,display,html};
