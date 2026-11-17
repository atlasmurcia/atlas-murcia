// Clasificación de lectura: los cobros vinculados a citas reales siguen siendo citas.
(()=>{
 const saleKinds=new Set(['direct_sale','historical_sale']);
 const saleReference=/^(?:koibox-sale-|atlas-direct-sale-)/;
 window.atlasIsAppointmentRecord=function(row){
  if(!row||typeof row!=='object')return false;
  const meta=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  if(saleKinds.has(String(meta.kind||row.kind||'').toLowerCase()))return false;
  return ![row.client_ref,row.centralRef,row.id].some(ref=>saleReference.test(String(ref||'')));
 };
})();
