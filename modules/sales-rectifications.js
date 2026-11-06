/* Proyección de lectura: no emite, altera ni anula documentos fiscales o cobros. */
(function(root){
 'use strict';
 const isRectification=row=>row?.record_type==='rectification';
 const matchesType=(row,type)=>!type||type==='all'||(type==='rectifications'?isRectification(row):!isRectification(row));
 const negativeLines=lines=>(lines||[]).map(line=>{const out={...line};for(const field of ['total','amount','totalGross','subtotal','tax_amount'])if(out[field]!=null)out[field]=-Math.abs(Number(out[field])||0);return out});
 function toRow(invoice,payment={},patient={},original={}){
  const recipient=invoice.recipient||{},metadata=payment.metadata||{};
  return{id:'rectification:'+invoice.id,payment_id:invoice.payment_id,invoice_id:invoice.id,record_type:'rectification',patient_id:payment.patient_id||null,patient:[patient.first_name,patient.last_name_1,patient.last_name_2].filter(Boolean).join(' ')||recipient.name||metadata.patient_name||'',dni_nie:patient.dni_nie||recipient.tax_id||'',paid_at:invoice.created_at,report_date:invoice.issue_date,issue_date:invoice.issue_date,amount:-Math.abs(Number(invoice.total)||0),method:payment.method_label||metadata.payment_method_label||payment.method||'',service:(invoice.lines||[]).map(line=>line.description).filter(Boolean).join(' + ')||'Rectificación de venta',receipt_number:payment.receipt_number||null,receipt_lines:negativeLines(invoice.lines),invoice_number:invoice.invoice_number,original_invoice_number:original.invoice_number||'',rectification_reason:invoice.rectification_reason||''};
 }
 async function read(db,context,from,to){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to)throw new Error('Indica un periodo de fechas válido.');
  const columns={sales_invoices:'id,payment_id,invoice_number,issue_date,original_invoice_id,invoice_type,status,total,lines,recipient,created_at,rectification_reason',payments:'id,patient_id,method,receipt_number,method_label:metadata->payment_method_label',patients:'id,first_name,last_name_1,last_name_2,dni_nie'};
  const scope=table=>db.from(table).select(columns[table]).eq('organization_id',context.organizationId).eq('clinic_id',context.clinicId);
  const invoices=[];for(let offset=0;;offset+=500){const page=await scope('sales_invoices').eq('invoice_type','R1').eq('status','issued').gte('issue_date',from).lte('issue_date',to).order('id',{ascending:true}).range(offset,offset+499);if(page.error)throw page.error;invoices.push(...(page.data||[]));if((page.data||[]).length<500)break}
  const lookup=async(table,ids)=>{const out=[];for(let offset=0;offset<ids.length;offset+=100){const result=await scope(table).in('id',ids.slice(offset,offset+100));if(result.error)throw result.error;out.push(...(result.data||[]))}return out};
  const unique=values=>[...new Set(values.filter(Boolean))];
  const [payments,originals]=await Promise.all([lookup('payments',unique(invoices.map(x=>x.payment_id))),lookup('sales_invoices',unique(invoices.map(x=>x.original_invoice_id)))]);
  const patients=await lookup('patients',unique(payments.map(x=>x.patient_id))),byPayment=new Map(payments.map(x=>[x.id,x])),byPatient=new Map(patients.map(x=>[x.id,x])),byInvoice=new Map(originals.map(x=>[x.id,x]));
  return invoices.map(invoice=>{const payment=byPayment.get(invoice.payment_id)||{};return toRow(invoice,payment,byPatient.get(payment.patient_id)||{},byInvoice.get(invoice.original_invoice_id)||{})});
 }
 const api={isRectification,matchesType,negativeLines,toRow,read};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.AtlasSalesRectifications=api;
})(typeof window!=='undefined'?window:null);
