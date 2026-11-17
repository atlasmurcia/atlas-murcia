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
for(const name of ['modules/ficha.html','modules/agenda.html',fs.existsSync('atlas.html')?'atlas.html':'index.html']){
 const source=fs.readFileSync(name,'utf8');assert(source.includes('appointment-record-kind.js?v=1'));
 for(const script of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc\s*=|type\s*=\s*["'](?:application\/json|importmap)/i.test(script[1])&&script[2].trim())new vm.Script(script[2],{filename:name});
}
console.log('Clasificación, listado real, conservación de citas cobradas, lecturas de pagos intactas y sintaxis: OK (solo datos sintéticos).');
