'use strict';
const assert=require('node:assert/strict');
const {recordIds,groups,indexGroups}=require('./patient-aliases.js');
(async()=>{
 const patient='secondary-uuid',canonical='primary-uuid',ctx={organizationId:'org',clinicId:'clinic'};
 const fallback=await recordIds({rpc:async()=>({error:{code:'PGRST202',message:'Could not find the function public.atlas_patient_merge in the schema cache'}})},ctx,patient);
 assert.deepEqual(fallback,{canonicalId:patient,ids:[patient],error:null});
 const family=await recordIds({rpc:async(name,args)=>{assert.equal(name,'atlas_patient_merge');assert.equal(args.action,'recordIds');assert.equal(args.payload.organizationId,ctx.organizationId);return {data:{canonicalId:canonical,patientIds:[canonical,patient,canonical]}}}},ctx,patient);
 assert.deepEqual(family,{canonicalId:canonical,ids:[canonical,patient],error:null});
 const denied=await recordIds({rpc:async()=>({error:{code:'42501',message:'No tienes permiso.'}})},ctx,patient);
 assert.equal(denied.error.code,'42501');assert.deepEqual(denied.ids,[]);
 const incomplete=await recordIds({rpc:async()=>({data:{canonicalId:canonical,patientIds:[canonical]}})},ctx,patient);
 assert.match(incomplete.error.message,/incompleta/);
 const grouped=await groups({rpc:async(name,args)=>{assert.equal(name,'atlas_patient_merge');assert.equal(args.action,'families');return {data:[{canonicalId:canonical,patientIds:[canonical,patient]}]}}},ctx);
 assert.deepEqual(grouped,{groups:[{canonicalId:canonical,ids:[canonical,patient]}],error:null});
 const indexed=indexGroups(grouped.groups);assert.equal(indexed.canonicalId(patient),canonical);assert.deepEqual(indexed.recordIds(patient),[canonical,patient]);assert.equal(indexed.canonicalId('unlinked'),'unlinked');
 console.log('6 comprobaciones sintéticas de resolución, agrupación e indexación de alias superadas.');
})().catch(error=>{console.error(error);process.exitCode=1});
