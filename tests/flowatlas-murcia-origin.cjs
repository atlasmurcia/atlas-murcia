const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync(require('node:path').join(__dirname,'..','atlas.html'),'utf8');
const murciaOrigin='https://flowatlas-murcia.green-fern-6456.chatgpt.site';
const oldSharedOrigin='https://flowatlas-embudo-captacion.green-fern-6456.chatgpt.site';

assert.equal((source.match(new RegExp(murciaOrigin.replaceAll('.','\\.'),'g'))||[]).length,5);
assert.doesNotMatch(source,new RegExp(oldSharedOrigin.replaceAll('.','\\.')));
assert.match(source,/build=20261112-murcia-v4/);
assert.match(source,/e\.source!==capture\?\.contentWindow\|\|e\.origin!==/);
assert.match(source,/fromCapture=e\.source===capture\?\.contentWindow&&e\.origin===/);

console.log('PASS: ATLAS Murcia solo carga y autoriza el FlowAtlas Murcia independiente.');
