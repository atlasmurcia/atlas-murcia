-- Solo para una rama de Supabase vacía. Todo se revierte al terminar.
begin;
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000001','Organización sintética');
insert into public.clinics(id,organization_id,name,city) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Murcia sintética','Murcia');
insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','direccion@example.invalid',now(),now()),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sin-acceso@example.invalid',now(),now());
update public.profiles set full_name='Dirección Sintética' where user_id='30000000-0000-0000-0000-000000000001';
insert into public.memberships(organization_id,clinic_id,user_id,role,permissions) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','owner','{}');
insert into public.patients(id,organization_id,clinic_id,patient_number,first_name,last_name_1) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'Paciente','Sintético');
insert into public.clinic_settings(organization_id,clinic_id,section,payload) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','sales','{"services":[{"name":"MBST sintética","category":"MBST"},{"name":"Robot sintético","category":"ROBOT"},{"name":"Bomba sintética","category":"BOMBA"},{"name":"Brains sintético","category":"BRAINS WAY"}]}');
insert into public.budgets(id,organization_id,clinic_id,patient_id,budget_number,name,status,total) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,'MBST sintético','accepted',1000),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',2,'Robot sintético','accepted',1000);
insert into public.budget_lines(organization_id,budget_id,service_name,sessions,unit_price) values
 ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','MBST sintética',10,100),
 ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','Robot sintético',10,100);
alter table public.payments disable trigger user;
insert into public.payments(id,organization_id,clinic_id,patient_id,budget_id,payment_type,amount,method,status,paid_at,created_by,receipt_number,cancelled_at) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','partial',500,'card','completed','2026-11-05 10:00+01','30000000-0000-0000-0000-000000000001',1,null),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','refund',200,'card','completed','2026-11-06 10:00+01','30000000-0000-0000-0000-000000000001',2,null),
 ('60000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','full',1000,'cash','completed','2026-11-07 10:00+01','30000000-0000-0000-0000-000000000001',3,null),
 ('60000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','partial',100,'cash','cancelled','2026-10-15 10:00+02','30000000-0000-0000-0000-000000000001',4,'2026-11-08 10:00+01');
insert into public.appointments(id,organization_id,clinic_id,patient_id,starts_at,ends_at,status,services,metadata) values
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-11-10 10:00+01','2026-11-10 10:30+01','completed','["Bomba sintética"]','{"noCostGift":true}'),
 ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-11-11 10:00+01','2026-11-11 10:30+01','completed','["Brains sintético"]','{}'),
 ('70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-11-12 10:00+01','2026-11-12 10:30+01','completed','["Robot sintético"]','{}');
insert into public.management_targets(organization_id,clinic_id,period,metric,target_value) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01','revenue',1500),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01','mbst_sessions',10),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01','bomba_sessions',10),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01','brains_sessions',10),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01','robot_traction_sessions',10);
do $$
declare v jsonb;
begin
 v:=public.atlas_objectives_calculate('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01');
 if (v->>'revenue')::numeric<>1200 then raise exception 'Facturación incorrecta: %',v; end if;
 if (v->>'mbst_sessions')::numeric<>2 then raise exception 'MBST proporcional incorrecto: %',v; end if;
 if (v->>'robot_traction_sessions')::numeric<>10 then raise exception 'Robot duplicado o incorrecto: %',v; end if;
 if (v->>'bomba_sessions')::numeric<>1 then raise exception 'Regalo explícito incorrecto: %',v; end if;
 if (v->>'brains_sessions')::numeric<>1 then raise exception 'Histórico noviembre incorrecto: %',v; end if;
end $$;
set local role authenticated;
set local "request.jwt.claim.sub"='30000000-0000-0000-0000-000000000001';
select public.atlas_objectives_snapshot('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01')->'clinics'->0->'values' result;
select public.atlas_objectives_save_settings('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','none',120);
do $$
declare v_notice uuid;
begin
 select id into v_notice from public.objective_notifications where recipient_user_id='30000000-0000-0000-0000-000000000001' and acknowledged_at is null limit 1;
 if v_notice is null then raise exception 'No se creó el aviso sintético'; end if;
 perform public.atlas_objectives_acknowledge(v_notice);
 if not exists(select 1 from public.objective_notifications where id=v_notice and acknowledged_at is not null) then raise exception 'No se confirmó el aviso'; end if;
 begin
  update public.objective_notifications set acknowledged_at=now() where id=v_notice;
  raise exception 'Se permitió actualizar directamente un aviso';
 exception when insufficient_privilege then null;
 end;
end $$;
set local "request.jwt.claim.sub"='30000000-0000-0000-0000-000000000002';
do $$
begin
 begin
  perform public.atlas_objectives_snapshot('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2026-11-01');
  raise exception 'Se permitió consultar a una persona sin membresía';
 exception when others then
  if sqlerrm<>'Acceso no autorizado' then raise; end if;
 end;
end $$;
rollback;
