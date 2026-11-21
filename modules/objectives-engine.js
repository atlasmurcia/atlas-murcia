(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AtlasObjectivesEngine=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const METRICS=[
  {key:'revenue',label:'Facturación',short:'Facturación',unit:'€'},
  {key:'mbst_sessions',label:'MBST',short:'MBST',unit:'sesiones'},
  {key:'bomba_sessions',label:'Bomba',short:'Bomba',unit:'sesiones'},
  {key:'robot_traction_sessions',label:'Robot / Tracción',short:'Robot / Tracción',unit:'sesiones'},
  {key:'brains_sessions',label:'Brains',short:'Brains',unit:'sesiones'}
 ];
 const CLINICS=['Murcia','Alicante','Barcelona'];
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const percent=(value,target)=>target>0?number(value)/number(target)*100:null;
 function rankClinics(clinics){const rows=(clinics||[]).map(clinic=>({...clinic,values:{...(clinic.values||{})},targets:{...(clinic.targets||{})},ranks:{}}));for(const metric of METRICS){const values=[...new Set(rows.map(row=>number(row.values[metric.key])).sort((a,b)=>b-a))];rows.forEach(row=>row.ranks[metric.key]=values.indexOf(number(row.values[metric.key]))+1)}return rows}
 function mergeExternalClinics(snapshot,external){const base={...(snapshot||{}),clinics:[...((snapshot?.clinics)||[])]};if(!external||String(external.period||'').slice(0,7)!==String(base.period||'').slice(0,7))return base;const allowed=new Set(['Alicante','Barcelona']);for(const clinic of external.clinics||[]){const name=String(clinic?.name||'');if(!allowed.has(name))continue;const clean={name,live:clinic.live===true,values:Object.fromEntries(METRICS.map(metric=>[metric.key,number(clinic.values?.[metric.key])])),targets:Object.fromEntries(METRICS.map(metric=>[metric.key,number(clinic.targets?.[metric.key])])),generated_at:clinic.generated_at||external.generated_at||null};const index=base.clinics.findIndex(item=>String(item?.name||'')===name);if(index>=0)base.clinics[index]=clean;else base.clinics.push(clean)}return base}
 function normalizeSnapshot(snapshot){const supplied=new Map((snapshot?.clinics||[]).map(clinic=>[String(clinic.name||''),clinic]));return rankClinics(CLINICS.map(name=>{const row=supplied.get(name)||{};return {name,live:row.live===true,values:Object.fromEntries(METRICS.map(metric=>[metric.key,number(row.values?.[metric.key])])),targets:Object.fromEntries(METRICS.map(metric=>[metric.key,number(row.targets?.[metric.key])]))}}))}
 function formatValue(metric,value){const numeric=number(value);if(metric.unit==='€')return Math.round(numeric).toLocaleString('es-ES')+' €';return numeric.toLocaleString('es-ES',{minimumFractionDigits:Number.isInteger(numeric)?0:1,maximumFractionDigits:1})}
 function progressText(value,target,metric){const numeric=number(value),goal=number(target);if(goal<=0)return {percent:null,label:'Sin objetivo este mes',missing:null};const pct=percent(numeric,goal),missing=Math.max(0,goal-numeric);return {percent:pct,label:pct.toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:1})+' %',missing:'Faltan '+formatValue(metric,missing)}}
 return {METRICS,CLINICS,number,percent,rankClinics,mergeExternalClinics,normalizeSnapshot,formatValue,progressText};
});
