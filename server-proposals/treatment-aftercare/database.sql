-- Installation authorized by Gely on 20/11/2026 after server compatibility review.
-- Adds only the optional aftercare workflow; creates no patient tasks or appointments during installation.
-- Requires the existing atomic-plan RPC, conflict guards and internal-task table.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
create table public.atlas_treatment_aftercare (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null, clinic_id uuid not null, patient_id uuid not null references public.patients(id),
 plan_key text not null, config jsonb not null, original_keys jsonb not null,
 treatment_anchor date not null, mbst_anchor date,
 revision integer not null default 1, applied_revision integer not null default 1,
 task_dates jsonb not null default '{}', last_notice_digest text, last_rows_digest text, created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,clinic_id,patient_id,plan_key),
 check(jsonb_typeof(config)='object' and jsonb_typeof(original_keys)='array')
);
alter table public.atlas_treatment_aftercare enable row level security;
create policy aftercare_read on public.atlas_treatment_aftercare for select to authenticated
 using(public.has_clinic_permission(organization_id,clinic_id,'agenda_read'));
create policy aftercare_insert on public.atlas_treatment_aftercare for insert to authenticated
 with check(public.has_clinic_permission(organization_id,clinic_id,'agenda_write') and exists(select 1 from public.patients p where p.id=atlas_treatment_aftercare.patient_id and p.organization_id=atlas_treatment_aftercare.organization_id and p.clinic_id=atlas_treatment_aftercare.clinic_id and p.deleted_at is null));
create policy aftercare_update on public.atlas_treatment_aftercare for update to authenticated
 using(public.has_clinic_permission(organization_id,clinic_id,'agenda_write'))
 with check(public.has_clinic_permission(organization_id,clinic_id,'agenda_write') and exists(select 1 from public.patients p where p.id=atlas_treatment_aftercare.patient_id and p.organization_id=atlas_treatment_aftercare.organization_id and p.clinic_id=atlas_treatment_aftercare.clinic_id and p.deleted_at is null));
revoke all on public.atlas_treatment_aftercare from public,anon,authenticated;
grant select,insert,update on public.atlas_treatment_aftercare to authenticated;
create index atlas_aftercare_patient_idx on public.atlas_treatment_aftercare(patient_id);
create index atlas_aftercare_pending_idx on public.atlas_treatment_aftercare(organization_id,clinic_id) where revision>applied_revision;
create index atlas_aftercare_plan_idx on public.appointments(organization_id,clinic_id,patient_id,(metadata->>'planId')) where metadata->>'planId' is not null;

create function public.atlas_aftercare_require(p_org uuid,p_clinic uuid,p_write boolean default true)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.has_clinic_permission(p_org,p_clinic,'agenda_read') or (p_write and not public.has_clinic_permission(p_org,p_clinic,'agenda_write')) then
  raise exception using errcode='42501',message='No tienes permiso para planificar seguimientos en esta clínica.';
 end if;
end $$;

-- Server-side date arithmetic uses Madrid calendar dates, including month ends.
create function public.atlas_aftercare_business_day(p_org uuid,p_clinic uuid,p_day date)
returns date language plpgsql stable security invoker set search_path='' as $$
declare settings jsonb; day date:=p_day; i integer;
begin
 select payload into settings from public.clinic_settings where organization_id=p_org and clinic_id=p_clinic and section='agenda';
 if not found then raise exception 'Falta el calendario central de cierres. No se guardarán seguimientos.';end if;
 for i in 0..369 loop
  if extract(isodow from day)<6 and not exists(select 1 from jsonb_array_elements(coalesce(settings->'holidays','[]')) h where h->>'date'=day::text) then return day;end if;
  day:=day+1;
 end loop;
 raise exception 'No hay día laborable disponible para el seguimiento.';
end $$;

