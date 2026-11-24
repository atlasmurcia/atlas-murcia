const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(process.env.ATLAS_FICHA_PATH||'modules/ficha.html','utf8');
const definitions=source.slice(source.indexOf('function clinicalInitialAssessmentDate('),source.indexOf('let clinicalRecognition='));
function fixture(history={}){
 const c={patientRecord:{clinicalHistory:history,consultations:[]},clinicalBackground:{value:''},clinicalDiagnosis:{value:''},clinicalAlerts:{value:''},clinicalGoals:{value:''},clinicalOwner:{value:'Profesional de prueba'},clinicalHistorySummary:{innerHTML:''},clinicalConsultations:{innerHTML:''},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),fmtDateTime:s=>s||'Sin registrar',writePatientRecord:()=>{},Date};vm.createContext(c);vm.runInContext(definitions,c);return c;
}
test('La historia ya no muestra ni requiere el campo Terapia pautada',()=>{
 assert(!source.includes('id="clinicalTherapy"'));const c=fixture({therapy:'Texto anterior conservado'});c.renderClinicalHistory();assert(!c.clinicalHistorySummary.innerHTML.includes('Terapia pautada'));assert(!c.clinicalHistorySummary.innerHTML.includes('Texto anterior conservado'));
});
test('Guardar otros campos conserva exactamente la terapia registrada y la fecha inicial',()=>{
 const therapy='  Pauta anterior\nCon saltos de línea  ',c=fixture({therapy,goals:'Objetivo anterior',initialAssessmentAt:'2026-11-05T10:00:00Z'});c.renderClinicalHistory();c.clinicalAlerts.value='Alerta de prueba';c.saveClinicalHistory();c.saveClinicalHistory();assert.equal(c.patientRecord.clinicalHistory.therapy,therapy);assert.equal(c.patientRecord.clinicalHistory.goals,'Objetivo anterior');assert.equal(c.patientRecord.clinicalHistory.alerts,'Alerta de prueba');assert.equal(c.patientRecord.clinicalHistory.initialAssessmentAt,'2026-11-05T10:00:00Z');
});
test('Una historia nueva se guarda sin el recuadro eliminado',()=>{
 const c=fixture();c.clinicalBackground.value='Antecedentes de prueba';c.saveClinicalHistory();assert.equal(c.patientRecord.clinicalHistory.background,'Antecedentes de prueba');assert.equal(c.patientRecord.clinicalHistory.therapy,'');
});
test('La sincronización mantiene el texto anterior aunque el campo ya no se muestre',()=>{
 const c=fixture({therapy:'Registro anterior'});c.renderClinicalHistory();c.saveClinicalHistory();const start=source.indexOf(' function payload(record,type){'),end=source.indexOf('\n async function syncRecord',start);Object.assign(c,{clone:value=>JSON.parse(JSON.stringify(value)),currentPatient:{remoteId:'synthetic-patient'},recordRef:()=> 'synthetic-ref'});vm.runInContext(source.slice(start,end),c);assert.equal(c.payload(c.patientRecord.clinicalHistory,'history').content.record.therapy,'Registro anterior');
});
