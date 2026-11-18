const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync('modules/ficha.html','utf8');
const definitions=source.slice(source.indexOf('function clinicalInitialAssessmentDate('),source.indexOf('let clinicalRecognition='));
function fixture(history={}){
 const context={patientRecord:{clinicalHistory:history,consultations:[]},clinicalBackground:{value:'Antecedentes de prueba'},clinicalDiagnosis:{value:'Valoración de prueba'},clinicalAlerts:{value:''},clinicalGoals:{value:''},clinicalOwner:{value:'Profesional de prueba'},clinicalHistorySummary:{innerHTML:''},clinicalConsultations:{innerHTML:''},escapeHtml:s=>String(s),fmtDateTime:s=>s||'Sin registrar',writePatientRecord:()=>{},Date};
 vm.createContext(context);vm.runInContext(definitions,context);return context;
}
test('Muestra primero la fecha de la valoración, antes de los antecedentes',()=>{
 const c=fixture({background:'Prueba',updatedAt:'2026-11-17T09:30:00Z'});c.renderClinicalHistory();
 assert.match(c.clinicalHistorySummary.innerHTML,/^<div class="row" data-initial-assessment-date><span>Fecha de valoración inicial<\/span><b>17\/11\/2026<\/b>/);
});
test('Escoge la primera versión y mantiene la fecha aunque se actualice la historia',()=>{
 const c=fixture();const histories=[{background:'Revisión',updatedAt:'2026-11-18T17:00:00Z'},{background:'Valoración',updatedAt:'2026-11-05T10:00:00Z'}];
 const date=c.clinicalInitialAssessmentDate(histories);assert.equal(date,'2026-11-05T10:00:00Z');
 c.patientRecord.clinicalHistory={...histories[0],initialAssessmentAt:date};c.saveClinicalHistory();c.saveClinicalHistory();
 assert.equal(c.patientRecord.clinicalHistory.initialAssessmentAt,date);assert.match(c.clinicalHistorySummary.innerHTML,/05\/11\/2026/);
});
test('Una valoración nueva obtiene fecha y la conserva al volver a guardar',()=>{
 const c=fixture();c.saveClinicalHistory();const date=c.patientRecord.clinicalHistory.initialAssessmentAt;assert(Number.isFinite(Date.parse(date)));c.saveClinicalHistory();assert.equal(c.patientRecord.clinicalHistory.initialAssessmentAt,date);
});
test('No confunde la fecha de importación con una valoración ni inventa fechas ausentes',()=>{
 const c=fixture();
 for(const history of [{background:'Importado',updatedBy:'Importación Murcia',updatedAt:'2026-01-01'},{background:'Importado',updatedBy:'Importación Koibox',createdAt:'2026-01-01'},{background:'Importado',importedFrom:'koibox',createdAt:'2026-01-01'},{background:'Importado',source:'Koibox',createdAt:'2026-01-01'},{background:'Sin fecha'},{background:'Inválida',updatedAt:'incorrecta'},{}])assert.equal(c.clinicalInitialAssessmentDate([history]),'');
 assert.equal(c.clinicalInitialAssessmentLabel(''),'Sin registrar');c.renderClinicalHistory();assert.match(c.clinicalHistorySummary.innerHTML,/valoración inicial<\/span><b>Sin registrar/);
});
test('Usa la fecha de España en cambios de día',()=>{const c=fixture();assert.equal(c.clinicalInitialAssessmentLabel('2026-11-17T23:30:00Z'),'18/11/2026')});
test('Al cargar el servidor muestra la historia reciente con la fecha de la primera versión',async()=>{
 const c=fixture();Object.assign(c,{centralReady:true,currentPatient:{remoteId:'synthetic-patient'},loading:false,reloadAfterLoad:false,notesPatientId:'synthetic-patient',historyVersionCount:0,importedHistoryNoteCount:0,importedHistoryNotes:[],confirmedRefs:new Set(),latest:items=>items.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0],meaningfulHistory:h=>!!h?.background,importedHistoryRecord:()=>false,importedHistoryRow:()=>false,recordRef:()=>{},fromCentral:row=>row.content.record,blankClinicalHistory:()=>({}),renderClinicalEvolutions:()=>{},request:async()=>[
 {record_type:'history',client_ref:'synthetic-new',content:{record:{background:'Revisión reciente',updatedAt:'2026-11-18T12:00:00Z'}}},
 {record_type:'history',client_ref:'synthetic-first',content:{record:{background:'Valoración inicial',updatedAt:'2026-11-05T12:00:00Z'}}}
 ]});
 vm.runInContext(source.slice(source.lastIndexOf(' async function loadCentral(){'),source.indexOf('\n const renderHistoryBase=',source.lastIndexOf(' async function loadCentral(){'))),c);await c.loadCentral();
 assert.equal(c.patientRecord.clinicalHistory.background,'Revisión reciente');assert.equal(c.patientRecord.clinicalHistory.initialAssessmentAt,'2026-11-05T12:00:00Z');assert.match(c.clinicalHistorySummary.innerHTML,/05\/11\/2026/);
});
