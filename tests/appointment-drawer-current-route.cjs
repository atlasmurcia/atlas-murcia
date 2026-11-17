const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../modules/agenda.html'),'utf8');
const source=html.match(/function appointmentDrawerRoute\(a\)\{[\s\S]*?\n\}/)[0];
const base={patientRemoteId:'synthetic-patient',patientCode:'TEST-1',patient:'Paciente de prueba',date:'2026-11-17',status:'Pendiente',therapy:'IMOOVE',resource:'Profesional actual'};
const appointments=[
 {...base,id:'old-professional',time:'13:30',resource:'Profesional anterior',status:'Cancelada'},
 {...base,id:'current-professional',time:'14:05'},
 {...base,id:'old-equipment',time:'12:00',therapy:'VACU',status:'cancelled'},
 {...base,id:'current-equipment',time:'13:00',therapy:'VACU',resource:'VACU'},
 {...base,id:'second-valid-session',time:'15:00',status:'Realizada'},
 {...base,id:'different-day',date:'2026-11-18',time:'10:00'},
 {...base,id:'different-patient',patientRemoteId:'other',patientCode:'TEST-2',time:'09:00'},
 {...base,id:'deleted',time:'08:00',deletedAt:'2026-11-17T10:00:00Z'},
];
const before=JSON.stringify(appointments);
const context={appointments,normalizeSearch:v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),mins:v=>Number(v.split(':')[0])*60+Number(v.split(':')[1])};
vm.createContext(context);vm.runInContext(source,context);
const route=context.appointmentDrawerRoute(appointments[1]);
assert.deepEqual(Array.from(route,a=>a.id),['current-equipment','current-professional','second-valid-session']);
assert.equal(JSON.stringify(appointments),before,'El filtrado del resumen no modifica ni reordena las citas de la agenda');
assert.match(html,/const route=appointmentDrawerRoute\(a\);/);
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(/type=["'](?:application\/json|module)/.test(script[1]))continue;
 new vm.Script(script[2]);
}
console.log('Resumen sin citas anuladas ni eliminadas; sesiones válidas repetidas y agenda original conservadas. JavaScript válido.');
