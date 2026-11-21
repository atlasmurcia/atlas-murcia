const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const atlas=fs.readFileSync(path.join(__dirname,'../atlas.html'),'utf8');
const agenda=fs.readFileSync(path.join(__dirname,'../modules/agenda.html'),'utf8');

assert.match(atlas,/const loadAll=async makeQuery=>\{const data=\[\],size=1000,batchSize=4;/);
assert.match(atlas,/Promise\.all\(Array\.from\(\{length:batchSize\}/);
assert.match(atlas,/\.order\('id',\{ascending:true\}\)/);
assert.match(agenda,/Pacientes no disponibles · pulsa para reintentar/);
assert.doesNotMatch(agenda,/alert\('No se han podido cargar los pacientes después de reintentarlo:/);
assert.match(agenda,/atlas-central-patients-v11/);
assert.match(atlas,/agenda\.html\?v=227/);

console.log('Pacientes: paginación concurrente y reintento no bloqueante correctos.');
