// Selección y protecciones comunes; no contiene datos ni configuración de clínicas.
(function(root){
 const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 function protectedState(row){return [row.status,row.metadata?.status].some(status=>['completed','done','realizada','atendida','in_progress','en atencion','en sala','arrived'].includes(norm(status)))}
 function protectedAppointment(row){const m=row.metadata||{};return row.historico===true||m.historico===true||protectedState(row)}
 function isAppointment(row){const m=row.metadata||{};return !['direct_sale','historical_sale'].includes(norm(m.kind||row.kind))&&!/^(?:koibox-sale-|atlas-direct-sale-)/.test(String(row.client_ref||row.centralRef||row.id||''))}
 function pending(row){return !protectedState(row)&&['scheduled','pending','confirmed','pendiente','confirmada','conflicto'].includes(norm(row.status))}
 function select(rows,patientId,scope){if(!['pending','all'].includes(scope))throw Error('Selecciona Pendientes o Todas.');const seen=new Set(),selected=[],protectedRows=[];for(const row of rows||[]){if(!row?.id||String(row.patient_id)!==String(patientId)||row.deleted_at||!isAppointment(row)||seen.has(String(row.id)))continue;seen.add(String(row.id));if(scope==='pending'&&!pending(row))continue;if(protectedAppointment(row))protectedRows.push(row);else selected.push(row)}return {selected,protectedRows}}
 root.atlasPatientAppointmentBulkModel=Object.freeze({protectedAppointment,isAppointment,pending,select});
 if(typeof module!=='undefined'&&module.exports)module.exports=root.atlasPatientAppointmentBulkModel;
})(typeof window==='undefined'?globalThis:window);
