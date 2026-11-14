(function(){
 const inflightByClient=new WeakMap();
 // Share only pending reads; the next refresh always reads the server again.
 window.atlasLoadPatientDirectory=function(db,context,signPhotos){
  const scope={organizationId:context.organizationId,clinicId:context.clinicId,userId:context.userId};
  const key=JSON.stringify([scope.organizationId,scope.clinicId,scope.userId]);
  let inflight=inflightByClient.get(db);if(!inflight){inflight=new Map();inflightByClient.set(db,inflight)}
  if(inflight.has(key))return inflight.get(key);
  const task=load(db,scope,signPhotos).finally(()=>inflight.delete(key));
  inflight.set(key,task);return task;
 };
 async function load(db,scope,signPhotos){
  const pageSize=1000,parallel=4,queue=[];let active=0,failure=null;
  function pump(){
   while(active<parallel&&queue.length){
    const {read,resolve,reject}=queue.shift();active++;
    Promise.resolve().then(()=>{if(failure)throw failure;return read()}).then(result=>{
     if(result.error){failure=result.error;reject(result.error)}else resolve(result.data||[]);
    },error=>{failure=error;reject(error)}).finally(()=>{active--;pump()});
   }
  }
  const run=read=>new Promise((resolve,reject)=>{queue.push({read,resolve,reject});pump()});
  const scoped=(table,fields)=>db.from(table).select(fields).eq('organization_id',scope.organizationId).eq('clinic_id',scope.clinicId);
  async function readAll(makeQuery){
   const rows=[];
   for(let offset=0;;offset+=pageSize*2){
    const pages=await Promise.all([offset,offset+pageSize].map(from=>run(()=>makeQuery().range(from,from+pageSize-1))));
    // Read in range order even when the later page finishes first.
    for(const page of pages){rows.push(...page);if(page.length<pageSize)return rows}
   }
  }
  const [rows,signed,paymentRows,debtRows]=await Promise.all([
   readAll(()=>scoped('patients','id,patient_number,first_name,last_name_1,last_name_2,dni_nie,phone,landline,email,birth_date,sex,address,city,postal_code,source,category,category_date,administrative_notes,active,historical_income,historical_debt,historical_financials_at').is('deleted_at',null).order('patient_number',{ascending:false}).order('id',{ascending:true})),
   readAll(()=>scoped('documents','patient_id,storage_path,updated_at').eq('client_ref','atlas-patient-photo').is('deleted_at',null).order('id',{ascending:true})).then(signPhotos),
   readAll(()=>scoped('payments','patient_id,amount,status,paid_at').is('deleted_at',null).in('status',['completed','refunded']).order('id',{ascending:true})),
   readAll(()=>scoped('patient_debts','patient_id,amount_remaining,is_settled,debt_date').eq('is_settled',false).order('id',{ascending:true}))
  ]);
  const byPatient=new Map(signed.map(photo=>[String(photo.patient_id),photo.storage_path_url||''])),incomeByPatient=new Map(),paymentsByPatient=new Map(),debtByPatient=new Map(),lastSaleByPatient=new Map();
  paymentRows.forEach(payment=>{const id=String(payment.patient_id||'');if(!id)return;incomeByPatient.set(id,(incomeByPatient.get(id)||0)+Number(payment.amount||0));if(!paymentsByPatient.has(id))paymentsByPatient.set(id,[]);paymentsByPatient.get(id).push(payment);if(payment.paid_at&&String(payment.paid_at)>String(lastSaleByPatient.get(id)||''))lastSaleByPatient.set(id,payment.paid_at)});
  debtRows.forEach(debt=>{const id=String(debt.patient_id||'');if(id)debtByPatient.set(id,(debtByPatient.get(id)||0)+Number(debt.amount_remaining||0))});
  return rows.map(patient=>{const id=String(patient.id),hasHistorical=patient.historical_income!==null&&patient.historical_income!==undefined,cutoff=patient.historical_financials_at||'',newIncome=hasHistorical?(paymentsByPatient.get(id)||[]).filter(payment=>payment.paid_at&&String(payment.paid_at)>String(cutoff)).reduce((sum,payment)=>sum+Number(payment.amount||0),0):0,income=hasHistorical?Number(patient.historical_income||0)+newIncome:Number(incomeByPatient.get(id)||0),currentDebt=Number(debtByPatient.get(id)||0),debt=currentDebt||Number(patient.historical_debt||0);return {...patient,photo:byPatient.get(id)||'',income:Number(income.toFixed(2)),debt:Number(debt.toFixed(2)),last_sale:lastSaleByPatient.get(id)||''}});
 }
})();
