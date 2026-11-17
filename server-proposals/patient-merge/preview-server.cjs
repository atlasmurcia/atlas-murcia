'use strict';
// Servidor de pruebas exclusivamente local. Nunca conectar a una base clínica.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const root=__dirname,uuid=()=>crypto.randomUUID(),scope={organizationId:uuid(),clinicId:uuid()},actor=uuid(),a=uuid(),b=uuid();
const actions={mergePreview:'preview',mergeCommit:'commit',mergeUndo:'undo',mergeSearch:'search',mergeStatus:'status',mergeCapabilities:'capabilities',mergeResolve:'resolve'};
const allowed=new Set(['database-preview.html','merge-controller.js','patient-merge-panel.js','patient-merge.css']);
let db;
(async()=>{
 db=await PGlite.create();await db.exec(fs.readFileSync(path.join(root,'synthetic-fixture.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(root,'backend.sql'),'utf8'));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 await db.query('insert into memberships values($1,$2,$3,true,$4)',[actor,scope.organizationId,scope.clinicId,{patient_merge:true}]);
 for(const [id,code,phone,email] of [[a,'DEMO-101','600000101','principal@example.invalid'],[b,'DEMO-202','600000202','alternativo@example.invalid']])
  await db.query('insert into patients(id,organization_id,clinic_id,patient_number,first_name,last_name_1,phone,email) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,scope.organizationId,scope.clinicId,code,'Lucía','Ejemplo Ficticio',phone,email]);
 const names={appointments:'Citas pasadas y futuras',budgets:'Presupuestos',treatment_plans:'Planes y sesiones',payments:'Cobros',documents:'Documentos y pruebas',consents:'Consentimientos y RGPD',clinical_records:'Notas clínicas',patient_communications:'Comunicaciones',patient_debts:'Saldos pendientes',atlas_internal_tasks:'Tareas y seguimientos'};
 for(const [table,label] of Object.entries(names))await db.query('insert into atlas_merge_private.relations(relation,label) values($1::regclass,$2)',['public.'+table,label]);
 await db.exec('select atlas_merge_private.install_guards()');
 await db.query("insert into appointments(id,organization_id,clinic_id,patient_id,starts_at,status,client_ref) select gen_random_uuid(),$1,$2,$3,'2026-10-01'::timestamptz+n*interval '1 day','completed','DEMO-PAST-'||n from generate_series(1,12)n",[scope.organizationId,scope.clinicId,b]);
 await db.query("insert into appointments(id,organization_id,clinic_id,patient_id,starts_at,status,client_ref) select gen_random_uuid(),$1,$2,$3,'2027-01-01'::timestamptz+n*interval '1 day','scheduled','DEMO-FUTURE-'||n from generate_series(1,4)n",[scope.organizationId,scope.clinicId,b]);
 await db.query("insert into appointments(id,organization_id,clinic_id,patient_id,starts_at,status,client_ref) values($1,$2,$3,$4,'2026-11-01','completed','DEMO-PRINCIPAL')",[uuid(),scope.organizationId,scope.clinicId,a]);
 await db.query("insert into budgets values($1,$2,$3,$4,125.35,'DEMO-BUDGET')",[uuid(),scope.organizationId,scope.clinicId,b]);
 await db.query("insert into documents values($1,$2,$3,$4,'synthetic/archivo.pdf',$5)",[uuid(),scope.organizationId,scope.clinicId,b,{title:'Documento de prueba'}]);
 await db.query("insert into patient_debts values($1,$2,$3,$4,35.25)",[uuid(),scope.organizationId,scope.clinicId,b]);
 await db.query("insert into atlas_merge_private.configuration values($1,$2,true,atlas_merge_private.schema_signature(),'CERTIFICACIÓN EXCLUSIVA DEL ESQUEMA FICTICIO LOCAL. NO VÁLIDA PARA LA CLÍNICA.',$3)",[scope.organizationId,scope.clinicId,actor]);
 const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  function json(status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
  if(req.headers.host!==new URL(origin).host)return json(403,{error:'Host no permitido.'});
  try{
   if(req.method==='GET'&&req.url==='/scope')return json(200,scope);
   if(req.method==='POST'&&req.url==='/rpc'){
    if(req.headers.origin!==origin)return json(403,{error:'Origen no permitido.'});
    let content='';for await(const chunk of req){content+=chunk;if(content.length>20000)return json(413,{error:'Petición demasiado grande.'});}
    const m=JSON.parse(content),action=actions[String(m.action||'').replace(/^patients:/,'')];
    if(!action)return json(400,{error:'Acción no permitida.'});
    const result=await db.query('select public.atlas_patient_merge($1,$2::jsonb) result',[action,JSON.stringify({...m.payload,...scope})]);
    return json(200,result.rows[0].result);
   }
   const name=req.url==='/'?'database-preview.html':req.url.slice(1);
   if(req.method!=='GET'||!allowed.has(name))return json(404,{error:'No encontrado.'});
   const ext=path.extname(name);res.writeHead(200,{'Content-Type':ext==='.html'?'text/html; charset=utf-8':ext==='.css'?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(fs.readFileSync(path.join(root,name)));
  }catch(e){json(400,{error:e.message,code:e.code||''});}
 });
 server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>console.log('POSTGRESQL SINTÉTICO: http://127.0.0.1:'+server.address().port));
 for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(async()=>{await db.close();process.exit(0);}));
})().catch(e=>{console.error(e);process.exitCode=1;});
