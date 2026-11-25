const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('modules/aftercare-review.js','utf8');
(async()=>{
 for(const role of ['owner','management','reception','assistant','therapist']){
  const rows=[{id:'synthetic-record',revision:2,tasks:[{id:'synthetic-task',due_at:'2027-01-12'}]}],before=JSON.stringify(rows);
  const blocked=()=>{throw Error('No debe acceder al DOM, servidor o temporizadores')};
  const window={ATLAS_CHILD_CENTRAL_CONTEXT:{role},atlasAftercareRequest:blocked,atlasAftercarePlanningContext:{prepare:blocked}};
  vm.runInNewContext(source,{window,document:new Proxy({},{get:blocked}),setInterval:blocked,setTimeout:blocked});
  await Promise.all([window.atlasAftercareReview.refresh(),window.atlasAftercareReview.refresh(),window.atlasAftercareReview.open(rows[0])]);assert.equal(JSON.stringify(rows),before);
 }
 console.log('PASS: aviso retirado para todos los roles; sin DOM, consultas, escrituras ni temporizadores.');
})().catch(error=>{console.error(error);process.exitCode=1});
