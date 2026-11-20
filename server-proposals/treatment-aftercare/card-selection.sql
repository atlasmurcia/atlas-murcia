-- Optional per-card reactivation. Upgrade after database.sql and reactivation-week.sql.
-- Replaces only the existing invoker validator, preserving its grants and RLS.
begin;
create or replace function public.atlas_aftercare_validate(p_config jsonb,p_originals jsonb,p_derived jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare anchor date; mbst_anchor date; r jsonb; phase text; n integer; card record; card_count integer; followups boolean; reactivation boolean; center text; selected_cards jsonb;
begin
 followups:=coalesce((p_config->'aftercare'->>'followups')::boolean,false);reactivation:=coalesce((p_config->'aftercare'->>'reactivation')::boolean,false);
 if p_config->'aftercare' ? 'reactivationCards' then
  selected_cards:=p_config->'aftercare'->'reactivationCards';
  if jsonb_typeof(selected_cards) is distinct from 'array' then raise exception 'Selección de tarjetas MBST inválida.';end if;
  if exists(select 1 from jsonb_array_elements(selected_cards) k where jsonb_typeof(k) is distinct from 'string')
   or (select count(distinct value) from jsonb_array_elements_text(selected_cards))<>jsonb_array_length(selected_cards)
   or reactivation is distinct from (jsonb_array_length(selected_cards)>0) then raise exception 'Selección de tarjetas MBST inválida.';end if;
  if exists(select 1 from jsonb_array_elements_text(selected_cards) k where k='' or not exists(select 1 from jsonb_array_elements(p_originals) a where a->'metadata'->>'aftercareCardKey'=k and exists(select 1 from jsonb_array_elements_text(a->'services') service where lower(service) like 'mbst%'))) then raise exception 'La tarjeta seleccionada no pertenece al ciclo MBST original.';end if;
 else
  -- Legacy plans retain their original all-or-none selection.
  select coalesce(jsonb_agg(distinct value->'metadata'->>'aftercareCardKey'),'[]') into selected_cards from jsonb_array_elements(p_originals) where reactivation and exists(select 1 from jsonb_array_elements_text(value->'services') service where lower(service) like 'mbst%');
 end if;
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
   if not reactivation or not (selected_cards ? (r->'metadata'->>'aftercareCardKey')) or (r->>'starts_at')::timestamptz at time zone 'Europe/Madrid'<mbst_anchor+interval '6 months'
    or (r->>'ends_at')::timestamptz-(r->>'starts_at')::timestamptz<>interval '60 minutes'
    or coalesce(r->'metadata'->>'aftercareCardKey','')='' or not (r->>'notes' like '%Tarjeta %') then raise exception 'Reactivación MBST inválida.';end if;
   if not exists(select 1 from jsonb_array_elements(p_originals) a where a->'metadata'->>'aftercareCardKey'=r->'metadata'->>'aftercareCardKey' and a->'services'=r->'services' and a->'resources'=r->'resources') then raise exception 'La tarjeta, el servicio y el equipo MBST deben coincidir con el ciclo original.';end if;
  end if;
 end loop;
 if reactivation and (select count(distinct date_trunc('week',(value->>'starts_at')::timestamptz at time zone 'Europe/Madrid')) from jsonb_array_elements(p_derived) where value->'metadata'->>'aftercarePhase'='reactivation')>1 then raise exception 'Todas las reactivaciones deben quedar dentro de una misma semana.';end if;
 if reactivation then
  card_count:=jsonb_array_length(selected_cards);
  if card_count not between 1 and 2 then raise exception 'Revisa las tarjetas MBST originales.';end if;
  for card in select value key from jsonb_array_elements_text(selected_cards) loop
   select count(*) into n from jsonb_array_elements(p_derived) a where a->'metadata'->>'aftercarePhase'='reactivation' and a->'metadata'->>'aftercareCardKey'=card.key;
   if n<>3 then raise exception 'Cada tarjeta necesita tres sesiones de reactivación.';end if;
   if exists(select 1 from jsonb_array_elements(p_derived) a join jsonb_array_elements(p_derived) b on a->>'client_ref'<b->>'client_ref' where a->'metadata'->>'aftercareCardKey'=card.key and b->'metadata'->>'aftercareCardKey'=card.key and abs(((a->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date-((b->>'starts_at')::timestamptz at time zone 'Europe/Madrid')::date)<1) then raise exception 'MBST: tres días distintos por tarjeta, admitiendo días consecutivos.';end if;
  end loop;
 end if;
 return jsonb_build_object('anchor',anchor,'mbstAnchor',mbst_anchor);
end $$;

commit;
