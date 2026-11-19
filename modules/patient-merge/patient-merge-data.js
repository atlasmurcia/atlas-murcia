/* Lecturas por familia; los UUID guardados y las rutinas fiscales permanecen intactos. */
(function(root){
 'use strict';
 const cache=new Map(),signatures=new Map(),missing=e=>['PGRST202','42883'].includes(String(e?.code||''));let pollScope=null,pollDb=null,pollStarted=false;
 const uuid=v=>String(v||'');
 function index(groups){
  const map=new Map();for(const g of groups){const ids=[...new Set(g.patientIds||[])];
   if(!g.canonicalId||!ids.includes(g.canonicalId))throw Error('Familia de fichas incompleta.');
   for(const id of ids){if(map.has(id))throw Error('Una ficha aparece en dos familias.');map.set(id,{id:g.canonicalId,ids});}
  }
  return {groups,canonical:id=>map.get(uuid(id))?.id||uuid(id),ids:id=>map.get(uuid(id))?.ids||[uuid(id)].filter(Boolean),has:id=>map.has(uuid(id))};
 }
 async function families(db,c,force=false){
  const key=[c.userId,c.organizationId,c.clinicId].join(':'),old=cache.get(key);
  if(!force&&old&&Date.now()-old.at<3000)return old.value;
  const r=await db.rpc('atlas_patient_merge',{action:'families',payload:{organizationId:c.organizationId,clinicId:c.clinicId}});
  if(r.error&&!missing(r.error))throw r.error;
  if(!r.error&&!Array.isArray(r.data))throw Error('Respuesta de fusión no válida.');
  const value=index(r.error?[]:r.data),signature=JSON.stringify(value.groups);cache.set(key,{at:Date.now(),value});
  const previous=signatures.get(key);signatures.set(key,signature);
  if(previous!==undefined&&previous!==signature&&root.dispatchEvent)root.dispatchEvent(new CustomEvent('atlas:patient-merge-data-changed'));
  if(root.document){pollScope={...c};pollDb=db;if(!pollStarted){pollStarted=true;
   const poll=()=>{const current=root.ATLAS_CENTRAL_CONTEXT;if(!root.document.hidden&&current&&[current.userId,current.organizationId,current.clinicId].join(':')===[pollScope.userId,pollScope.organizationId,pollScope.clinicId].join(':'))families(pollDb,current,true).catch(()=>{});};
   setInterval(poll,15000);root.addEventListener('focus',poll);root.document.addEventListener('visibilitychange',poll);
  }}
  return value;
 }
 function scoped(base,c){return base.eq('organization_id',c.organizationId).eq('clinic_id',c.clinicId);}
 function relatedDb(base,c,f){
  if(!f.groups.length)return base;
  function from(table){
   const steps=[];let promise;
   const proxy=new Proxy({}, {get(_,method){
    if(method==='then')return (resolve,reject)=>(promise||=run()).then(resolve,reject);
    if(method==='catch')return reject=>(promise||=run()).catch(reject);
    if(method==='finally')return fn=>(promise||=run()).finally(fn);
    return (...args)=>{steps.push([method,args]);return proxy;};
   }});
   async function run(){
    const first=steps[0]?.[0],isRead=first==='select';let commands=steps.map(([m,a])=>[m,[...a]]);
    // Un upsert de una cita o plan existente conserva su patient_id histórico.
    if(first==='upsert'){
     const values=commands[0][1][0],rows=Array.isArray(values)?values:[values],out=[];
     for(const row of rows){let current=null;
      if(row?.patient_id&&(row.id||row.client_ref)){
       let q=scoped(base.from(table).select('id,patient_id'),c);q=row.id?q.eq('id',row.id):q.eq('client_ref',row.client_ref);
       const r=await q.maybeSingle();if(r.error)return r;current=r.data;
      }
      out.push(current?.patient_id&&f.canonical(current.patient_id)===f.canonical(row.patient_id)?{...row,patient_id:current.patient_id}:row);
     }
     commands[0][1][0]=Array.isArray(values)?out:out[0];
    }
    const photo=table==='documents'&&commands.some(([m,a])=>m==='eq'&&a[0]==='client_ref'&&a[1]==='atlas-patient-photo');
    const singlePhoto=isRead&&photo&&commands.some(([m])=>m==='maybeSingle');
    if(singlePhoto)commands=commands.filter(([m])=>m!=='maybeSingle').map(([m,a])=>m==='select'?[m,[a[0]==='*'?'*':[...new Set([...String(a[0]).split(','),'patient_id','updated_at'])].join(','),...a.slice(1)]]:[m,a]);
    let q=base.from(table);
    for(let [method,args] of commands){
     if(method==='eq'&&args[0]==='patient_id'&&args[1]){method='in';args=['patient_id',f.ids(args[1])];}
     else if(method==='in'&&args[0]==='patient_id')args=['patient_id',[...new Set(args[1].flatMap(id=>f.ids(id)))]];
     else if(isRead&&table==='patients'&&method==='eq'&&args[0]==='id')args=['id',f.canonical(args[1])];
     q=q[method](...args);
    }
    let result=await q;if(result.error)return result;
    if(singlePhoto){const patient=steps.find(([m,a])=>m==='eq'&&a[0]==='patient_id')?.[1]?.[1],canonical=f.canonical(patient);
     const rows=(result.data||[]).slice().sort((a,b)=>Number(b.patient_id===canonical)-Number(a.patient_id===canonical)||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
     result={...result,data:rows[0]||null};
    }
    // Un código antiguo abre la ficha definitiva, manteniendo la búsqueda anterior.
    if(isRead&&table==='patients'&&!Array.isArray(result.data)&&result.data?.id&&f.canonical(result.data.id)!==result.data.id){
     const r=await scoped(base.from('patients').select('*'),c).eq('id',f.canonical(result.data.id)).maybeSingle();
     if(r.error)return r;if(r.data)result={...result,data:Object.fromEntries(Object.keys(result.data).map(k=>[k,r.data[k]]))};
    }
    return result;
   }
   return proxy;
  }
  async function rpc(name,args){
   if(/^atlas_create_patient_sale_v\d+$/.test(name)&&args?.p_patient_id)args={...args,p_patient_id:f.canonical(args.p_patient_id)};
   if(['atlas_upsert_budget','atlas_upsert_budget_checked'].includes(name)&&args?.p_patient_id&&args?.p_client_ref){
    const r=await scoped(base.from('budgets').select('patient_id'),c).eq('client_ref',args.p_client_ref).maybeSingle();if(r.error)return r;
    if(r.data?.patient_id&&f.canonical(r.data.patient_id)===f.canonical(args.p_patient_id))args={...args,p_patient_id:r.data.patient_id};
   }
   if(name==='atlas_charge_budget_checked'&&args?.p_payload?.budget_id){
    const p=args.p_payload,r=await scoped(base.from('budgets').select('patient_id'),c).eq('id',p.budget_id).maybeSingle();if(r.error)return r;
    if(r.data?.patient_id&&f.canonical(r.data.patient_id)===f.canonical(p.patient_id))args={...args,p_payload:{...p,patient_id:r.data.patient_id}};
   }
   return base.rpc(name,args);
  }
  return new Proxy(base,{get(obj,key){if(key==='from')return from;if(key==='rpc')return rpc;const value=obj[key];return typeof value==='function'?value.bind(obj):value;}});
 }
 function viewRows(action,data,f){
  if(!f.groups.length||!data)return data;
  if(action==='patients:list'){
   const byId=new Map(data.map(p=>[uuid(p.id),p])),rows=[];
   for(const p of data){if(f.canonical(p.id)!==uuid(p.id))continue;const members=f.ids(p.id).map(id=>byId.get(id)).filter(Boolean);
    rows.push({...p,alias_ids:f.ids(p.id),alias_codes:members.map(x=>String(x.patient_number)),alias_phones:members.map(x=>x.phone).filter(Boolean),
     income:members.reduce((n,x)=>n+Number(x.income||0),0),debt:members.reduce((n,x)=>n+Number(x.debt||0),0),last_sale:members.map(x=>x.last_sale||'').sort().at(-1)||''});
   }return rows;
  }
  if(action==='patients:invoiceTotals'){
   const totals=new Map();for(const r of data){const id=f.canonical(r.patient_id);totals.set(id,(totals.get(id)||0)+Number(r.invoiced_total||0));}
   return [...totals].map(([patient_id,invoiced_total])=>({patient_id,invoiced_total,invoice_threshold_reached:invoiced_total>=1300}));
  }
  const map=row=>{
   if(!row||typeof row!=='object')return row;
   // La normalización es solo de presentación; se conserva el UUID fuente.
   if(row.patient_id&&f.has(row.patient_id))return {...row,patient_id:f.canonical(row.patient_id),source_patient_id:row.patient_id};
   const result={...row};
   for(const k of ['patients','appointments','budgets','payments','plans','tasks','surveys','documents','communications','jobs'])
    if(Array.isArray(row[k]))result[k]=k==='patients'?viewRows('patients:list',row[k],f):row[k].map(map);
   return result;
  };
  return Array.isArray(data)?data.map(map):map(data);
 }
 async function indicators(base,c,id,f,load){
  const rows=await Promise.all(f.ids(id).map(p=>load(base,c,p)));if(rows.length===1)return rows[0];
  const sum=k=>rows.some(r=>r[k]===null)?null:Math.round(rows.reduce((n,r)=>n+Number(r[k]||0),0)*100)/100;
  const completed=sum('completed'),pending=sum('pending');
  return {...rows[0],completed,pending,progress:completed+pending?Math.round(completed/(completed+pending)*100):null,
   next:rows.map(r=>r.next).filter(Boolean).sort()[0]||null,last:rows.map(r=>r.last).filter(Boolean).sort().at(-1)||null,
   balance:sum('balance'),collected:sum('collected'),totalSales:sum('totalSales')};
 }
 const api={families,index,relatedDb,viewRows,indicators,invalidate(){cache.clear();}};
 root.AtlasPatientMergeData=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
