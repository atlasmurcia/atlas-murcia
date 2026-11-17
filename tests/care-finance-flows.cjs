const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('modules/agenda.html','utf8');
const modelContext={window:{}};vm.createContext(modelContext);
for(const file of ['appointment-record-kind.js','care-finance-model.js'])vm.runInContext(fs.readFileSync('modules/'+file,'utf8'),modelContext);
const model=modelContext.window.atlasCareFinance;
const patient={remoteId:'synthetic-patient',code:'TEST'};
const makeVisit=status=>({id:'synthetic-visit',centralId:'synthetic-central-visit',patientRemoteId:patient.remoteId,patientCode:patient.code,patient:'Paciente ficticio',date:'2026-11-20',time:'09:00',services:['Servicio ficticio'],resource:'Equipo ficticio',status,history:[]});
function harness(status){
 const a=makeVisit(status),writes=[],notices=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:({appointmentChargeTotal:'50',appointmentPaymentMethod:'Metálico',appointmentChargeDiscount:'0',appointmentChargeNotes:'',cancelWho:'Clínica',cancelReason:'Prueba sintética'})[id]||'',disabled:false,textContent:'',classList:{remove(){}}});return nodes.get(id)};
 const post=async(action,payload)=>{writes.push({action,payload});assert.equal(action,'payments:upsert');return{id:'synthetic-payment',amount:payload.amount,status:'completed',receipt_number:1,invoice_number:'TEST-INVOICE',paid_at:'2026-11-17T09:00:00Z',metadata:{}}};
 const c={window:{...modelContext.window,atlasMixedPayment:{read:()=>[],hasAttempt:()=>false,completeAttempt(){}},atlasSelectedPaymentDate:()=> '2026-11-17',atlasSelectedPaymentAt:()=> '2026-11-17T09:00:00Z'},document:{getElementById:node},appointments:[a],chargeAppointmentId:a.id,groupOriginId:a.id,groupProducts:[],groupClub:false,jointServiceAmount:null,cashMovements:[],sales:{products:[]},appointmentMixed:{read:()=>[]},same:(x,y)=>String(x)===String(y),existingPayment:()=>null,isPaid:()=>false,patientFor:()=>patient,selectedPaymentDate:()=> '2026-11-17',selectedPaymentAt:()=> '2026-11-17T09:00:00Z',resolveCentralAppointment:async()=>a.centralId,methodCode:()=> 'cash',centralRequest:post,receiptCode:()=> 'TEST-0001',appointmentTherapists:()=>[],allocateBudgetPayment(){},persistCash(){},persistSales(){},save(){},render(){},openDrawer(){},agendaActorName:()=> 'Prueba',money:String,parent:{postMessage:m=>notices.push(m)},alert:m=>notices.push(m),console,servicesFor:x=>x.services,serviceLabel:x=>x,chargeProducts:()=>[],selectedRows:()=>[{querySelector:()=>({dataset:{appointmentId:a.id}}),querySelectorAll:()=>[{dataset:{serviceIndex:'0'}}]}],selectedServiceInputs:()=>c.inputs,serviceBaseAmounts:()=>[50],Date};
 c.inputs=[{dataset:{serviceIndex:'0'}}];c.selectedRows=()=>[{querySelector:()=>({dataset:{appointmentId:a.id}}),querySelectorAll:()=>c.inputs}];
 c.helpers={patientFor:c.patientFor,resolveCentralAppointment:c.resolveCentralAppointment,methodCode:c.methodCode,receiptCode:c.receiptCode,allocateBudgetPayment:c.allocateBudgetPayment};c.window.atlasCentralRequest=post;vm.createContext(c);return{a,writes,notices,nodes,node,c};
}
(async()=>{
 let count=0;
 for(const status of ['Pendiente','Confirmada','Realizada','Cancelada','No presentado'])for(const mode of ['single','group']){
  const h=harness(status),start=source.indexOf(mode==='single'?' async function confirmCharge(){':' async function confirmGroupCharge(event){'),end=source.indexOf(mode==='single'?'\n window.printAppointmentReceipt=':'\n async function syncGroupedPayments()',start);
  assert(start>=0&&end>start);vm.runInContext(source.slice(start,end),h.c);await vm.runInContext(mode==='single'?'confirmCharge()':'confirmGroupCharge()',h.c);
  assert.equal(h.writes.length,1,JSON.stringify(h.notices));assert.equal(h.a.status,status,'Cobrar no modifica la asistencia');assert.equal(h.a.paymentStatus,'Cobrado');assert.equal(h.c.cashMovements.length,1);assert.equal(h.writes[0].payload.status,'completed');assert.equal(h.writes[0].payload.appointment_id,h.a.centralId);const audit=mode==='single'?h.writes[0].payload.metadata:h.writes[0].payload.metadata.group_appointments[0];assert.equal(audit.appointment_status_at_payment,status);assert.equal(audit.payment_timing,['Pendiente','Confirmada'].includes(status)?'advance':status==='Realizada'?'after_visit':'independent');count++;
 }
 // Cancelación por la ruta real de la portada: solo puede actualizar appointments.
 const shell=fs.readFileSync(fs.existsSync('atlas.html')?'atlas.html':'index.html','utf8');
 const start=shell.indexOf("else if(m.action==='appointments:cancel'){"),end=shell.indexOf("else if(m.action==='appointments:restore')",start);assert(start>=0&&end>start);
 const original={id:'synthetic-central-visit',patient_id:patient.remoteId,starts_at:'2026-11-20T09:00:00Z',ends_at:'2026-11-20T09:30:00Z',status:'pending',client_ref:'synthetic-visit',services:['Servicio ficticio'],metadata:{paymentStatus:'Cobrado',centralPaymentId:'synthetic-payment',paidAmount:50}};
 const payments=[{id:'synthetic-payment',appointment_id:original.id,status:'completed',amount:50}],snapshot=JSON.stringify(payments),writes=[];let saved;
 const db={from(table){assert.equal(table,'appointments','Cancelar no accede a pagos');let changes;return{select(){return this},eq(){return this},is(){return this},limit(){return Promise.resolve({data:[original],error:null})},maybeSingle(){return Promise.resolve({data:original,error:null})},update(patch){changes=patch;writes.push({table,patch});return this},single(){saved={...original,...changes};return Promise.resolve({data:saved,error:null})},insert(){throw Error('La cita existente no debe duplicarse')}}},functions:{invoke(){throw Error('No ejecutar servicios externos')}}};
 const c={m:{action:'appointments:cancel',payload:{id:original.id,clientRef:original.client_ref,who:'Clínica',reason:'Prueba'}},db,context:{organizationId:'test-org',clinicId:'test-clinic',userId:'test-user'},atlasActorName:()=> 'Prueba',setTimeout(){},console,Date};
 await vm.runInNewContext('(async()=>{let result;'+shell.slice(start,end).replace(/^else if/,'if')+'return result;})()',c);
 assert.equal(saved.status,'cancelled');assert.equal(writes.length,1);assert.equal(JSON.stringify(payments),snapshot);assert.equal(saved.metadata.centralPaymentId,'synthetic-payment');assert.equal(saved.metadata.paymentStatus,'Cobrado');count++;
 // Acciones de UI: revisar devolución requiere respuesta explícita y no registra ninguna.
 const uiStart=source.indexOf("document.getElementById('confirmCancelBtn').onclick=async()=>{"),uiEnd=source.indexOf("document.getElementById('closeCancelBtn').onclick",uiStart),h=harness('Pendiente');
 h.c.selectedId=h.a.id;h.c.window.atlasCancelAppointmentCentral=async()=>({...h.a,status:'Cancelada',paymentStatus:'Cobrado',centralPaymentId:'synthetic-payment'});h.c.logAgenda=()=>{};h.c.matchWaitlistForCancellation=()=>{};h.c.patientByCode=()=>patient;let questions=0;h.c.confirm=message=>{questions++;assert.match(message,/devoluci/);return false};
 vm.runInContext(source.slice(uiStart,uiEnd),h.c);await h.node('confirmCancelBtn').onclick();assert.equal(questions,1);assert.equal(h.writes.length,0);count++;
 // Guard explícito: incluso una respuesta financiera contaminada no cambia campos asistenciales.
 const visit=makeVisit('Confirmada');model.applyPayment(visit,{paymentStatus:'Cobrado',status:'Realizada',date:'2000-01-01',services:['Error']});assert.equal(visit.status,'Confirmada');assert.equal(visit.date,'2026-11-20');assert.equal(visit.services[0],'Servicio ficticio');
 h.c.confirm=()=>true;await h.node('confirmCancelBtn').onclick();assert.equal(h.writes.length,0);assert(h.notices.some(n=>n.type==='atlas:patient-selected'&&n.targetPanel==='facturacion'));
 h.c.window.atlasCancelAppointmentCentral=async()=>{throw Error('Fallo de prueba')};await h.node('confirmCancelBtn').onclick();assert.equal(h.a.status,'Pendiente');assert.equal(h.writes.length,0);
 const empty=model.appointmentGroups([],Date.parse('2026-11-17T09:00:00Z'));assert.equal(empty.completed.length,0);
 const advance={id:'advance',appointment_id:null,status:'completed',amount:100};assert.equal(model.allocations(advance).length,0);
 const charges=[{id:'charge',amount:100}],parts=[{id:'p1',status:'completed',amount:30},{id:'p2',status:'completed',amount:20}];
 const links=[{chargeId:'charge',paymentId:'p1',amount:30},{chargeId:'charge',paymentId:'p2',amount:20}];
 assert.equal(model.chargeSummary(charges,parts,links)[0].remaining,50);assert.equal(model.chargeSummary(charges,parts,links)[0].paymentStatus,'Pagado parcialmente');
 const before=JSON.stringify({charges,parts,links});model.chargeSummary(charges,parts,links);assert.equal(JSON.stringify({charges,parts,links}),before);
 parts.push({id:'refund',status:'completed',amount:-20});links.push({chargeId:'charge',paymentId:'refund',amount:-20});assert.equal(model.chargeSummary(charges,parts,links)[0].remaining,70);
 for(const [status,label] of [['confirmed','Confirmada'],['no_show','No presentada'],['cancelled','Cancelada usuario'],['completed','Realizada']])assert.equal(model.appointmentState({status}),label);
 for(const file of ['modules/care-finance-model.js','modules/patient-financial-history.js'])new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
 console.log(count+' flujos reales aislados de cobro/cancelación y modelo de anticipos, parciales, devolución y estados: OK, solo datos ficticios.');
})().catch(e=>{console.error(e);process.exitCode=1});
