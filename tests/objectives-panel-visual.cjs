const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../atlas.html'),'utf8');
const panel=fs.readFileSync(require('node:path').join(__dirname,'../modules/objectives-panel.js'),'utf8');
const agenda=fs.readFileSync(require('node:path').join(__dirname,'../modules/agenda.html'),'utf8');
assert.match(html,/objectives-engine\.js/);assert.match(html,/objectives-panel\.js/);
assert.match(panel,/grid-template-columns:repeat\(5/);assert.match(panel,/He visto el aviso/);assert.match(panel,/Pendiente de conexión/);assert.match(panel,/caja-wow\.wav/);assert.match(panel,/atlas-objectives-tab/);assert.match(panel,/Sonido de celebración/);assert.match(panel,/Resumen de avances/);assert.match(panel,/atlas_objectives_save_settings/);
assert.match(panel,/Ocultar panel/);assert.match(panel,/Mostrar objetivos/);assert.match(panel,/openForNewSession/);assert.match(panel,/compact-style/);
assert.match(agenda,/mNoCostGift/);assert.match(agenda,/Sesión sin coste \/ regalo/);assert.match(agenda,/noCostGiftAudit/);
console.log('Objetivos: panel, pestaña plegable, confirmación y sonido presentes.');
