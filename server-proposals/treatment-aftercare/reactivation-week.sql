-- Rule-only upgrade: all reactivation sessions in one calendar week.
-- Distinct days per card; consecutive days are allowed. No data is changed.
begin;
create or replace function public.atlas_aftercare_validate(p_config jsonb,p_originals jsonb,p_derived jsonb)
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
 if reactivation and (select count(distinct date_trunc('week',(value->>'starts_at')::timestamptz at time zone 'Europe/Madrid')) from jsonb_array_elements(p_derived) where value->'metadata'->>'aftercarePhase'='reactivation')>1 then raise exception 'Todas las reactivaciones deben quedar dentro de una misma semana.';end if;
 if reactivation then
  select count(distinct value->'metadata'->>'aftercareCardKey') into card_count from jsonb_array_elements(p_originals) where exists(select 1 from jsonb_array_elements_text(value->'services') v where lower(v) like 'mbst%');
  if card_count not between 1 and 2 then raise exception 'Revisa las tarjetas MBST originales.';end if;
  for card in select distinct value->'metadata'->>'aftercareCardKey' key from jsonb_array_elements(p_originals) where exists(select 1 from jsonb_array_elements_text(value->'services') v where lower(v) like 'mbst%') loop
   select count(*) into n from jsonb_array_elements(p_derived) a where a->'metadata'->>'aftercarePhase'='reactivation' and a->'metadata'->>'aftercareCardKey'=card.key;
   if n<>3 then raise exception 'Cada tarjeta necesita tres sesiones de reactivación.';end if;
   if exists(select 1 from jsonb_array_elements(p_derived) a join jsonb_array_elements(p_derived) b on a->>'client_ref'<b->>'client_ref' where a->'metadata'->>'aftercareCardKey'=card.key and b->'metadata'->>'aftercareCardKey'=card.key and abs(((a->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date-((b->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date)<1) then raise exception 'MBST: tres días distintos por tarjeta, admitiendo días consecutivos.';end if;
  end loop;
 end if;
 return jsonb_build_object('anchor',anchor,'mbstAnchor',mbst_anchor);
end $$;

create or replace function public.atlas_reconcile_aftercare(p_organization_id uuid,p_clinic_id uuid,p_id uuid,p_revision integer,p_notice_digest text,p_rows jsonb)
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
 if (select count(distinct date_trunc('week',(value->>'starts_at')::timestamptz at time zone 'Europe/Madrid')) from jsonb_array_elements(combined) where value->'metadata'->>'aftercarePhase'='reactivation' and value->>'status'<>'cancelled' and value->>'deleted_at' is null)>1 then raise exception 'Todas las reactivaciones activas deben quedar dentro de una misma semana.';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) a join jsonb_array_elements(combined) b on a->>'client_ref'<>b->>'client_ref' where a->'metadata'->>'aftercarePhase'='reactivation' and b->'metadata'->>'aftercarePhase'='reactivation' and a->'metadata'->>'aftercareCardKey'=b->'metadata'->>'aftercareCardKey' and b->>'status'<>'cancelled' and b->>'deleted_at' is null and abs(((a->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date-((b->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date)<1) then raise exception 'La reactivación necesita días distintos admitiendo días consecutivos por tarjeta.';end if;
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

commit;
