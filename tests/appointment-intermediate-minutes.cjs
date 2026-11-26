const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../modules/agenda.html','utf8');
function between(start,end){const i=html.indexOf(start),j=html.indexOf(end,i);assert.ok(i>=0&&j>i);return html.slice(i,j)}
const renderSource=between('function render(){','const renderWithoutPatientIndex=render;');
const cards=between('function professionalHoldHtml(', '\nfunction mergeIntervals(');
const helpers=html.includes('function appointmentStartSlot(')?between('function appointmentStartSlot(', 'function professionalHoldHtml('):'';
const source=helpers+cards+renderSource+between('function ensureCalendarDelegation(', '\nfunction render(){');
const date='2026-11-17',professionals=['Lisardo Esteve Montava','David Díaz Huertas'];
function appointment(id,time,resource=professionals[0],extra={}){return {id,time,date,patient:'Paciente sintético',patientCode:'TEST-1',therapy:'Servicio de prueba',services:['Servicio de prueba'],resource,resources:[resource],professional:resource,duration:30,status:'Pendiente',...extra}}
function globals(rows,sim=[]){return {appointments:rows,simulation:sim,currentDate:date,resources:[...professionals,'Equipo de prueba'],professionals,equipment:['Equipo de prueba'],specialColumns:[],schedules:{},agendaBlocks:[],lastRenderedAgendaDate:'',AGENDA_FEATURES:{dragDrop:false},mins:t=>{const [h,m]=t.split(':').map(Number);return h*60+m},timeStr:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),equipmentUnits:()=>2,professionalIntervalsForDate:()=>[[480,1320]],appointmentTherapists:a=>Object.values(a.therapists||{}).concat(a.professional||[]),professionalDuration:()=>30,appointmentPaymentClass:()=>'',effectiveStatus:a=>a.status,patientByCode:()=>null,dateLabel:()=>date,renderCurrentTimeLine(){},updateStats(){},refreshWaitingRoom(){},refreshWaitlist(){}}}
function render(rows,sim=[]){const cal={classList:{toggle(){}},style:{},dataset:{},addEventListener(){}};const fields={cal,dateLabel:{},view:{value:'all'},fitView:{getAttribute:()=>false},patientFilter:{hidden:true,value:'Otro paciente'},statusFilter:{value:''}};const ctx=globals(rows,sim);ctx.document={getElementById:id=>fields[id]};vm.createContext(ctx);vm.runInContext(source,ctx);ctx.render();return {output:cal.innerHTML,ctx,fields}}
function test(){
 const original=[appointment('off-grid','14:05'),appointment('aligned','13:30',professionals[1])],before=JSON.stringify(original);
 let r=render(original);assert.ok(r.output.includes('data-id="off-grid"'),'La cita de las 14:05 debe aparecer');assert.ok(r.output.includes('data-id="aligned"'));assert.equal(JSON.stringify(original),before,'El render no modifica citas');
 for(let minute=0;minute<60;minute++){const time='14:'+String(minute).padStart(2,'0'),{output}=render([appointment('minute',time)]);assert.equal((output.match(/data-id="minute"/g)||[]).length,1,time);assert.ok(output.includes(time+' · 30m'));const top=Number(output.match(/style="top:([\d.]+)px;height/)[1]);assert.ok(Math.abs(top-((minute%15)*32/15))<1e-9,time+' posición exacta');}
 // Las citas coincidentes se separan dentro de una sola columna profesional.
 let overlap=render([appointment('same-a','14:00'),appointment('same-b','14:00')]);
 assert.equal((overlap.output.match(/<div class="head" title="Lisardo Esteve Montava">/g)||[]).length,1,'El profesional conserva una sola columna');
 assert.ok(overlap.output.includes('width:calc(50% - 4px)'),'Citas con igual inicio se reparten el ancho');
 assert.equal(overlap.fields.cal.style.gridTemplateColumns,'52px repeat(4,112px)','Todas las columnas mantienen el mismo ancho cuando se solapan citas');
 for(const id of ['same-a','same-b'])assert.equal((overlap.output.match(new RegExp('data-id="'+id+'"','g'))||[]).length,1,'Visible una vez: '+id);
 overlap=render([appointment('triple-a','14:00'),appointment('triple-b','14:00'),appointment('triple-c','14:00')]);
 assert.equal((overlap.output.match(/<div class="head" title="Lisardo Esteve Montava">/g)||[]).length,1,'Tres citas tampoco duplican la columna profesional');
 assert.equal(overlap.fields.cal.style.gridTemplateColumns,'52px repeat(4,112px)','Tres citas no ensanchan la columna del profesional');
 assert.ok(overlap.output.includes('width:calc(33.333333333333336% - 4px)'),'Tres tarjetas se separan dentro de la columna');
 for(const id of ['triple-a','triple-b','triple-c'])assert.equal((overlap.output.match(new RegExp('data-id="'+id+'"','g'))||[]).length,1,'Visible una vez: '+id);
 overlap=render([appointment('stagger-a','14:00',professionals[0],{duration:45}),appointment('stagger-b','14:15',professionals[0],{duration:30})]);
 assert.equal((overlap.output.match(/<div class="head" title="Lisardo Esteve Montava">/g)||[]).length,1,'Un inicio cruzado tampoco duplica el profesional');
 assert.ok(overlap.output.includes('width:calc(50% - 4px)'),'Inicios distintos que se cruzan se reparten el ancho');
 for(const [id,height] of [['duration-15',32],['duration-30',64],['duration-45',96]]){const minutes=Number(id.split('-')[1]),{output}=render([appointment(id,'14:00',professionals[0],{duration:minutes})]),match=output.match(new RegExp('style="top:[^;]+;height:([\\d.]+)px" data-id="'+id+'"'));assert.ok(match,id);assert.equal(Number(match[1]),height,'Altura exacta: '+minutes+'m')}
 // Recursos antiguos sin array, reserva de terapeuta y equipos con dos unidades.
 let holds=render([
  appointment('hold-a','14:00','Equipo de prueba',{professional:professionals[0],therapists:{'Servicio de prueba':professionals[0]},duration:30}),
  appointment('hold-b','14:15','Equipo de prueba',{professional:professionals[0],therapists:{'Servicio de prueba':professionals[0]},duration:30})
 ]);
 assert.equal((holds.output.match(/<div class="head" title="Lisardo Esteve Montava">/g)||[]).length,1,'Las reservas profesionales conservan una columna');
 assert.equal((holds.output.match(/style="left:calc\(/g)||[]).length,2,'Las reservas profesionales simultáneas también se distribuyen');
 assert.ok(render([appointment('legacy','14:05',professionals[0],{resources:undefined})]).output.includes('data-id="legacy"'));
 r=render([appointment('hold','14:05','Equipo de prueba',{professional:professionals[0],therapists:{'Servicio de prueba':professionals[0]}})]);assert.equal((r.output.match(/data-id="hold"/g)||[]).length,2);assert.ok(r.output.includes('14:05 · 30m profesional'));
 r=render([appointment('unit1','14:05','Equipo de prueba',{professional:''}),appointment('unit2','14:05','Equipo de prueba',{professional:''})]);for(const id of ['unit1','unit2'])assert.equal((r.output.match(new RegExp('data-id="'+id+'"','g'))||[]).length,1);
 assert.ok(render([], [appointment('draft','14:05')]).output.includes('14:05 · 30m'));
 r=render([appointment('cancelled','14:05',professionals[0],{status:'Cancelada'}),appointment('other-day','14:05',professionals[0],{date:'2026-11-18'})]);assert.ok(!r.output.includes('data-id="cancelled"'));assert.ok(!r.output.includes('data-id="other-day"'));
 r.fields.statusFilter.value='Cancelada';r.ctx.render();assert.ok(r.fields.cal.innerHTML.includes('data-id="cancelled"'));
 for(const time of ['08:00','08:01','21:59'])assert.ok(render([appointment('boundary',time)]).output.includes('data-id="boundary"'));
 console.log('OK: 14:05 y 13:30, los 60 minutos, posición exacta, recursos antiguos, terapeuta, equipos, borrador, filtros y límites. Sin modificar datos.');
}
module.exports={source,globals,appointment,professionals,html};if(require.main===module)test();
