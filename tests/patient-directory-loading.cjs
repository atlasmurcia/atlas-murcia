const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../modules/patient-directory.js','utf8');
const window={};vm.runInNewContext(source,{window,Map,WeakMap,Promise,JSON,Number,String});
const load=window.atlasLoadPatientDirectory,scope={organizationId:'synthetic-org',clinicId:'synthetic-clinic',userId:'synthetic-user'};
function setup(tables){
 const calls=[],queue=[];let now=0,active=0,maxActive=0,failTable=null,signs=0;
 const db={from(table){const filters=[],orders=[];return {select(){return this},eq(k,v){filters.push([k,v]);return this},is(k,v){filters.push([k,v]);return this},in(k,v){filters.push([k,v]);return this},order(k,v){orders.push([k,v]);return this},range(from,to){
  calls.push({table,from,to,filters,orders});active++;maxActive=Math.max(active,maxActive);
  return new Promise(resolve=>queue.push({at:now+500,finish(){active--;resolve(failTable===table?{error:new Error('Fallo sintético')}: {data:(tables[table]||[]).slice(from,to+1),error:null})}}));
 }}}};
 const sign=async rows=>{signs++;return rows.map(row=>({...row,storage_path_url:'synthetic-signed:'+row.storage_path}))};
 async function drive(promise){let done=false,result,error;promise.then(value=>{done=true;result=value},reason=>{done=true;error=reason});
  for(let step=0;!done&&step<1000;step++){
   await new Promise(resolve=>setImmediate(resolve));if(done)break;
   assert.ok(queue.length,'La carga avanza');queue.sort((a,b)=>a.at-b.at);now=queue[0].at;const due=queue.filter(item=>item.at===now);queue.splice(0,due.length);due.forEach(item=>item.finish());
  }
  assert.equal(done,true,'La carga termina');if(error)throw error;return result;
 }
 return {db,sign,calls,drive,get elapsed(){return now},get maxActive(){return maxActive},get signs(){return signs},fail:table=>{failTable=table}};
}
(async()=>{
 const tables={patients:[{id:'synthetic-A',patient_number:3,historical_income:100,historical_debt:20,historical_financials_at:'2026-11-01'},{id:'synthetic-B',patient_number:2,historical_income:null},{id:'synthetic-C',patient_number:1,historical_income:0,historical_debt:7}],
  documents:[{patient_id:'synthetic-A',storage_path:'synthetic-photo'}],
  payments:[{patient_id:'synthetic-A',amount:999,paid_at:'2026-10-01'},{patient_id:'synthetic-A',amount:30,paid_at:'2026-11-02'},{patient_id:'synthetic-A',amount:-5,paid_at:'2026-11-03'},{patient_id:'synthetic-B',amount:.1},{patient_id:'synthetic-B',amount:.2}],
  patient_debts:[{patient_id:'synthetic-A',amount_remaining:9}]};
 const small=setup(tables),first=load(small.db,scope,small.sign),duplicate=load(small.db,scope,small.sign);assert.equal(first,duplicate,'Los reintentos comparten la descarga pendiente');
 const rows=await small.drive(first);assert.equal(rows.length,3);assert.equal(rows[0].income,125);assert.equal(rows[0].debt,9);assert.equal(rows[0].last_sale,'2026-11-03');assert.equal(rows[0].photo,'synthetic-signed:synthetic-photo');assert.equal(rows[1].income,.3);assert.equal(rows[1].debt,0);assert.equal(rows[2].debt,7);assert.equal(small.signs,1);assert.ok(small.maxActive<=4);
 for(const call of small.calls){assert.ok(call.filters.some(([k,v])=>k==='organization_id'&&v===scope.organizationId));assert.ok(call.filters.some(([k,v])=>k==='clinic_id'&&v===scope.clinicId));assert.ok(call.orders.some(([k])=>k==='id'),'Todas las páginas tienen orden estable')}
 const calls=small.calls.length;tables.patients.push({id:'synthetic-new'});assert.equal((await small.drive(load(small.db,scope,small.sign))).length,4);assert.ok(small.calls.length>calls,'Un refresco posterior vuelve a leer datos frescos');
 // Volumen equivalente al observado, íntegramente sintético. Cada petición tarda 500 ms virtuales.
 const large=setup({patients:Array.from({length:20694},(_,i)=>({id:'synthetic-'+i,patient_number:20694-i})),payments:Array.from({length:23071},()=>({patient_id:'synthetic-0',amount:1})),documents:Array.from({length:3768},(_,i)=>({patient_id:'synthetic-'+i,storage_path:'synthetic-'+i})),patient_debts:[]});
 const all=await large.drive(load(large.db,scope,large.sign));assert.equal(all.length,20694);assert.equal(new Set(all.map(row=>row.id)).size,20694);assert.equal(all.at(-1).id,'synthetic-20693');assert.equal(all[0].income,23071);assert.ok(large.maxActive<=4);assert.ok(large.elapsed<30000);assert.ok(large.calls.length<80);console.log('Volumen grande:',large.calls.length,'peticiones, máximo',large.maxActive,'simultáneas,',large.elapsed,'ms virtuales.');
 // Fallos: no devolver listados parciales ni conservar una promesa fallida para el siguiente intento.
 const failure=setup(tables);failure.fail('payments');await assert.rejects(failure.drive(load(failure.db,scope,failure.sign)),/Fallo sintético/);failure.fail(null);assert.equal((await failure.drive(load(failure.db,scope,failure.sign))).length,4);
 const separate=setup(tables);const a=load(separate.db,scope,separate.sign),b=load(separate.db,{...scope,userId:'synthetic-other-user'},separate.sign);assert.notEqual(a,b);await separate.drive(Promise.all([a,b]));
 const html=fs.readFileSync(__dirname+'/../atlas.html','utf8');assert.match(html,/<script src="\.\/modules\/patient-directory\.js\?v=1"><\/script>/);assert.match(html,/m.action==='patients:list'\)\{result=\{data:await window.atlasLoadPatientDirectory/);
 console.log('OK: paginación completa, concurrencia limitada, deduplicación, ámbito, errores y resultados económicos conservados. Solo datos sintéticos.');
})().catch(error=>{console.error(error);process.exitCode=1});
