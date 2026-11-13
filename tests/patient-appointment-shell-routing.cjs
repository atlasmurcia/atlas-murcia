const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../atlas.html'),'utf8');
const route="if(msg.type==='atlas:show-patient')";
const start=source.indexOf(route);
const end=source.indexOf("if(msg.type==='atlas:new-appointment'",start);

assert(start>=0&&end>start,'Debe existir el enrutado de la ficha hacia la agenda');
const handler=source.slice(start,end);
const activate=handler.indexOf("mode('agenda')");
const forward=handler.indexOf('agendaFrame.contentWindow.postMessage');

assert(activate>=0,'El enrutado debe activar la agenda');
assert(forward>=0,'El enrutado debe reenviar la cita seleccionada');
assert(activate<forward,'La agenda debe activarse antes de recibir la orden de modificar o anular');

console.log('La ficha activa la agenda antes de enviar la orden sobre la cita.');
