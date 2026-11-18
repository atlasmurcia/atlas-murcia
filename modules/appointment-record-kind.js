// Clasificación de lectura: los cobros vinculados a citas reales siguen siendo citas.
(()=>{
 const saleKinds=new Set(['direct_sale','historical_sale']);
 const saleReference=/^(?:koibox-sale-|atlas-direct-sale-)/;
 let reviewed=[];
 window.atlasSetAppointmentRecordClassifications=function(payload){
  reviewed=(Array.isArray(payload?.records)?payload.records:[]).filter(item=>item&&item.decision==='payment_only'&&saleKinds.has(item.kind)&&typeof item.appointmentId==='string'&&item.appointmentId&&typeof item.clientRef==='string'&&item.clientRef&&typeof item.paymentId==='string'&&item.paymentId).map(item=>({...item}));
 };
 window.atlasIsPaymentOnlyAppointmentId=id=>reviewed.some(item=>item.appointmentId===String(id||''));
 window.atlasIsAppointmentRecord=function(row){
  if(!row||typeof row!=='object')return false;
  const meta=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  if(saleKinds.has(String(meta.kind||row.kind||'').toLowerCase()))return false;
  const ids=[row.id,row.centralId].filter(Boolean).map(String),refs=[row.client_ref,row.centralRef].filter(Boolean).map(String);
  if(reviewed.some(item=>ids.includes(item.appointmentId)&&refs.includes(item.clientRef)))return false;
  return ![row.client_ref,row.centralRef,row.id].some(ref=>saleReference.test(String(ref||'')));
 };
 window.addEventListener?.('message',event=>{
  if(!window.parent||event.source!==window.parent||event.data?.type!=='atlas:record-classifications')return;
  window.atlasSetAppointmentRecordClassifications(event.data.payload);
  if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('atlas:record-classifications-ready'));
 });
})();
