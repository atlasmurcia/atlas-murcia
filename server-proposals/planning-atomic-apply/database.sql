-- Install separately in each clinic after explicit authorization.
-- No existing rows, permissions or RLS policies are changed.
begin;
create function public.atlas_apply_treatment_plan(
 p_organization_id uuid,p_clinic_id uuid,p_patient_id uuid,p_plan_key text,p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
 item jsonb; existing public.appointments%rowtype; saved public.appointments%rowtype;
 digest text; total integer; found_count integer; plan_budget text; device text;
 from_at timestamptz; to_at timestamptz; turnaround integer;
 answer jsonb := '[]'::jsonb;
begin
 if auth.uid() is null or not public.has_clinic_permission(p_organization_id,p_clinic_id,'agenda_read') or not public.has_clinic_permission(p_organization_id,p_clinic_id,'agenda_write') then
  raise exception using errcode='42501',message='La sesión no tiene permiso para aplicar planes en esta clínica.';
 end if;
 if p_plan_key is null or length(p_plan_key) not between 1 and 160 or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Borrador inválido.'; end if;
 total:=jsonb_array_length(p_rows);
 if total not between 1 and 2000 then raise exception 'El plan debe contener entre 1 y 2000 citas.'; end if;
 if not exists(select 1 from public.patients p where p.id=p_patient_id and p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null) then raise exception 'El paciente no pertenece a esta clínica.'; end if;
 digest:=md5(p_rows::text);
 plan_budget:=p_rows->0->'metadata'->>'budgetId';
 if plan_budget is null then raise exception 'Falta el presupuesto del plan.'; end if;
 if (select count(distinct value->>'client_ref') from jsonb_array_elements(p_rows))<>total then raise exception 'El borrador contiene referencias vacías o repetidas.'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if item->>'patient_id' is distinct from p_patient_id::text or item->'metadata'->>'planId' is distinct from p_plan_key or item->'metadata'->>'budgetId' is distinct from plan_budget
   or item->>'status' is distinct from 'pending' or coalesce((item->>'forced')::boolean,false)
   or coalesce((item->'metadata'->>'overlap_authorized')::boolean,false) or coalesce((item->'metadata'->>'conflictOverride')::boolean,false)
   or coalesce((item->'metadata'->>'historico')::boolean,false) or nullif(item->'metadata'->>'migration_source','') is not null
   or item->>'deleted_at' is not null or item->>'cancelled_at' is not null or item->>'expected_updated_at' is not null
   or length(coalesce(item->>'client_ref','')) not between 1 and 240
   or (item ? 'organization_id' and item->>'organization_id' is distinct from p_organization_id::text)
   or (item ? 'clinic_id' and item->>'clinic_id' is distinct from p_clinic_id::text)
  then raise exception 'El plan solo puede crear citas nuevas, pendientes y sin forzar solapamientos para el paciente elegido.'; end if;
  if jsonb_typeof(item->'metadata') is distinct from 'object' or jsonb_typeof(item->'services') is distinct from 'array' or jsonb_typeof(item->'resources') is distinct from 'array' or jsonb_typeof(item->'professionals') is distinct from 'array' then raise exception 'Servicios o asignaciones inválidos.'; end if;
  if jsonb_array_length(item->'services')=0 or jsonb_array_length(item->'resources')=0 then raise exception 'Faltan tratamientos o recursos.'; end if;
  if exists(select 1 from jsonb_array_elements((item->'services')||(item->'resources')||(item->'professionals')) v where jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')=0) then raise exception 'Las asignaciones deben contener nombres válidos.'; end if;
  from_at:=(item->>'starts_at')::timestamptz;to_at:=(item->>'ends_at')::timestamptz;
  if from_at is null or to_at is null or to_at<=from_at or to_at-from_at>interval '4 hours' then raise exception 'Duración de cita inválida.'; end if;
  if coalesce(item->'metadata'->>'professional_minutes','') !~ '^[0-9]+$' then raise exception 'Falta la ocupación del profesional.'; end if;
 end loop;
 -- Same lock used by the existing overlap trigger. Concurrent plans serialize.
 perform pg_advisory_xact_lock(hashtextextended(p_clinic_id::text,0));
 select count(*) into found_count from public.appointments a where a.organization_id=p_organization_id and a.clinic_id=p_clinic_id and a.patient_id=p_patient_id and a.metadata->>'planId'=p_plan_key;
 if found_count>0 then
  if found_count<>total then raise exception 'Este plan ya existe incompleto. Recepción debe revisarlo; no se añadirán citas automáticamente.'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
   select * into existing from public.appointments a where a.organization_id=p_organization_id and a.clinic_id=p_clinic_id and a.patient_id=p_patient_id and a.client_ref=item->>'client_ref';
   if not found or existing.metadata->>'atomic_plan_digest' is distinct from digest or existing.deleted_at is not null or existing.status<>'pending'
    or existing.starts_at is distinct from (item->>'starts_at')::timestamptz or existing.ends_at is distinct from (item->>'ends_at')::timestamptz
    or existing.services is distinct from item->'services' or existing.resources is distinct from item->'resources' or existing.professionals is distinct from item->'professionals'
    or existing.metadata->>'professional_minutes' is distinct from item->'metadata'->>'professional_minutes'
   then raise exception 'El plan ya existe o ha cambiado. Revisa la agenda antes de preparar otro.'; end if;
   answer:=answer||jsonb_build_array(to_jsonb(existing));
  end loop;
  return jsonb_build_object('planKey',p_plan_key,'appliedCount',total,'appointments',answer,'alreadyApplied',true);
 end if;
 if exists(select 1 from public.appointments a where a.organization_id=p_organization_id and a.clinic_id=p_clinic_id and a.patient_id=p_patient_id and a.metadata->>'budgetId'=plan_budget and nullif(a.metadata->>'planId','') is not null and a.deleted_at is null and a.status<>'cancelled') then raise exception 'Este presupuesto ya tiene un plan. Revisa las citas existentes antes de continuar.'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  from_at:=(item->>'starts_at')::timestamptz;to_at:=(item->>'ends_at')::timestamptz;
  for device in select distinct value from jsonb_array_elements_text(item->'resources') where not (item->'professionals' ? value) loop
   turnaround:=case when device='MBST OSTEOSPIN' then 0 else 5 end;
   if exists(
    with overlapping as (
     select distinct a.id,a.starts_at,a.ends_at+make_interval(mins=>turnaround) as occupied_to
     from public.appointments a where a.organization_id=p_organization_id and a.clinic_id=p_clinic_id and a.deleted_at is null and a.status<>'cancelled'
      and a.starts_at<to_at+make_interval(mins=>turnaround) and a.ends_at>from_at-make_interval(mins=>turnaround)
      and exists(select 1 from jsonb_array_elements_text(a.resources) r where
       case when lower(r) like '%magneto%' then 'magnetophysio' when lower(r) like '%bomba%' then 'bomba' else lower(r) end =
       case when lower(device) like '%magneto%' then 'magnetophysio' when lower(device) like '%bomba%' then 'bomba' else lower(device) end)
    ), instants as (select from_at as t union select starts_at from overlapping where starts_at>from_at)
    select 1 from instants i where (select count(*) from overlapping o where o.starts_at<=i.t and i.t<o.occupied_to)>=public.atlas_resource_capacity(device)
   ) then raise exception using errcode='23P01',message=format('El recurso %s ya está reservado el %s. No se ha aplicado ninguna cita del plan.',device,to_char(from_at at time zone 'Europe/Madrid','DD/MM/YYYY HH24:MI')); end if;
  end loop;
  begin
   insert into public.appointments(organization_id,clinic_id,patient_id,starts_at,ends_at,status,services,resources,professionals,notes,forced,client_ref,created_by,metadata)
   values(p_organization_id,p_clinic_id,p_patient_id,from_at,to_at,'pending',item->'services',item->'resources',item->'professionals',item->>'notes',false,item->>'client_ref',auth.uid(),(item->'metadata')||jsonb_build_object('atomic_plan_digest',digest,'atomic_plan_size',total)) returning * into saved;
  exception when others then
   raise exception using errcode=sqlstate,message=format('No se ha aplicado ninguna cita del plan. Revisa el %s (%s): %s',to_char(from_at at time zone 'Europe/Madrid','DD/MM/YYYY HH24:MI'),array_to_string(array(select jsonb_array_elements_text(item->'services')),' + '),sqlerrm);
  end;
  answer:=answer||jsonb_build_array(to_jsonb(saved));
 end loop;
 return jsonb_build_object('planKey',p_plan_key,'appliedCount',total,'appointments',answer,'alreadyApplied',false);
end;
$function$;
revoke all on function public.atlas_apply_treatment_plan(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.atlas_apply_treatment_plan(uuid,uuid,uuid,text,jsonb) to authenticated;
comment on function public.atlas_apply_treatment_plan(uuid,uuid,uuid,text,jsonb) is 'Applies one new treatment plan in one transaction, respecting existing RLS and conflict triggers. Exact retries are idempotent.';
commit;
