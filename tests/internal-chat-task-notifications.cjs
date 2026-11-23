const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const atlas=fs.readFileSync('atlas.html','utf8');
const start=atlas.indexOf(' async function chatRequest(action,payload={}){');
const end=atlas.indexOf('\n window.atlasInternalChatRequestV136=chatRequest;',start);
assert(start>=0&&end>start,'No se encontró el puente del chat interno');
const chatRequestSource=atlas.slice(start,end).trim();
const chatStart=atlas.indexOf('<script id="atlas-v136-internal-chat">'),chatEnd=atlas.indexOf('</script>',chatStart),identitySource=atlas.slice(chatStart,chatEnd).split('\n').filter(line=>/^\s*const (normalize|personKey|samePerson)=/.test(line)).join('\n');
function fixture(directory=[{user_id:'synthetic-recipient',full_name:'Auxiliar de prueba'}]){
 const inserted=[];
 const client={
  auth:{getSession:async()=>({data:{session:{user:{id:'synthetic-sender'}}},error:null})},
  rpc:async(name,args)=>({data:name==='atlas_chat_directory'&&args.p_clinic_id==='synthetic-clinic'?directory:[],error:null}),
  from(table){assert.equal(table,'internal_chat_messages');return {insert(row){inserted.push(row);return {select(){return {single:async()=>({data:{...row,id:'synthetic-db-id',read_at:null,deleted_at:null,deleted_by_user_id:null,deleted_by_name:null},error:null})}}}}}}
 };
 const context={centralDb:()=>client,me:()=>({userId:'synthetic-sender',organizationId:'synthetic-org',clinicId:'synthetic-clinic'}),currentName:()=> 'Equipo de prueba',crypto:{randomUUID:()=> 'synthetic-client-ref'},chatRowToMessage:row=>({id:row.client_ref,senderId:row.sender_user_id,recipientId:row.recipient_user_id,senderName:row.sender_name,recipientName:row.recipient_name,text:row.body,createdAt:row.created_at}),CHAT_RETENTION_MS:7*86400000};
 return {chatRequest:vm.runInNewContext('('+chatRequestSource+')',context),inserted};
}
test('Envía un mensaje de chat a la cuenta asignada sin incluir el detalle de la tarea',async()=>{
 const {chatRequest,inserted}=fixture();
 const result=await chatRequest('internal-chat:task-assigned',{recipientId:'synthetic-recipient',area:'auxiliar',title:'No incluir este título'});
 assert.equal(inserted.length,1);assert.equal(inserted[0].recipient_user_id,'synthetic-recipient');assert.equal(inserted[0].recipient_name,'Auxiliar de prueba');assert.equal(inserted[0].sender_user_id,'synthetic-sender');assert.match(inserted[0].body,/tarea nueva de Auxiliar/);assert.match(inserted[0].body,/selecciona «Mis tareas»/);assert.match(inserted[0].body,/quita los filtros de fecha/);assert(!inserted[0].body.includes('No incluir este título'));assert.equal(result.payload.id,'synthetic-client-ref');
});
test('No crea mensajes para destinatarios fuera del directorio de la clínica ni para uno mismo',async()=>{
 const outside=fixture([]);await assert.rejects(outside.chatRequest('internal-chat:task-assigned',{recipientId:'synthetic-outside',area:'fisio'}),/no está disponible en el chat interno/);assert.equal(outside.inserted.length,0);
 const self=fixture();const result=await self.chatRequest('internal-chat:task-assigned',{recipientId:'synthetic-sender',area:'fisio'});assert.equal(result,null);assert.equal(self.inserted.length,0);
});
test('La cuenta de Gerencia Murcia se muestra como Rubén y conserva el destinatario real',()=>{
 const fallbackUsers=[['Rubén Soler','Propietario']],profile={user_id:'synthetic-gerencia',full_name:'Gerencia FisioSport Murcia',role:'Gestión'};
 const mapped=vm.runInNewContext('(()=>{'+identitySource+'const known=fallbackUsers.find(([expected])=>samePerson(expected,profile.full_name));return {same:samePerson("Rubén Soler",profile.full_name),user:known?{id:profile.user_id,name:known[0],role:known[1]}:profile}})()', {fallbackUsers,profile});
 assert.equal(mapped.same,true);assert.deepEqual(JSON.parse(JSON.stringify(mapped.user)),{id:'synthetic-gerencia',name:'Rubén Soler',role:'Propietario'});
});
