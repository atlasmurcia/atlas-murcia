const assert=require('node:assert/strict');
const engine=require('../modules/objectives-engine.js');

const rows=engine.normalizeSnapshot({clinics:[
 {name:'Murcia',live:true,values:{revenue:150200,mbst_sessions:340,bomba_sessions:120,robot_traction_sessions:210,brains_sessions:40},targets:{revenue:150000,mbst_sessions:340,bomba_sessions:320,robot_traction_sessions:210,brains_sessions:180}},
 {name:'Alicante',live:false,values:{revenue:65000,mbst_sessions:250,bomba_sessions:100,robot_traction_sessions:110,brains_sessions:0},targets:{revenue:65000,mbst_sessions:250,bomba_sessions:100,robot_traction_sessions:110,brains_sessions:0}},
 {name:'Barcelona',live:false,values:{},targets:{}}
]});
assert.equal(rows.find(row=>row.name==='Murcia').ranks.revenue,1);
assert.equal(rows.find(row=>row.name==='Alicante').ranks.revenue,2);
assert.equal(rows.find(row=>row.name==='Barcelona').ranks.revenue,3);
assert.equal(engine.progressText(150200,150000,engine.METRICS[0]).label,'100,1 %');
assert.equal(engine.progressText(0,0,engine.METRICS[4]).label,'Sin objetivo este mes');
assert.equal(engine.progressText(120,320,engine.METRICS[2]).missing,'Faltan 200');
const tied=engine.rankClinics([{values:{revenue:10}},{values:{revenue:10}},{values:{revenue:5}}]);
assert.deepEqual(tied.map(row=>row.ranks.revenue),[1,1,2]);
console.log('Objetivos: cálculo de porcentajes, faltantes y clasificaciones correcto.');
