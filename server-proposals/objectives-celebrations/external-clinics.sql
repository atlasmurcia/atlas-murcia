create table if not exists public.objective_external_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  source_clinic text not null check (source_clinic in ('Alicante','Barcelona')),
  period date not null check (period=date_trunc('month',period)::date),
  values jsonb not null,
  targets jsonb not null,
  generated_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (organization_id,clinic_id,source_clinic,period)
);

alter table public.objective_external_snapshots enable row level security;
revoke all on public.objective_external_snapshots from anon,authenticated;

create or replace function public.atlas_objectives_upsert_external_snapshot(
  p_organization_id uuid,
  p_clinic_id uuid,
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
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_period date:=date_trunc('month',p_period)::date;
begin
  if p_source_clinic not in ('Alicante','Barcelona') then raise exception 'Clínica externa no admitida';end if;
  if p_generated_at is null or p_generated_at>now()+interval '5 minutes' then raise exception 'Fecha de generación no válida';end if;
  insert into public.objective_external_snapshots(organization_id,clinic_id,source_clinic,period,values,targets,generated_at,received_at)
  values(p_organization_id,p_clinic_id,p_source_clinic,v_period,
    jsonb_build_object('revenue',greatest(0,coalesce(p_revenue,0)),'mbst_sessions',greatest(0,coalesce(p_mbst_sessions,0)),'bomba_sessions',greatest(0,coalesce(p_bomba_sessions,0)),'robot_traction_sessions',greatest(0,coalesce(p_robot_traction_sessions,0)),'brains_sessions',greatest(0,coalesce(p_brains_sessions,0))),
    jsonb_build_object('revenue',greatest(0,coalesce(p_revenue_target,0)),'mbst_sessions',greatest(0,coalesce(p_mbst_target,0)),'bomba_sessions',greatest(0,coalesce(p_bomba_target,0)),'robot_traction_sessions',greatest(0,coalesce(p_robot_traction_target,0)),'brains_sessions',greatest(0,coalesce(p_brains_target,0))),
    p_generated_at,now())
  on conflict(organization_id,clinic_id,source_clinic,period) do update set values=excluded.values,targets=excluded.targets,generated_at=excluded.generated_at,received_at=now()
  where public.objective_external_snapshots.generated_at<=excluded.generated_at
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.atlas_objectives_upsert_external_snapshot(uuid,uuid,text,date,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.atlas_objectives_upsert_external_snapshot(uuid,uuid,text,date,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) to service_role;

create or replace function public.atlas_objectives_external_snapshot(p_organization_id uuid,p_clinic_id uuid,p_period date default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period date:=coalesce(date_trunc('month',p_period)::date,date_trunc('month',timezone('Europe/Madrid',now()))::date);v_result jsonb;
begin
  if not public.atlas_objectives_is_member(p_organization_id,p_clinic_id) then raise exception 'Acceso no autorizado';end if;
  select jsonb_build_object('period',v_period,'generated_at',max(generated_at),'clinics',coalesce(jsonb_agg(jsonb_build_object('name',source_clinic,'live',true,'values',values,'targets',targets,'generated_at',generated_at) order by source_clinic),'[]'::jsonb))
  into v_result from public.objective_external_snapshots
  where organization_id=p_organization_id and clinic_id=p_clinic_id and period=v_period;
  return coalesce(v_result,jsonb_build_object('period',v_period,'clinics','[]'::jsonb));
end $$;
revoke all on function public.atlas_objectives_external_snapshot(uuid,uuid,date) from public,anon;
grant execute on function public.atlas_objectives_external_snapshot(uuid,uuid,date) to authenticated;
