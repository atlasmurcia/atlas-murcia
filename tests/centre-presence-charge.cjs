// Ejecuta el renderizador de cobro existente: las sesiones realizadas deben seguir seleccionables.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('modules/agenda.html','utf8'),start=source.indexOf(' function renderGroup(origin,club){'),end=source.indexOf('\n async function confirmGroupCharge',start),nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:'',insertAdjacentHTML(_where,value){this.innerHTML+=value}});return nodes.get(id)}
const context={appointments:[{id:'test-a',date:'2026-11-06',time:'09:00',patientCode:'test',status:'Realizada',services:['Equipo A'],resources:['Equipo A']},{id:'test-b',date:'2026-11-06',time:'10:00',patientCode:'test',status:'Realizada',services:['Equipo B'],resources:['Equipo B']},{id:'test-paid',date:'2026-11-06',time:'11:00',patientCode:'test',status:'Realizada',services:['Equipo cobrado'],resources:[]},{id:'cancelled',date:'2026-11-06',time:'12:00',patientCode:'test',status:'Cancelada',services:['Equipo cancelado']},{id:'other',date:'2026-11-06',time:'12:00',patientCode:'other',status:'Realizada',services:['Otro paciente']}],document:{getElementById:node,querySelectorAll(){return[]}},samePatient:(a,b)=>a.patientCode===b.patientCode,ensureDiscount(){},hesc:String,money:String,isPaid:a=>a.id==='test-paid',servicesFor:a=>a.services,serviceLabel:x=>x,servicePrice:()=>25,groupAppointments:[],groupProducts:[],renderGroupProducts(){},updateGroupTotal(){},window:{}};
vm.createContext(context);vm.runInContext(source.slice(start,end)+';renderGroup(appointments[0],false)',context);
const html=node('appointmentChargeLines').innerHTML;
for(const id of ['test-a','test-b'])assert.match(html,new RegExp('data-appointment-id="'+id+'" checked'));
assert.match(html,/data-appointment-id="test-paid" disabled/);assert(!html.includes('Equipo cancelado'));assert(!html.includes('Otro paciente'));
// El selector permite retirar cualquiera sin afectar a las otras citas.
assert.match(html,/id="atlasSelectAllDayCharges"/);assert.match(html,/id="atlasClearDayCharges"/);assert.match(html,/data-group-charge-select/);
console.log('Cobro existente: equipos realizados seleccionables, selección individual y conjunta, cobrado bloqueado, cancelados y otros pacientes excluidos. No se registra ningún cobro.');
