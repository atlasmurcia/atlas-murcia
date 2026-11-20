// PostgreSQL in memory only. No connection credentials or production queries.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
const org='10000000-0000-0000-0000-000000000001',clinic='20000000-0000-0000-0000-000000000001',otherClinic='20000000-0000-0000-0000-000000000002';
const dates=['2027-01-01','2027-01-06','2027-03-19','2027-03-25','2027-03-26','2027-03-30','2027-05-01','2027-06-09','2027-09-14','2027-10-12','2027-11-01','2027-12-06','2027-12-08','2027-12-25'];
const source=fs.readFileSync(path.join(__dirname,'../server-proposals/murcia-holidays-2027/database.sql'),'utf8');
const sql=source.replaceAll('4908e607-19bd-4139-a4b4-646c585f0cbf',org).replaceAll('0b741520-b7dc-48a2-9f79-3ef6b74258d4',clinic);
(async()=>{const db=new PGlite();let checks=0;
try{
 await db.exec(`create role authenticated;create table clinic_settings(organization_id uuid,clinic_id uuid,section text,payload jsonb,unique(organization_id,clinic_id,section));create table appointments(id uuid primary key default gen_random_uuid(),organization_id uuid,clinic_id uuid,starts_at timestamptz,ends_at timestamptz,status text default 'pending',deleted_at timestamptz,forced boolean default false,notes text);
 alter table clinic_settings enable row level security;alter table appointments enable row level security;
 create policy settings_read on clinic_settings for select to authenticated using(clinic_id::text=current_setting('test.clinic',true));
 create policy appointment_access on appointments for all to authenticated using(clinic_id::text=current_setting('test.clinic',true)) with check(clinic_id::text=current_setting('test.clinic',true));
 grant select on clinic_settings to authenticated;grant select,insert,update on appointments to authenticated;
 set test.clinic='${clinic}';`);
 await db.query("insert into clinic_settings values($1,$2,'agenda',$3::jsonb)",[org,clinic,JSON.stringify({holidays:dates.map(date=>({date,name:'Festivo ficticio'})),settings:{allowHolidayOverride:false}})]);
 const old=(await db.query("insert into appointments(organization_id,clinic_id,starts_at,ends_at,notes) values($1,$2,'2027-03-30 10:00 Europe/Madrid','2027-03-30 11:00 Europe/Madrid','Cita ficticia anterior') returning id",[org,clinic])).rows[0].id;
 await db.exec(sql);await db.exec('set role authenticated');
 const count=async()=>Number((await db.query('select count(*) n from appointments')).rows[0].n);
 async function insert(start,end,forced=false,status='pending',target=clinic){return db.query('insert into appointments(organization_id,clinic_id,starts_at,ends_at,forced,status) values($1,$2,$3,$4,$5,$6) returning id',[org,target,start,end,forced,status]);}
 async function rejected(run,label){await assert.rejects(run,e=>e.code==='23514'&&e.message.includes('Festivo / Clínica cerrada'),label);checks++;}
 for(const date of dates)for(const forced of [false,true])await rejected(()=>insert(date+' 10:00 Europe/Madrid',date+' 11:00 Europe/Madrid',forced),'Global closure '+date+' forced='+forced);
 assert.equal(await count(),1);checks++;
 await db.query("update appointments set notes='Cambio administrativo ficticio conservado' where id=$1",[old]);assert.equal(await count(),1);checks++;
 await db.query("update appointments set status='cancelled' where id=$1",[old]);checks++;
 await rejected(()=>db.query("update appointments set status='pending' where id=$1",[old]),'Cannot restore a cancelled holiday appointment');
 const open=(await insert('2027-03-31 10:00 Europe/Madrid','2027-03-31 11:00 Europe/Madrid')).rows[0].id;checks++;
 await rejected(()=>db.query("update appointments set starts_at='2027-03-30 10:00 Europe/Madrid',ends_at='2027-03-30 11:00 Europe/Madrid' where id=$1",[open]),'Cannot move existing appointment into closure');
 assert.equal((await db.query('select extract(day from starts_at at time zone \'Europe/Madrid\')::int d from appointments where id=$1',[open])).rows[0].d,31);checks++;
 await rejected(()=>insert('2027-03-29 23:45 Europe/Madrid','2027-03-30 00:15 Europe/Madrid'),'Crosses into holiday');
 await rejected(()=>insert('2027-03-30 23:45 Europe/Madrid','2027-03-31 00:15 Europe/Madrid'),'Starts before holiday ends');
 await insert('2027-03-29 23:00 Europe/Madrid','2027-03-30 00:00 Europe/Madrid');checks++;
 await insert('2027-03-31 00:00 Europe/Madrid','2027-03-31 00:30 Europe/Madrid');checks++;
 await rejected(()=>insert('2027-03-29T22:30:00Z','2027-03-29T23:00:00Z'),'Summer time midnight uses Madrid, not UTC');
 await rejected(()=>insert('2026-12-31T23:30:00Z','2027-01-01T00:00:00Z'),'Winter time midnight uses Madrid, not UTC');
 const before=await count();await rejected(()=>db.query("insert into appointments(organization_id,clinic_id,starts_at,ends_at) values($1,$2,'2027-03-31 09:00 Europe/Madrid','2027-03-31 10:00 Europe/Madrid'),($1,$2,'2027-03-30 09:00 Europe/Madrid','2027-03-30 10:00 Europe/Madrid')",[org,clinic]),'An automatic batch containing a closure is rejected atomically');assert.equal(await count(),before);checks++;
 await db.exec(`reset role;set test.clinic='${otherClinic}';set role authenticated;`);await insert('2027-03-30 10:00 Europe/Madrid','2027-03-30 11:00 Europe/Madrid',false,'pending',otherClinic);checks++;
 await db.exec(`reset role;delete from clinic_settings;set test.clinic='${clinic}';set role authenticated;`);await assert.rejects(()=>insert('2027-03-31 12:00 Europe/Madrid','2027-03-31 13:00 Europe/Madrid'),/No se pudo comprobar el calendario/);checks++;
 await db.exec('reset role');const fn=(await db.query("select prosecdef from pg_proc where proname='atlas_murcia_reject_holiday_booking'")).rows[0];assert.equal(fn.prosecdef,false);checks++;
 console.log(JSON.stringify({pass:true,engine:'PGlite 0.5.17 / PostgreSQL',checks,holidayDates:dates.length,forcedBookings:'rejected',existingRecords:'preserved; cancellation allowed; rescheduling and restoration guarded',boundaries:'Madrid winter and summer; midnight and crossing dates',batch:'atomic rejection',permissions:'security invoker with synthetic RLS',otherClinics:'unchanged',productionWrites:0},null,2));
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
