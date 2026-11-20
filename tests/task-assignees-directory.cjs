const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const shell=fs.readFileSync('atlas.html','utf8');
const helpers=shell.slice(shell.indexOf(' async function clinicTaskDirectory('),shell.indexOf(' async function addActorNames('));
assert(helpers.includes('async function clinicTaskDirectory('));
const directory=[
 {user_id:'synthetic-fisio',full_name:'Fisio de prueba',role:'Fisioterapeuta'},
 {user_id:'synthetic-reception',full_name:'Recepción de prueba',role:'Recepción'},
 {user_id:'synthetic-management',full_name:'Gestión de prueba',role:'Gestión'},
 {user_id:'synthetic-auxiliary',full_name:'Auxiliar de prueba',role:'Auxiliar'}
];
function fixture(rows=directory,error=null){
 const calls=[];
 const env={context:{organizationId:'synthetic-org',clinicId:'synthetic-murcia'},db:{
  from(){throw Error('No leer memberships ni perfiles directamente para el directorio')},
  async rpc(name,args){calls.push({name,args});return {data:rows,error}}
 }};
 vm.createContext(env);vm.runInContext(helpers,env);return {...env,calls};
}
test('El directorio de la clínica entrega fisios y Gestión aunque no se puedan leer otros perfiles',async()=>{
 const f=fixture(),result=await f.clinicTaskDirectory();
 assert.equal(result.error,null);assert.equal(result.data.length,4);
 assert.equal(result.data.find(p=>p.userId==='synthetic-fisio').area,'fisio');
 assert.equal(result.data.find(p=>p.userId==='synthetic-management').area,'gestion');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:'atlas_chat_directory',args:{p_organization_id:'synthetic-org',p_clinic_id:'synthetic-murcia'}}]);
});
test('El guardado valida la misma cuenta y toma el nombre del directorio, rechazando personas ajenas',async()=>{
 const f=fixture(),assigned=await f.validateClinicTaskAssignee('synthetic-fisio');
 assert.equal(assigned.data,'synthetic-fisio');assert.equal(assigned.name,'Fisio de prueba');
 assert.match((await f.validateClinicTaskAssignee('synthetic-other-clinic')).error.message,/no pertenece/);
 const before=f.calls.length;assert.equal((await f.validateClinicTaskAssignee(null)).data,null);assert.equal(f.calls.length,before);
});
test('Un error del directorio se propaga sin aceptar una asignación ni usar nombres locales',async()=>{
 const error={message:'Directorio no disponible'},f=fixture(null,error);
 assert.equal((await f.clinicTaskDirectory()).error,error);
 const result=await f.validateClinicTaskAssignee('synthetic-fisio');assert.equal(result.data,null);assert.equal(result.error,error);
});
test('Reconoce roles técnicos y visibles y descarta cuentas sin identificador o nombre',async()=>{
 const cases={therapist:'fisio',professional:'fisio',Physiotherapist:'fisio',reception:'recepcion',administrator:'gestion',owner:'gestion',Propietario:'gestion',assistant:'auxiliar',auxiliary:'auxiliar'};
 const f=fixture([...Object.keys(cases).map(role=>({user_id:role,full_name:role,role})),{user_id:null,full_name:'Sin cuenta',role:'therapist'},{user_id:'empty',full_name:' ',role:'therapist'},{user_id:'therapist',full_name:'Repetido',role:'therapist'}]);
 const result=await f.clinicTaskDirectory();assert.equal(result.data.length,Object.keys(cases).length);
 for(const person of result.data)assert.equal(person.area,cases[person.userId]);
});
module.exports={helpers,directory};
