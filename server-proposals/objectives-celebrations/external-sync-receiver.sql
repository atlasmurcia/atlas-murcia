-- ATLAS Murcia · receptor seguro de objetivos agregados de otras clínicas.
-- Solo admite cinco totales mensuales; nunca recibe pacientes, citas ni documentos.

create schema if not exists atlas_private;
revoke all on schema atlas_private from public, anon, authenticated;

create table if not exists atlas_private.objective_sync_sources (
  source_clinic text primary key check (source_clinic in ('Alicante','Barcelona')),
  target_organization_id uuid not null references public.organizations(id) on delete cascade,
  target_clinic_id uuid not null references public.clinics(id) on delete cascade,
  token_hash text not null,
  active boolean not null default true,
  last_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on atlas_private.objective_sync_sources from public, anon, authenticated;

create or replace function public.atlas_objectives_receive_external_snapshot(
  p_sync_token text,
  p_source_clinic text,
  p_period date,
  p_generated_at timestamptz,
  p_revenue numeric,
  p_mbst_sessions numeric,
  p_bomba_sessions numeric,
  p_robot_traction_sessions numeric,
  p_brains_sessions numeric,
  p_revenue_target numeric,
  p_mbst_target numeric,
  p_bomba_target numeric,
  p_robot_traction_target numeric,
  p_brains_target numeric
) returns uuid
language plpgsql
security definer
set search_path=public,atlas_private,extensions,pg_temp
as $$
declare
  v_source atlas_private.objective_sync_sources%rowtype;
  v_id uuid;
  v_period date:=date_trunc('month',p_period)::date;
begin
  if p_sync_token is null or length(p_sync_token)<32 then
    raise exception 'Autenticación de sincronización no válida';
  end if;

  select * into v_source
  from atlas_private.objective_sync_sources
  where source_clinic=p_source_clinic and active=true;

  if not found or extensions.crypt(p_sync_token,v_source.token_hash)<>v_source.token_hash then
    raise exception 'Autenticación de sincronización no válida';
  end if;

  if p_generated_at is null
     or p_generated_at>now()+interval '5 minutes'
     or p_generated_at<now()-interval '2 hours' then
    raise exception 'Fecha de generación no válida';
  end if;

  if v_period<>date_trunc('month',timezone('Europe/Madrid',now()))::date then
    raise exception 'Solo se admite el mes actual';
  end if;

  if greatest(
    abs(coalesce(p_revenue,0)),abs(coalesce(p_mbst_sessions,0)),
    abs(coalesce(p_bomba_sessions,0)),abs(coalesce(p_robot_traction_sessions,0)),
    abs(coalesce(p_brains_sessions,0)),abs(coalesce(p_revenue_target,0)),
    abs(coalesce(p_mbst_target,0)),abs(coalesce(p_bomba_target,0)),
    abs(coalesce(p_robot_traction_target,0)),abs(coalesce(p_brains_target,0))
  )>100000000 then
    raise exception 'Totales fuera de rango';
  end if;

  v_id:=public.atlas_objectives_upsert_external_snapshot(
    v_source.target_organization_id,v_source.target_clinic_id,p_source_clinic,v_period,p_generated_at,
    p_revenue,p_mbst_sessions,p_bomba_sessions,p_robot_traction_sessions,p_brains_sessions,
    p_revenue_target,p_mbst_target,p_bomba_target,p_robot_traction_target,p_brains_target
  );

  update atlas_private.objective_sync_sources
  set last_received_at=now(),updated_at=now()
  where source_clinic=p_source_clinic;
  return v_id;
end
$$;

revoke all on function public.atlas_objectives_receive_external_snapshot(text,text,date,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,authenticated;
grant execute on function public.atlas_objectives_receive_external_snapshot(text,text,date,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to anon;

