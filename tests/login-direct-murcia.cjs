const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','atlas.html'),'utf8');
const start=html.indexOf('async function enter(session)');
const end=html.indexOf('async function createNumberedPatient',start);
assert.ok(start>0&&end>start,'No se encontró la carga del acceso.');
const enter=html.slice(start,end);

assert.match(html,/Versión 219 · Acceso directo a Murcia/);
assert.match(enter,/atlasRestSelect\('memberships'/);
assert.doesNotMatch(enter,/atlasRestSelect\('profiles'/);
assert.doesNotMatch(enter,/atlasRestSelect\('clinics'/);
assert.match(enter,/user\.user_metadata\?\.full_name\|\|user\.email/);
assert.match(enter,/membership\.organization_id!==ATLAS_MURCIA_ORGANIZATION_ID/);
assert.match(enter,/membership\.clinic_id&&membership\.clinic_id!==ATLAS_MURCIA_CLINIC_ID/);
assert.match(enter,/organizationId:ATLAS_MURCIA_ORGANIZATION_ID,clinicId:ATLAS_MURCIA_CLINIC_ID/);

console.log('OK: el acceso usa una sola lectura de permisos y mantiene la validación de Murcia.');
