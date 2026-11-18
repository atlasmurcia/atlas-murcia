-- Additive installation for each clinic separately; no historical rows are updated.
-- Uses existing permissions. Functions are SECURITY INVOKER; no grants or RLS changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create unique index atlas_cancellation_inbound_once
on public.atlas_internal_tasks (organization_id, clinic_id, source_label)
where source_label like 'whatsapp-cancellation-review:%';

create function public.atlas_guard_cancellation_request()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
end $$;

create function public.atlas_create_cancellation_task()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.metadata->'cancellationRequest'->>'status' = 'pending' then
    -- The appointment row lock serializes concurrent updates and task creation.
    if not exists(select 1 from public.atlas_internal_tasks t
      where t.organization_id = new.organization_id and t.clinic_id = new.clinic_id
      and t.source_appointment_id = new.id and t.source_label = 'whatsapp-cancellation-pending'
      and t.status in ('pending','in_progress','snoozed')) then
      insert into public.atlas_internal_tasks
        (organization_id, clinic_id, patient_id, source_appointment_id, source_label, title, notes, task_type, status, area, assigned_name, due_at)
      values (new.organization_id, new.clinic_id, new.patient_id, new.id, 'whatsapp-cancellation-pending',
        'Pendiente de cancelación · gestionar cita',
        'El paciente no puede asistir. Cancelar la cita y liberar el hueco antes de completar la tarea. Solicitud: ' || coalesce(new.metadata->'cancellationRequest'->>'reason', ''),
        'seguimiento', 'pending', 'recepcion', 'Recepción', now());
    end if;
  end if;
  return new;
end $$;

create function public.atlas_guard_cancellation_task()
returns trigger language plpgsql security invoker set search_path = '' as $$
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
end $$;

create trigger atlas_cancellation_guard before update or delete on public.appointments
for each row execute function public.atlas_guard_cancellation_request();
create trigger atlas_cancellation_task after update on public.appointments
for each row execute function public.atlas_create_cancellation_task();
create trigger atlas_cancellation_task_guard before update or delete on public.atlas_internal_tasks
for each row execute function public.atlas_guard_cancellation_task();
-- Trigger helpers are not standalone RPC endpoints.
revoke all on function public.atlas_guard_cancellation_request() from public;
revoke all on function public.atlas_create_cancellation_task() from public;
revoke all on function public.atlas_guard_cancellation_task() from public;
commit;
