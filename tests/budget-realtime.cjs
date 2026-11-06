const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../atlas.html','utf8');
const auth=html.split('<script id="atlas-central-auth-v10">')[1].split('</script>')[0];
assert.match(auth,/table:'budgets'/,'ATLAS debe suscribirse a los cambios de presupuestos');
assert.match(auth,/filter:'clinic_id=eq\.'\+context\.clinicId/,'La suscripción debe limitarse a la clínica activa');
assert.match(auth,/type:'atlas:central-budgets-changed'/,'El aviso debe recargar solo el presupuesto abierto');
assert.match(auth,/db\.removeChannel\(budgetsChannel\)/,'ATLAS debe cerrar la suscripción anterior al cambiar de sesión');
console.log('Realtime de presupuestos: suscripción por clínica, aviso al editor y limpieza de sesión comprobados.');
