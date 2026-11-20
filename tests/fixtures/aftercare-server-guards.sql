-- Verified server guards, reproduced only for isolated synthetic PostgreSQL tests.
-- Clinic and organization IDs below are synthetic; no patient records are included.
CREATE OR REPLACE FUNCTION public.atlas_guard_cancellation_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare request jsonb; unresolved boolean;
begin
  request := old.metadata->'cancellationRequest';
  if tg_op = 'DELETE' then
    if request->>'status' = 'pending' then raise exception 'Tramita la cancelación antes de eliminar la cita'; end if;
    return old;
  end if;
  if request->>'status' = 'pending' then
    if new.deleted_at is not null then
      raise exception 'Tramita la cancelación antes de eliminar la cita';
    end if;
    if new.status = 'cancelled' then
      if auth.uid() is null then raise exception 'La cancelación pendiente requiere gestión de recepción'; end if;
      request := request || jsonb_build_object('status', 'resolved', 'resolvedAt', now(), 'resolvedBy', auth.uid());
      new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('cancellationRequest', request);
    else
      if new.status not in ('pending', 'confirmed') then raise exception 'La cita está pendiente de cancelación'; end if;
      if new.status = 'confirmed'
         or (new.metadata->>'appointmentConfirmationStatus' = 'confirmed' and old.metadata->>'appointmentConfirmationStatus' is distinct from 'confirmed')
         or (new.metadata->>'whatsappConfirmationStatus' = 'confirmed' and old.metadata->>'whatsappConfirmationStatus' is distinct from 'confirmed') then
        raise exception 'Recepción debe gestionar la cancelación antes de confirmar';
      end if;
      -- Preserve the request even if a stale browser save omitted it.
      if jsonb_typeof(new.metadata->'cancellationRequest'->'inboundMessageIds') = 'array' then
        request := request || jsonb_build_object('inboundMessageIds',
          (select jsonb_agg(distinct value) from jsonb_array_elements(
            coalesce(request->'inboundMessageIds','[]'::jsonb) || (new.metadata->'cancellationRequest'->'inboundMessageIds'))));
      end if;
      new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('cancellationRequest', request);
    end if;
  end if;
  if new.metadata->'cancellationRequest'->>'status' = 'pending' then
    new.status := 'pending';
    new.metadata := (coalesce(new.metadata, '{}'::jsonb)
      - 'appointmentConfirmationAt' - 'whatsappConfirmationAt' - 'appointmentConfirmationByName')
      || jsonb_build_object('status', 'Pendiente', 'appointmentConfirmationStatus', 'not_confirmed', 'whatsappConfirmationStatus', 'not_confirmed');
  end if;
  -- An unidentified request protects the patient's appointments until reception identifies it.
  if new.status <> 'cancelled' and (new.status = 'confirmed' or new.metadata->>'appointmentConfirmationStatus' = 'confirmed' or new.metadata->>'whatsappConfirmationStatus' = 'confirmed') then
    select exists(select 1 from public.atlas_internal_tasks t
      where t.organization_id = new.organization_id and t.clinic_id = new.clinic_id
      and t.patient_id = new.patient_id and t.source_label like 'whatsapp-cancellation-review:%'
      and t.status in ('pending','in_progress','snoozed')) into unresolved;
    if unresolved then raise exception 'Hay una solicitud de cancelación pendiente de identificar en recepción'; end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.atlas_guard_cancellation_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare appointment public.appointments%rowtype; linked_id uuid;
