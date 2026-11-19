const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync(process.env.ATLAS_FICHA_PATH||'modules/ficha.html','utf8');
const definitions=source.slice(source.indexOf('function clinicalInitialAssessmentDate('),source.indexOf('let clinicalRecognition='));
function fixture(history={}){
 const c={patientRecord:{clinicalHistory:history,consultations:[]},clinicalBackground:{value:''},clinicalDiagnosis:{value:''},clinicalAlerts:{value:''},clinicalTherapy:{value:''},clinicalGoals:{value:''},clinicalOwner:{value:'Profesional de prueba'},clinicalHistorySummary:{innerHTML:''},clinicalConsultations:{innerHTML:''},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),fmtDateTime:s=>s||'Sin registrar',writePatientRecord:()=>{},Date};vm.createContext(c);vm.runInContext(definitions,c);return c;
}
test('Terapia tiene un campo independiente debajo de contraindicaciones y antes de objetivos',()=>{
 assert.match(source,/<textarea id="clinicalAlerts"><\/textarea><\/label><label class="field">Terapia pautada<textarea id="clinicalTherapy"[^>]*><\/textarea><\/label><label class="field">Objetivos terapéuticos/);
});
test('Guardar y volver a cargar conserva la pauta, sus saltos de línea y los objetivos anteriores',()=>{
 const c=fixture({goals:'Objetivo anterior',updatedAt:'2026-11-05T10:00:00Z'});c.renderClinicalHistory();c.clinicalTherapy.value='  Equipo de prueba\nDos sesiones  ';c.saveClinicalHistory();
 const saved=JSON.parse(JSON.stringify(c.patientRecord.clinicalHistory));assert.equal(saved.therapy,'Equipo de prueba\nDos sesiones');assert.equal(saved.goals,'Objetivo anterior');assert.equal(saved.initialAssessmentAt,'2026-11-05T10:00:00Z');
 const reopened=fixture(saved);reopened.renderClinicalHistory();assert.equal(reopened.clinicalTherapy.value,saved.therapy);assert.match(reopened.clinicalHistorySummary.innerHTML,/Terapia pautada<\/span><b>Equipo de prueba\nDos sesiones/);
});
test('Historias antiguas sin pauta mantienen sus objetivos; el texto se muestra escapado',()=>{
 const c=fixture({goals:'Objetivos conservados'});c.renderClinicalHistory();assert.equal(c.clinicalTherapy.value,'');assert.equal(c.clinicalGoals.value,'Objetivos conservados');
 c.clinicalTherapy.value='<script>prueba</script>';c.saveClinicalHistory();assert(c.clinicalHistorySummary.innerHTML.includes('&lt;script&gt;prueba&lt;/script&gt;'));assert(!c.clinicalHistorySummary.innerHTML.includes('<script>'));
});
test('Una historia que solo contiene terapia cuenta como registro clínico y se incluye en la sincronización',()=>{
 const c=fixture();const meaningful=source.match(/const meaningfulHistory=(.*?);/)[1];assert.equal(vm.runInNewContext('('+meaningful+')')({therapy:'Pauta de prueba'}),true);
 c.clinicalTherapy.value='Pauta de prueba';c.saveClinicalHistory();assert(c.clinicalInitialAssessmentDate([c.patientRecord.clinicalHistory]));
 const payloadSource=source.slice(source.indexOf(' function payload(record,type){'),source.indexOf('\n async function syncRecord',source.indexOf(' function payload(record,type){')));
 Object.assign(c,{clone:value=>JSON.parse(JSON.stringify(value)),currentPatient:{remoteId:'synthetic-patient'},recordRef:()=> 'synthetic-ref'});vm.runInContext(payloadSource,c);
 const result=c.payload(c.patientRecord.clinicalHistory,'history');assert.equal(result.content.record.therapy,'Pauta de prueba');assert.equal(result.patientId,'synthetic-patient');
});