create function public.atlas_aftercare_task_dates(p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.atlas_treatment_aftercare%rowtype; item record; calculated date; due timestamptz; answer jsonb:='{}'; label text; old_due text; task public.atlas_internal_tasks%rowtype;
begin
 select * into strict s from public.atlas_treatment_aftercare where id=p_id;
 perform public.atlas_aftercare_require(s.organization_id,s.clinic_id);
 if s.revision>s.applied_revision and current_setting('atlas.aftercare_reconcile',true) is distinct from 'on' then raise exception 'Revisa el aviso previo antes de reajustar tareas.';end if;
 if coalesce((s.config->'aftercare'->>'followups')::boolean,false) is not true then return answer;end if;
 for item in select * from (values('day-15',15,'Seguimiento 15 días'),('month-2',2,'Seguimiento 2º mes'),('month-3',3,'Seguimiento 3º mes'),('month-4',4,'Seguimiento 4º mes'),('month-5',5,'Seguimiento 5º mes'),('month-6',6,'Seguimiento 6º mes')) v(key,n,title) loop
  calculated:=case when item.key='day-15' then s.treatment_anchor+15 else (s.treatment_anchor+make_interval(months=>item.n))::date end;
  due:=(public.atlas_aftercare_business_day(s.organization_id,s.clinic_id,calculated)::timestamp+interval '9 hours') at time zone 'Europe/Madrid';
  if s.revision=s.applied_revision and not exists(select 1 from jsonb_array_elements(coalesce(s.config->'aftercareTaskPreview','[]')) p where p->>'key'=item.key and p->>'dueDate'=(due at time zone 'Europe/Madrid')::date::text) then raise exception 'Las fechas laborables han cambiado. Actualiza la vista previa antes de guardar los seguimientos.';end if;
  label:='aftercare:'||s.id||':'||item.key;
  select * into task from public.atlas_internal_tasks t where t.organization_id=s.organization_id and t.clinic_id=s.clinic_id and t.patient_id=s.patient_id and t.source_label=label for update;
  if found then
   old_due:=s.task_dates->>item.key;
   -- Manual dates, snoozed/completed/cancelled tasks are preserved.
   if task.status in ('pending','in_progress') and old_due is not null and task.due_at=old_due::timestamptz then
    update public.atlas_internal_tasks set due_at=due,updated_at=clock_timestamp(),updated_by=auth.uid() where id=task.id;
    answer:=answer||jsonb_build_object(item.key,due);
   else answer:=answer||jsonb_build_object(item.key,old_due);end if;
  else
   if exists(select 1 from public.atlas_internal_tasks t where t.organization_id=s.organization_id and t.clinic_id=s.clinic_id and t.patient_id=s.patient_id and t.area='auxiliar' and (t.title=item.title or t.source_label='Planificación de seguimientos postratamiento' or to_jsonb(t)->>'client_ref' like 'post-treatment-followup:%' or to_jsonb(t)#>>'{metadata,workflow}'='post_treatment_followups') and t.status in ('pending','in_progress','snoozed') and coalesce(t.source_label,'') not like 'aftercare:%') then raise exception 'Ya hay seguimientos de Auxiliar creados fuera de este plan. Revísalos antes de añadir otros para evitar duplicados.';end if;
   insert into public.atlas_internal_tasks(organization_id,clinic_id,patient_id,source_label,title,notes,task_type,status,area,assigned_name,due_at,created_by,updated_by)
   values(s.organization_id,s.clinic_id,s.patient_id,label,item.title,'Seguimiento vinculado al tratamiento. Las fechas pendientes se revisan desde el aviso de reajuste de la agenda.','seguimiento','pending','auxiliar','Auxiliar',due,auth.uid(),auth.uid());
   answer:=answer||jsonb_build_object(item.key,due);
  end if;
 end loop;
 return answer;
end $$;

create function public.atlas_aftercare_snapshot(p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.atlas_treatment_aftercare%rowtype; appointments jsonb; tasks jsonb; snapshot jsonb; holidays jsonb;
begin
 select * into strict s from public.atlas_treatment_aftercare where id=p_id;
 perform public.atlas_aftercare_require(s.organization_id,s.clinic_id,false);
 select coalesce(jsonb_agg(case when s.config->'aftercareOriginalMap' ? a.client_ref then to_jsonb(a)||jsonb_build_object('metadata',a.metadata||jsonb_build_object('aftercarePhase','original','aftercareOriginKey',s.config->'aftercareOriginalMap'->a.client_ref->>'originKey','aftercareCardKey',s.config->'aftercareOriginalMap'->a.client_ref->>'cardKey')) else to_jsonb(a) end order by a.id),'[]') into appointments from public.appointments a where a.organization_id=s.organization_id and a.clinic_id=s.clinic_id and a.patient_id=s.patient_id and a.metadata->>'planId'=s.plan_key;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into tasks from public.atlas_internal_tasks t where t.organization_id=s.organization_id and t.clinic_id=s.clinic_id and t.patient_id=s.patient_id and t.source_label like 'aftercare:'||s.id||':%';
 select coalesce(jsonb_agg(h->>'date' order by h->>'date'),'[]') into holidays from public.clinic_settings settings cross join lateral jsonb_array_elements(coalesce(settings.payload->'holidays','[]')) h where settings.organization_id=s.organization_id and settings.clinic_id=s.clinic_id and settings.section='agenda';
 snapshot:=to_jsonb(s)||jsonb_build_object('appointments',appointments,'tasks',tasks,'holidayDates',holidays);
 return snapshot||jsonb_build_object('noticeDigest',md5(snapshot::text));
end $$;

create function public.atlas_aftercare_pending(p_organization_id uuid,p_clinic_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.atlas_aftercare_require(p_organization_id,p_clinic_id,false);
 select coalesce(jsonb_agg(public.atlas_aftercare_snapshot(s.id) order by s.updated_at),'[]') into result
 from public.atlas_treatment_aftercare s where s.organization_id=p_organization_id and s.clinic_id=p_clinic_id and s.revision>s.applied_revision;
 return result;
end $$;

create function public.atlas_aftercare_changed()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.atlas_treatment_aftercare set revision=revision+1,updated_at=clock_timestamp() where organization_id=old.organization_id and clinic_id=old.clinic_id and patient_id=old.patient_id and plan_key=old.metadata->>'planId' and (old.metadata->>'aftercarePhase'='original' or config->'aftercareOriginalMap' ? old.client_ref);
  return old;
 end if;
 if current_setting('atlas.aftercare_reconcile',true)='on' then return new;end if;
 if tg_op='UPDATE' and old.metadata->>'aftercarePhase' in ('original','month1','reactivation') then
  new.metadata:=new.metadata||(select jsonb_object_agg(key,value) from jsonb_each(old.metadata) where key in ('aftercarePhase','aftercareKey','aftercareOriginKey','aftercareCardKey','aftercareCardNumber','aftercareSession','aftercareVisit','planId','budgetId'));
  if old.metadata->>'aftercareManual'='true' then new.metadata:=new.metadata||jsonb_build_object('aftercareManual',true);end if;
 end if;
 if tg_op='UPDATE' and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at and new.deleted_at is not distinct from old.deleted_at and (new.status in ('cancelled','no_show')) is not distinct from (old.status in ('cancelled','no_show')) and new.professionals is not distinct from old.professionals and new.resources is not distinct from old.resources then return new;end if;
 if tg_op='UPDATE' and new.metadata->>'aftercarePhase' in ('month1','reactivation') then
  new.metadata:=new.metadata||jsonb_build_object('aftercareManual',true);return new;
 end if;
 if new.metadata->>'aftercarePhase'='original' or coalesce(new.metadata->>'aftercarePhase','')='' then
  update public.atlas_treatment_aftercare set revision=revision+1,updated_at=clock_timestamp()
   where organization_id=new.organization_id and clinic_id=new.clinic_id and patient_id=new.patient_id and plan_key=new.metadata->>'planId' and (new.metadata->>'aftercarePhase'='original' or config->'aftercareOriginalMap' ? new.client_ref);
 end if;
 return new;
end $$;
create trigger atlas_aftercare_change_notice before insert or update or delete on public.appointments for each row execute function public.atlas_aftercare_changed();

create function public.atlas_aftercare_check_slot(p_org uuid,p_clinic uuid,p_row jsonb,p_exclude uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare device text; turnaround integer; capacity integer; from_at timestamptz:=(p_row->>'starts_at')::timestamptz; to_at timestamptz:=(p_row->>'ends_at')::timestamptz;
begin
 perform public.atlas_aftercare_require(p_org,p_clinic);
 for device in select distinct value from jsonb_array_elements_text(p_row->'resources') where not (p_row->'professionals' ? value) loop
  turnaround:=case when device='MBST OSTEOSPIN' then 0 else 5 end;capacity:=1;
  if to_regprocedure('public.atlas_resource_capacity(text)') is not null then execute 'select public.atlas_resource_capacity($1)' into capacity using device;end if;
  if exists(with overlapping as (
   select distinct a.id,a.starts_at,a.ends_at+make_interval(mins=>turnaround) occupied_to from public.appointments a
    where a.organization_id=p_org and a.clinic_id=p_clinic and a.id is distinct from p_exclude and a.deleted_at is null and a.status<>'cancelled'
     and a.starts_at<to_at+make_interval(mins=>turnaround) and a.ends_at>from_at-make_interval(mins=>turnaround)
     and exists(select 1 from jsonb_array_elements_text(a.resources) v where case when lower(v) like '%magneto%' then 'magnetophysio' when lower(v) like '%bomba%' then 'bomba' else lower(v) end=case when lower(device) like '%magneto%' then 'magnetophysio' when lower(device) like '%bomba%' then 'bomba' else lower(device) end)
   ),instants as(select from_at t union select starts_at from overlapping where starts_at>from_at)
   select 1 from instants i where (select count(*) from overlapping o where o.starts_at<=i.t and i.t<o.occupied_to)>=capacity)
  then raise exception using errcode='23P01',message='El equipo ya no está disponible con su tiempo de preparación. Actualiza el reajuste.';end if;
 end loop;
end $$;

-- Validate derived rows independently of the original budget's quantities.
create function public.atlas_aftercare_validate(p_config jsonb,p_originals jsonb,p_derived jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare anchor date; mbst_anchor date; r jsonb; phase text; n integer; card record; card_count integer; followups boolean; reactivation boolean; center text;
begin
 followups:=coalesce((p_config->'aftercare'->>'followups')::boolean,false);reactivation:=coalesce((p_config->'aftercare'->>'reactivation')::boolean,false);
 if not followups and not reactivation then raise exception 'Selecciona al menos una opción de seguimiento.';end if;
 center:=p_config->>'aftercareClinic';if center is distinct from 'murcia' then raise exception 'La clínica del plan no corresponde a esta instalación.';end if;
 if (select count(distinct value->'metadata'->>'aftercareOriginKey') from jsonb_array_elements(p_originals))<>jsonb_array_length(p_originals) then raise exception 'Las sesiones originales necesitan referencias únicas.';end if;
 if (select count(distinct value->'metadata'->>'aftercareKey') from jsonb_array_elements(p_derived))<>jsonb_array_length(p_derived) then raise exception 'Hay seguimientos repetidos.';end if;
 select max((value->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date into anchor from jsonb_array_elements(p_originals);
 select max((value->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date into mbst_anchor from jsonb_array_elements(p_originals) where exists(select 1 from jsonb_array_elements_text(value->'services') service where lower(service) like 'mbst%');
 if anchor is null then raise exception 'Faltan las sesiones originales.';end if;
 if reactivation and mbst_anchor is null then raise exception 'Falta la última sesión MBST original.';end if;
 if followups then
  for phase in select unnest(array['osteo','readapt']) loop
   select count(*) into n from jsonb_array_elements(p_derived) a where a->'metadata'->>'aftercareVisit'=phase and a->'metadata'->>'aftercarePhase'='month1';
   if n<>1 then raise exception 'Falta una revisión presencial de 30 minutos.';end if;
  end loop;
 end if;
 for r in select value from jsonb_array_elements(p_derived) loop
  phase:=r->'metadata'->>'aftercarePhase';
  if phase not in ('month1','reactivation') or phase is null or coalesce(r->'metadata'->>'aftercareKey','')='' then raise exception 'Cita de seguimiento inválida.';end if;
  if phase='month1' then
   if not followups or (r->>'starts_at')::timestamptz at time zone 'Europe/Madrid'<anchor+interval '1 month' then raise exception 'Revisión presencial anterior al primer mes.';end if;
   if r->'metadata'->>'aftercareVisit' in ('osteo','readapt') then
    if (r->>'ends_at')::timestamptz-(r->>'starts_at')::timestamptz<>interval '30 minutes' or r->'metadata'->>'professional_minutes'<>'30'
     or r->'professionals'<>jsonb_build_array(case when r->'metadata'->>'aftercareVisit'='osteo' then p_config->>'mainProfessional' else p_config->>'readaptProfessional' end)
    then raise exception 'La revisión debe durar 30 minutos con el profesional asignado.';end if;
    if r->'services'<>jsonb_build_array(case when r->'metadata'->>'aftercareVisit'='osteo' then 'Osteopatía' else 'Readaptación' end) then raise exception 'Servicio incorrecto en la revisión presencial.';end if;
   else
    if exists(select 1 from jsonb_array_elements_text(r->'services') v where lower(v) like 'mbst%' or lower(v) like '%bomba%' or lower(v) like '%onda%' or (center='murcia' and (lower(v) like '%imoove%' or lower(v) like '%imove%' or lower(v) like '%brains%' or upper(v)='DPA')) or (center='alicante' and lower(v) like '%physicalm%')) then raise exception 'Equipo excluido de la revisión presencial.';end if;
    if not exists(select 1 from jsonb_array_elements(p_originals) a where (a->'services') @> (r->'services')) then raise exception 'Equipo ajeno al plan original.';end if;
   end if;
  else
   if not reactivation or (r->>'starts_at')::timestamptz at time zone 'Europe/Madrid'<mbst_anchor+interval '6 months'
    or (r->>'ends_at')::timestamptz-(r->>'starts_at')::timestamptz<>interval '60 minutes'
    or coalesce(r->'metadata'->>'aftercareCardKey','')='' or not (r->>'notes' like '%Tarjeta %') then raise exception 'Reactivación MBST inválida.';end if;
   if not exists(select 1 from jsonb_array_elements(p_originals) a where a->'metadata'->>'aftercareCardKey'=r->'metadata'->>'aftercareCardKey' and a->'services'=r->'services' and a->'resources'=r->'resources') then raise exception 'La tarjeta, el servicio y el equipo MBST deben coincidir con el ciclo original.';end if;
  end if;
 end loop;
 if reactivation then
  select count(distinct value->'metadata'->>'aftercareCardKey') into card_count from jsonb_array_elements(p_originals) where exists(select 1 from jsonb_array_elements_text(value->'services') v where lower(v) like 'mbst%');
  if card_count not between 1 and 2 then raise exception 'Revisa las tarjetas MBST originales.';end if;
  for card in select distinct value->'metadata'->>'aftercareCardKey' key from jsonb_array_elements(p_originals) where exists(select 1 from jsonb_array_elements_text(value->'services') v where lower(v) like 'mbst%') loop
   select count(*) into n from jsonb_array_elements(p_derived) a where a->'metadata'->>'aftercarePhase'='reactivation' and a->'metadata'->>'aftercareCardKey'=card.key;
   if n<>3 then raise exception 'Cada tarjeta necesita tres sesiones de reactivación.';end if;
   if exists(select 1 from jsonb_array_elements(p_derived) a join jsonb_array_elements(p_derived) b on a->>'client_ref'<b->>'client_ref' where a->'metadata'->>'aftercareCardKey'=card.key and b->'metadata'->>'aftercareCardKey'=card.key and abs(((a->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date-((b->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date)<2) then raise exception 'MBST: tres días distintos por tarjeta, con separación de dos días.';end if;
  end loop;
 end if;
 return jsonb_build_object('anchor',anchor,'mbstAnchor',mbst_anchor);
end $$;

create function public.atlas_apply_plan_aftercare(p_organization_id uuid,p_clinic_id uuid,p_patient_id uuid,p_plan_key text,p_rows jsonb,p_config jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare originals jsonb; derived jsonb; anchors jsonb; result jsonb; s public.atlas_treatment_aftercare%rowtype; dates jsonb;
begin
 perform public.atlas_aftercare_require(p_organization_id,p_clinic_id);
 perform set_config('lock_timeout','5s',true);lock table public.appointments in share row exclusive mode;
 select coalesce(jsonb_agg(value),'[]') into originals from jsonb_array_elements(p_rows) where value->'metadata'->>'aftercarePhase'='original';
 select coalesce(jsonb_agg(value),'[]') into derived from jsonb_array_elements(p_rows) where value->'metadata'->>'aftercarePhase'<>'original';
 anchors:=public.atlas_aftercare_validate(p_config,originals,derived);
 result:=public.atlas_apply_treatment_plan(p_organization_id,p_clinic_id,p_patient_id,p_plan_key,p_rows);
 select * into s from public.atlas_treatment_aftercare where organization_id=p_organization_id and clinic_id=p_clinic_id and patient_id=p_patient_id and plan_key=p_plan_key for update;
 if found then if s.config is distinct from p_config then raise exception 'La configuración guardada no coincide con este borrador.';end if;return result||jsonb_build_object('aftercareId',s.id,'tasksConfirmed',true);end if;
 insert into public.atlas_treatment_aftercare(organization_id,clinic_id,patient_id,plan_key,config,original_keys,treatment_anchor,mbst_anchor)
 values(p_organization_id,p_clinic_id,p_patient_id,p_plan_key,p_config,(select jsonb_agg(value->'metadata'->>'aftercareOriginKey') from jsonb_array_elements(originals)),(anchors->>'anchor')::date,(anchors->>'mbstAnchor')::date) returning * into s;
 dates:=public.atlas_aftercare_task_dates(s.id);update public.atlas_treatment_aftercare set task_dates=dates where id=s.id;
 return result||jsonb_build_object('aftercareId',s.id,'tasksConfirmed',true);
end $$;

create function public.atlas_attach_plan_aftercare(p_organization_id uuid,p_clinic_id uuid,p_patient_id uuid,p_plan_key text,p_rows jsonb,p_config jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare originals jsonb:='[]'; answer jsonb:='[]'; anchors jsonb; r jsonb; saved public.appointments%rowtype; s public.atlas_treatment_aftercare%rowtype; dates jsonb; mapping jsonb; digest text:=md5(p_rows::text);
begin
 perform public.atlas_aftercare_require(p_organization_id,p_clinic_id);
 perform set_config('lock_timeout','5s',true);lock table public.appointments in share row exclusive mode;
 if not exists(select 1 from public.patients where id=p_patient_id and organization_id=p_organization_id and clinic_id=p_clinic_id and deleted_at is null) then raise exception 'El paciente no pertenece a esta clínica.';end if;
 select * into s from public.atlas_treatment_aftercare where organization_id=p_organization_id and clinic_id=p_clinic_id and patient_id=p_patient_id and plan_key=p_plan_key for update;
 if found then
  if s.config is distinct from p_config then raise exception 'Este tratamiento ya tiene seguimientos vinculados. Revisa el aviso de la agenda.';end if;
  for r in select value from jsonb_array_elements(p_rows) loop
   select * into saved from public.appointments where organization_id=p_organization_id and clinic_id=p_clinic_id and patient_id=p_patient_id and client_ref=r->>'client_ref';
   if not found or saved.metadata->>'aftercare_attach_digest' is distinct from digest or saved.status<>'pending' or saved.deleted_at is not null then raise exception 'Los seguimientos ya existen o han cambiado. Actualiza la agenda antes de continuar.';end if;
   answer:=answer||jsonb_build_array(to_jsonb(saved));
  end loop;
  return jsonb_build_object('appliedCount',jsonb_array_length(p_rows),'appointments',answer,'aftercareId',s.id,'tasksConfirmed',true,'alreadyApplied',true);
 end if;
 mapping:=p_config->'aftercareOriginalMap';
 if jsonb_typeof(mapping) is distinct from 'object' or mapping='{}' then raise exception 'Falta vincular las sesiones originales del tratamiento.';end if;
 for saved in select * from public.appointments where organization_id=p_organization_id and clinic_id=p_clinic_id and patient_id=p_patient_id and metadata->>'planId'=p_plan_key loop
  if not(mapping ? saved.client_ref) or saved.status in ('cancelled','no_show') or saved.deleted_at is not null then raise exception 'Hay sesiones anteriores sin vincular o anuladas sin recolocar. Revisa el tratamiento.';end if;
  if saved.updated_at is distinct from (mapping->saved.client_ref->>'expectedUpdatedAt')::timestamptz then raise exception 'Las sesiones originales han cambiado. Prepara una vista previa nueva.';end if;
  if saved.metadata->>'budgetId' is distinct from p_config->>'budgetId' then raise exception 'El presupuesto no corresponde al tratamiento.';end if;
  originals:=originals||jsonb_build_array(to_jsonb(saved)||jsonb_build_object('metadata',saved.metadata||jsonb_build_object('aftercarePhase','original','aftercareOriginKey',mapping->saved.client_ref->>'originKey','aftercareCardKey',mapping->saved.client_ref->>'cardKey')));
 end loop;
 if jsonb_array_length(originals)<>(select count(*) from jsonb_object_keys(mapping)) then raise exception 'No se han encontrado todas las sesiones originales.';end if;
 anchors:=public.atlas_aftercare_validate(p_config,originals,p_rows);
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'patient_id' is distinct from p_patient_id::text or r->'metadata'->>'planId' is distinct from p_plan_key or r->'metadata'->>'budgetId' is distinct from p_config->>'budgetId' or r->>'status' is distinct from 'pending' or coalesce((r->>'forced')::boolean,false) or coalesce((r->'metadata'->>'overlap_authorized')::boolean,false) or r->>'expected_updated_at' is not null or coalesce(r->>'client_ref','')='' then raise exception 'Solo se pueden añadir seguimientos nuevos sin forzar citas.';end if;
  perform public.atlas_aftercare_check_slot(p_organization_id,p_clinic_id,r,null);
  insert into public.appointments(organization_id,clinic_id,patient_id,starts_at,ends_at,status,services,resources,professionals,notes,forced,client_ref,created_by,metadata)
   values(p_organization_id,p_clinic_id,p_patient_id,(r->>'starts_at')::timestamptz,(r->>'ends_at')::timestamptz,'pending',r->'services',r->'resources',r->'professionals',r->>'notes',false,r->>'client_ref',auth.uid(),r->'metadata'||jsonb_build_object('aftercare_attach_digest',digest)) returning * into saved;
  answer:=answer||jsonb_build_array(to_jsonb(saved));
 end loop;
 insert into public.atlas_treatment_aftercare(organization_id,clinic_id,patient_id,plan_key,config,original_keys,treatment_anchor,mbst_anchor)
  values(p_organization_id,p_clinic_id,p_patient_id,p_plan_key,p_config,(select jsonb_agg(value->'metadata'->>'aftercareOriginKey') from jsonb_array_elements(originals)),(anchors->>'anchor')::date,(anchors->>'mbstAnchor')::date) returning * into s;
 dates:=public.atlas_aftercare_task_dates(s.id);update public.atlas_treatment_aftercare set task_dates=dates where id=s.id;
 return jsonb_build_object('appliedCount',jsonb_array_length(p_rows),'appointments',answer,'aftercareId',s.id,'tasksConfirmed',true,'alreadyApplied',false);
end $$;

create function public.atlas_reconcile_aftercare(p_organization_id uuid,p_clinic_id uuid,p_id uuid,p_revision integer,p_notice_digest text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.atlas_treatment_aftercare%rowtype; snapshot jsonb; originals jsonb; combined jsonb; anchors jsonb; r jsonb; old public.appointments%rowtype; dates jsonb; answer jsonb:='[]';
begin
 perform public.atlas_aftercare_require(p_organization_id,p_clinic_id);
 perform set_config('lock_timeout','5s',true);lock table public.appointments in share row exclusive mode;
 select * into strict s from public.atlas_treatment_aftercare where id=p_id and organization_id=p_organization_id and clinic_id=p_clinic_id for update;
 if s.revision=p_revision and s.applied_revision=p_revision and s.last_notice_digest=p_notice_digest and s.last_rows_digest=md5(p_rows::text) then
  for r in select value from jsonb_array_elements(p_rows) loop
   select * into strict old from public.appointments where organization_id=s.organization_id and clinic_id=s.clinic_id and patient_id=s.patient_id and client_ref=r->>'client_ref';
   if old.starts_at is distinct from (r->>'starts_at')::timestamptz or old.ends_at is distinct from (r->>'ends_at')::timestamptz or old.deleted_at is not null then raise exception 'El reajuste ya se guardó y después cambió. Actualiza la agenda.';end if;
   answer:=answer||jsonb_build_array(to_jsonb(old));
  end loop;
  return jsonb_build_object('ok',true,'appointments',answer,'revision',s.revision,'tasksConfirmed',true,'alreadyApplied',true);
 end if;
 -- Recheck task status/manual dates as part of the exact snapshot approved.
 perform 1 from public.atlas_internal_tasks where organization_id=s.organization_id and clinic_id=s.clinic_id and patient_id=s.patient_id and source_label like 'aftercare:'||s.id||':%' for update;
 snapshot:=public.atlas_aftercare_snapshot(s.id);
 if s.revision<>p_revision or snapshot->>'noticeDigest' is distinct from p_notice_digest then raise exception 'El tratamiento o sus tareas han cambiado. Revisa el aviso actualizado antes de reajustar.';end if;
 select coalesce(jsonb_agg(value),'[]') into originals from jsonb_array_elements(snapshot->'appointments') where value->'metadata'->>'aftercarePhase'='original' and value->>'status' not in ('cancelled','no_show') and value->>'deleted_at' is null;
 if exists(select 1 from jsonb_array_elements_text(s.original_keys) key where (select count(*) from jsonb_array_elements(originals) a where a->'metadata'->>'aftercareOriginKey'=key)<>1) then raise exception 'Hay sesiones anuladas sin recolocar o duplicadas. Los seguimientos no se adelantan.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>2000 then raise exception 'Reajuste inválido.';end if;
 if (select count(distinct value->'metadata'->>'aftercareKey') from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then raise exception 'Reajuste con citas repetidas.';end if;
 select coalesce(jsonb_agg(value),'[]') into combined from jsonb_array_elements(snapshot->'appointments') a where a->'metadata'->>'aftercarePhase' in ('month1','reactivation') and (a->>'status' not in ('pending','confirmed') or a->>'deleted_at' is not null or a->'metadata'->>'aftercareManual'='true');
 -- Fixed/cancelled/manual rows satisfy their original key but are never moved.
 combined:=combined||p_rows;
 if exists(select 1 from jsonb_array_elements(p_rows) a join jsonb_array_elements(combined) b on a->>'client_ref'<>b->>'client_ref' where a->'metadata'->>'aftercarePhase'='reactivation' and b->'metadata'->>'aftercarePhase'='reactivation' and a->'metadata'->>'aftercareCardKey'=b->'metadata'->>'aftercareCardKey' and b->>'status'<>'cancelled' and b->>'deleted_at' is null and abs(((a->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date-((b->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date)<2) then raise exception 'La reactivación necesita días distintos con separación de dos días por tarjeta.';end if;
 if exists(select 1 from jsonb_array_elements(snapshot->'appointments') a where a->'metadata'->>'aftercarePhase' in ('month1','reactivation') and a->>'status' in ('pending','confirmed') and a->>'deleted_at' is null and coalesce(a->'metadata'->>'aftercareManual','false')<>'true' and not exists(select 1 from jsonb_array_elements(p_rows) proposal where proposal->>'client_ref'=a->>'client_ref')) then raise exception 'Faltan citas pendientes en el reajuste.';end if;
 -- Validate regenerated rows and expected counts. Fixed rows are validated
 -- against their old anchors to preserve completed and manually changed dates.
 anchors:=jsonb_build_object('anchor',(select max((a->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date from jsonb_array_elements(originals) a),'mbstAnchor',(select max((a->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date from jsonb_array_elements(originals) a where exists(select 1 from jsonb_array_elements_text(a->'services') v where lower(v) like 'mbst%')));
 perform set_config('atlas.aftercare_reconcile','on',true);
 for r in select value from jsonb_array_elements(p_rows) order by case when (anchors->>'anchor')::date>=s.treatment_anchor then -(extract(epoch from (value->>'starts_at')::timestamptz)) else extract(epoch from (value->>'starts_at')::timestamptz) end loop
  select * into strict old from public.appointments where organization_id=s.organization_id and clinic_id=s.clinic_id and patient_id=s.patient_id and client_ref=r->>'client_ref' and metadata->>'planId'=s.plan_key for update;
  if old.status not in ('pending','confirmed') or old.deleted_at is not null or old.metadata->>'aftercareManual'='true' or old.metadata->>'aftercarePhase' not in ('month1','reactivation') or old.updated_at is distinct from (r->>'expected_updated_at')::timestamptz then raise exception 'La cita ha cambiado o está protegida. Revisa el reajuste.';end if;
  if r->>'patient_id' is distinct from s.patient_id::text or r->>'status' is distinct from old.status or coalesce((r->>'forced')::boolean,false) or coalesce((r->'metadata'->>'overlap_authorized')::boolean,false) then raise exception 'No se pueden forzar ni cambiar de paciente las citas del reajuste.';end if;
  if old.services is distinct from r->'services' or (select jsonb_agg(v order by v) from jsonb_array_elements_text(old.resources) v) is distinct from (select jsonb_agg(v order by v) from jsonb_array_elements_text(r->'resources') v) or old.professionals is distinct from r->'professionals' or old.metadata->>'aftercareKey' is distinct from r->'metadata'->>'aftercareKey' or (old.ends_at-old.starts_at) is distinct from ((r->>'ends_at')::timestamptz-(r->>'starts_at')::timestamptz) then raise exception 'El reajuste solo puede cambiar fechas y horas conservando tratamientos, equipos y profesionales.';end if;
  if old.metadata->>'aftercarePhase'='month1' and (r->>'starts_at')::timestamptz at time zone 'Europe/Madrid'<(anchors->>'anchor')::date+interval '1 month' then raise exception 'Revisión anterior al primer mes.';end if;
  if old.metadata->>'aftercarePhase'='reactivation' and (r->>'starts_at')::timestamptz at time zone 'Europe/Madrid'<(anchors->>'mbstAnchor')::date+interval '6 months' then raise exception 'Reactivación anterior a los seis meses MBST.';end if;
  perform public.atlas_aftercare_check_slot(s.organization_id,s.clinic_id,r,old.id);
  update public.appointments set starts_at=(r->>'starts_at')::timestamptz,ends_at=(r->>'ends_at')::timestamptz,notes=r->>'notes',metadata=old.metadata||jsonb_build_object('aftercareTarget',r->'metadata'->>'aftercareTarget','aftercareNoticeRevision',s.revision,'history',coalesce(old.metadata->'history','[]')||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'user','Equipo ATLAS','actor_id',auth.uid(),'action','Seguimiento reajustado tras aviso previo'))),updated_at=clock_timestamp() where id=old.id returning * into old;
  answer:=answer||jsonb_build_array(to_jsonb(old));
 end loop;
 update public.atlas_treatment_aftercare set treatment_anchor=(anchors->>'anchor')::date,mbst_anchor=(anchors->>'mbstAnchor')::date where id=s.id;
 dates:=public.atlas_aftercare_task_dates(s.id);
 update public.atlas_treatment_aftercare set task_dates=dates,applied_revision=revision,last_notice_digest=p_notice_digest,last_rows_digest=md5(p_rows::text),updated_at=clock_timestamp() where id=s.id;
 perform set_config('atlas.aftercare_reconcile','off',true);
 return jsonb_build_object('ok',true,'appointments',answer,'revision',s.revision,'tasksConfirmed',true);
end $$;

revoke all on function public.atlas_attach_plan_aftercare(uuid,uuid,uuid,text,jsonb,jsonb),public.atlas_aftercare_check_slot(uuid,uuid,jsonb,uuid),public.atlas_aftercare_require(uuid,uuid,boolean),public.atlas_aftercare_business_day(uuid,uuid,date),public.atlas_aftercare_task_dates(uuid),public.atlas_aftercare_snapshot(uuid),public.atlas_aftercare_pending(uuid,uuid),public.atlas_aftercare_changed(),public.atlas_aftercare_validate(jsonb,jsonb,jsonb),public.atlas_apply_plan_aftercare(uuid,uuid,uuid,text,jsonb,jsonb),public.atlas_reconcile_aftercare(uuid,uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.atlas_attach_plan_aftercare(uuid,uuid,uuid,text,jsonb,jsonb),public.atlas_aftercare_check_slot(uuid,uuid,jsonb,uuid),public.atlas_aftercare_require(uuid,uuid,boolean),public.atlas_aftercare_business_day(uuid,uuid,date),public.atlas_aftercare_task_dates(uuid),public.atlas_aftercare_snapshot(uuid),public.atlas_aftercare_pending(uuid,uuid),public.atlas_aftercare_changed(),public.atlas_aftercare_validate(jsonb,jsonb,jsonb),public.atlas_apply_plan_aftercare(uuid,uuid,uuid,text,jsonb,jsonb),public.atlas_reconcile_aftercare(uuid,uuid,uuid,integer,text,jsonb) to authenticated;
commit;