begin
  if old.source_label = 'whatsapp-cancellation-pending' or old.source_label like 'whatsapp-cancellation-review:%' then
    if old.status in ('pending','in_progress','snoozed') then
      if tg_op = 'DELETE' then raise exception 'La solicitud de cancelación debe conservarse hasta su gestión'; end if;
      if new.source_label is distinct from old.source_label or new.clinic_id is distinct from old.clinic_id
        or new.organization_id is distinct from old.organization_id or new.patient_id is distinct from old.patient_id then
        raise exception 'No se puede desvincular una solicitud de cancelación pendiente';
      end if;
      if new.area <> 'recepcion' or to_jsonb(new)->>'deleted_at' is not null then
        raise exception 'La solicitud pendiente debe permanecer visible en recepción';
      end if;
      if old.source_appointment_id is not null and new.source_appointment_id is distinct from old.source_appointment_id then
        raise exception 'No se puede sustituir la cita de una solicitud de cancelación';
      end if;
      if new.status not in ('pending','in_progress','snoozed') then
        if auth.uid() is null then raise exception 'Solo recepción puede completar la gestión'; end if;
        linked_id := coalesce(old.source_appointment_id, new.source_appointment_id);
        select * into appointment from public.appointments a where a.id = linked_id
          and a.organization_id = old.organization_id and a.clinic_id = old.clinic_id
          and (old.patient_id is null or a.patient_id = old.patient_id) for update;
        if not found or appointment.status <> 'cancelled' or appointment.deleted_at is not null then
          raise exception 'Identifica y cancela la cita antes de cerrar la tarea';
        end if;
        if new.status <> 'completed' then raise exception 'Registra la gestión como completada'; end if;
        new.completed_at := now();
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.atlas_guard_mbst_day()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare local_day date; active_count int; previous_end timestamptz; next_start timestamptz;
begin
  if new.deleted_at is not null or new.status in ('cancelled','no_show')
     or coalesce(new.services::text,'') not ilike '%mbst%' then return new; end if;
  if tg_op='UPDATE' and old.patient_id=new.patient_id and old.starts_at=new.starts_at
     and old.ends_at=new.ends_at and old.services=new.services
     and old.status not in ('cancelled','no_show') and old.deleted_at is null then return new; end if;
  local_day := (new.starts_at at time zone 'Europe/Madrid')::date;
  perform pg_advisory_xact_lock(hashtextextended('atlas-mbst:'||new.patient_id::text||':'||local_day::text,0));
  select count(*),max(ends_at),min(starts_at) into active_count,previous_end,next_start
    from public.appointments
    where patient_id=new.patient_id and clinic_id=new.clinic_id and id is distinct from new.id
      and (starts_at at time zone 'Europe/Madrid')::date=local_day
      and status not in ('cancelled','no_show') and deleted_at is null
      and services::text ilike '%mbst%';
  if active_count>=2 then
    raise exception 'Este paciente ya tiene dos MBST el %. No se puede añadir otra.',local_day;
  end if;
  if active_count>0 and nullif(new.metadata->>'planId','') is not null
     and (new.starts_at>previous_end+interval '15 minutes'
          or next_start>new.ends_at+interval '15 minutes') then
    raise exception 'Las MBST automáticas del mismo día deben quedar en una sola visita, sin separar mañana y tarde.';
  end if;
  return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.atlas_keep_completed_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.status='completed' and new.status in ('pending','confirmed','arrived','no_show')
 and not (
  coalesce(new.metadata#>>'{attendance,status}','')='pending'
  and coalesce(new.metadata#>>'{attendance,correctionReason}','')<>''
  and coalesce(new.metadata#>>'{attendance,correctedAt}','')>greatest(coalesce(old.metadata#>>'{attendance,completedAt}',''),coalesce(old.metadata#>>'{attendance,correctedAt}',''))
 ) then
  new.status:='completed';
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('status','Realizada','planConflict',false,'attendance',coalesce(old.metadata->'attendance','{}'::jsonb));
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.atlas_keep_historic_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(old.metadata->>'historico','') = 'true'
     and coalesce(current_setting('atlas.migration_mode', true), '') <> 'on' then
    return old;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.atlas_murcia_reject_holiday_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  agenda jsonb;
  holiday_date date;
  holiday_name text;
BEGIN
  IF NEW.organization_id IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid
     OR NEW.clinic_id IS DISTINCT FROM '20000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at
       AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at
       AND NEW.clinic_id IS NOT DISTINCT FROM OLD.clinic_id
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND OLD.deleted_at IS NULL AND OLD.status <> 'cancelled' THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.starts_at IS NULL OR NEW.ends_at IS NULL OR NEW.ends_at <= NEW.starts_at THEN RETURN NEW; END IF;
  SELECT s.payload INTO agenda FROM public.clinic_settings s
    WHERE s.organization_id = NEW.organization_id AND s.clinic_id = NEW.clinic_id AND s.section = 'agenda';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No se pudo comprobar el calendario de cierres de FisioSport Murcia.';
  END IF;
  SELECT (h.value->>'date')::date, coalesce(nullif(h.value->>'name',''),'Festivo')
    INTO holiday_date, holiday_name
    FROM jsonb_array_elements(coalesce(agenda->'holidays','[]'::jsonb)) h(value)
    WHERE h.value->>'date' ~ '^2027-[0-9]{2}-[0-9]{2}$'
      AND NEW.starts_at < (((h.value->>'date')::date + 1)::timestamp AT TIME ZONE 'Europe/Madrid')
      AND NEW.ends_at > ((h.value->>'date')::date::timestamp AT TIME ZONE 'Europe/Madrid')
    ORDER BY h.value->>'date' LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('Festivo / Clínica cerrada: FisioSport Murcia permanece cerrada el %s (%s). No se permiten reservas ni asignaciones de citas.',to_char(holiday_date,'DD/MM/YYYY'),holiday_name);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.atlas_professional_minutes(p_services jsonb, p_metadata jsonb, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with names as (
    select lower(translate(btrim(regexp_replace(value,'\s+',' ','g')),'áéíóúüÁÉÍÓÚÜñÑ','aeiouuAEIOUUnN')) as n, ord
    from jsonb_array_elements_text(case when jsonb_typeof(p_services)='array' then p_services else '[]'::jsonb end) with ordinality s(value,ord)
  ), info as (
    select
      coalesce((select n from names order by ord limit 1),
               lower(translate(btrim(coalesce(p_metadata->>'therapy','')),'áéíóúüÁÉÍÓÚÜñÑ','aeiouuAEIOUUnN'))) as therapy,
      greatest(0, round(extract(epoch from (p_ends_at - p_starts_at))/60))::integer as duration
  )
  select least(info.duration, case
    -- 1. La agenda envía el valor calculado: es la fuente de verdad.
    when coalesce(p_metadata->>'professional_minutes','') ~ '^\d+(\.\d+)?$'
      then round((p_metadata->>'professional_minutes')::numeric)::integer
    -- 2. Avisos, llamadas y seguimientos no ocupan al profesional.
    when exists (select 1 from names where n in ('aviso','avisos') or n like 'llamada %' or n like 'seguimiento %') then 0
    -- 3. Neuromodulación + Osteopatía en la misma cita: 45 minutos.
    when exists (select 1 from names where n like '%neuromodulacion%') and exists (select 1 from names where n like '%osteopatia%') then 45
    -- 4. Bomba dinámica: 15 minutos; bomba estática: no ocupa.
    when exists (select 1 from names where n like '%bomba%' and n like '%dinamica%') then 15
    when exists (select 1 from names where n like '%bomba%' and n like '%estatica%') then 0
    -- 5. Terapias sin profesional.
    when info.therapy like 'mbst%' or info.therapy in ('magnetophysio','magneto','sis','vacu') then 0
    -- 6. Tiempo de profesional configurado en la agenda (therapyProfessionalDurations).
    when info.therapy in ('robot','physicalm','physicalm dinamico','physicalm estatico','brains','imoove','bomba','bomba diamagnetica','onda de choque','onda','camilla') then 15
    when info.therapy in ('traccion','camilla fd','camilla flexion-distraccion','camilla fd club de afiliados') then 0
    when info.therapy in ('fisioterapia') then 30
    when info.therapy in ('dpa','neuromodulacion','osteopatia','readaptacion') then 45
    -- 7. En el resto, toda la cita.
    else info.duration
  end)
  from info
$function$
;

CREATE OR REPLACE FUNCTION public.atlas_prevent_appointment_conflicts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare conflict_kind text; new_professional_minutes integer;
begin
  if tg_op='UPDATE' and old.deleted_at is null and old.status<>'cancelled'
     and row(new.organization_id,new.clinic_id,new.patient_id,new.starts_at,new.ends_at,new.resources,new.professionals,new.forced)
         is not distinct from row(old.organization_id,old.clinic_id,old.patient_id,old.starts_at,old.ends_at,old.resources,old.professionals,old.forced)
  then return new; end if;
  if new.deleted_at is not null or new.status = 'cancelled' then return new; end if;
  if new.ends_at <= new.starts_at then
    raise exception using errcode='22007', message='La hora de fin debe ser posterior a la hora de inicio.';
  end if;
  if current_setting('atlas.migration_mode', true) = 'on'
     and coalesce(new.metadata->>'migration_source','') = 'koibox'
     and coalesce(new.metadata->>'migration_run_id','') <> '' then
    return new;
  end if;
  if coalesce(new.forced,false) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.clinic_id::text, 0));

  if exists (
    select 1 from public.appointments a
    where a.clinic_id = new.clinic_id and a.id <> new.id and a.deleted_at is null and a.status <> 'cancelled'
      and a.starts_at < new.ends_at and new.starts_at < a.ends_at
      and a.patient_id = new.patient_id
  ) then conflict_kind := 'patient';
  -- Un equipo choca si en algún instante de la cita nueva ya hay tantas citas como unidades.
  -- La ocupación máxima se da siempre al inicio de alguna cita, así que basta con mirar esos instantes.
  elsif exists (
    with overl as (
      select a.starts_at, a.ends_at, nr.resource
      from jsonb_array_elements_text(coalesce(new.resources,'[]'::jsonb)) nr(resource)
      join public.appointments a
        on a.clinic_id = new.clinic_id and a.id <> new.id and a.deleted_at is null and a.status <> 'cancelled'
       and a.starts_at < new.ends_at and new.starts_at < a.ends_at
       and coalesce(a.resources,'[]'::jsonb) ? nr.resource
    ), instants as (
      select nr.resource, new.starts_at as t from jsonb_array_elements_text(coalesce(new.resources,'[]'::jsonb)) nr(resource)
      union select resource, starts_at from overl where starts_at > new.starts_at
    )
    select 1 from instants i
    where (select count(*) from overl o where o.resource = i.resource and o.starts_at <= i.t and i.t < o.ends_at)
          >= public.atlas_resource_capacity(i.resource)
  ) then conflict_kind := 'resource';
  else
    -- Profesionales: cada cita ocupa al profesional solo los minutos que reserva desde su inicio
    -- (por ejemplo, Neuromodulación + Osteopatía, 45 min de una cita de 60), igual que la agenda.
    new_professional_minutes := public.atlas_professional_minutes(new.services, new.metadata, new.starts_at, new.ends_at);
    if new_professional_minutes > 0 and exists (
      select 1 from public.appointments a
      cross join lateral (select public.atlas_professional_minutes(a.services, a.metadata, a.starts_at, a.ends_at) as minutes) am
      where a.clinic_id = new.clinic_id and a.id <> new.id and a.deleted_at is null and a.status <> 'cancelled'
        and a.starts_at < new.ends_at and new.starts_at < a.ends_at
        and exists (
          select 1 from jsonb_array_elements_text(coalesce(new.professionals,'[]'::jsonb)) np
          join jsonb_array_elements_text(coalesce(a.professionals,'[]'::jsonb)) ap on ap.value=np.value
        )
        and am.minutes > 0
        and a.starts_at < new.starts_at + make_interval(mins => new_professional_minutes)
        and new.starts_at < a.starts_at + make_interval(mins => am.minutes)
    ) then conflict_kind := 'professional';
    end if;
  end if;

  if conflict_kind is not null then
    raise exception using errcode='23P01',
      message=case conflict_kind
        when 'patient' then 'El paciente ya tiene otra cita en ese horario.'
        when 'resource' then 'Uno de los equipos o recursos ya está reservado.'
        else 'Uno de los profesionales ya está ocupado.'
      end;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.atlas_resource_capacity(p_resource text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_resource when 'MBST OSTEOSPIN' then 2 else 1 end;
$function$
;
CREATE TRIGGER appointments_000_keep_historic BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION atlas_keep_historic_appointment();
CREATE TRIGGER appointments_00_keep_completed BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION atlas_keep_completed_status();
CREATE TRIGGER appointments_guard_mbst_day BEFORE INSERT OR UPDATE OF patient_id, clinic_id, starts_at, ends_at, services, status, deleted_at ON public.appointments FOR EACH ROW EXECUTE FUNCTION atlas_guard_mbst_day();
CREATE TRIGGER atlas_cancellation_guard BEFORE DELETE OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION atlas_guard_cancellation_request();
CREATE TRIGGER atlas_murcia_holiday_booking_guard BEFORE INSERT OR UPDATE OF starts_at, ends_at, organization_id, clinic_id, status, deleted_at ON public.appointments FOR EACH ROW WHEN (((new.organization_id = '10000000-0000-0000-0000-000000000001'::uuid) AND (new.clinic_id = '20000000-0000-0000-0000-000000000001'::uuid))) EXECUTE FUNCTION atlas_murcia_reject_holiday_booking();
CREATE TRIGGER atlas_cancellation_task_guard BEFORE DELETE OR UPDATE ON public.atlas_internal_tasks FOR EACH ROW EXECUTE FUNCTION atlas_guard_cancellation_task();
