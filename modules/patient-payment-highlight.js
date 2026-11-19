// Actualiza solo el resumen en memoria y el color. No guarda pacientes ni cobros.
(()=>{
 let timer,busy=false,again=false;
 async function refresh(){
  if(document.hidden||typeof window.atlasCentralRequest!=='function')return;
  if(busy){again=true;return}busy=true;
  try{
   const rows=await window.atlasCentralRequest('patients:list'),byId=new Map((rows||[]).map(row=>[String(row.id),row]));
   let changed=false;
   for(const patient of patientMaster){const row=byId.get(String(patient.remoteId||''));if(!row)continue;const income=Number(row.income);if(Number.isFinite(income)&&patientPaymentTotals.get(String(patient.remoteId))!==income){patientPaymentTotals.set(String(patient.remoteId),income);changed=true}}
   if(changed){renderPatientsTable();render();const name=document.getElementById('dName'),appointment=appointments.find(a=>String(a.id)===String(selectedId));if(name&&appointment)name.classList.toggle('patient-payment-highlight',patientPaymentHighlight(linkedPatientForAppointment(appointment)))}
  }catch(error){console.warn('No se pudo actualizar el color por pagos acumulados',error)}
  finally{busy=false;if(again){again=false;schedule()}}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(refresh,400)}
 window.addEventListener('message',event=>{if(['atlas:central-payments-changed','atlas:central-cash-changed','atlas:payment-recorded','atlas:budget-payment-recorded','atlas:server-recovered'].includes(event.data?.type))schedule()});
 window.addEventListener('focus',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
})();
