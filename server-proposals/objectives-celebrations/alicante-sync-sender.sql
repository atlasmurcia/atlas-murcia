-- ATLAS Murcia · envío automático del resumen mensual agregado a Alicante.

create or replace function public.atlas_objectives_sync_to_alicante()
returns bigint
language plpgsql security definer
set search_path=public,vault,net,pg_temp
as $$
declare
  v_org uuid;v_clinic uuid;v_period date:=date_trunc('month',timezone('Europe/Madrid',now()))::date;
  v_values jsonb;v_targets jsonb;v_token text;v_url text;v_key text;v_body jsonb;v_request_id bigint;
begin
  select c.organization_id,c.id into v_org,v_clinic from public.clinics c
  where c.active and (lower(trim(c.name))='murcia' or lower(trim(c.city))='murcia') order by c.created_at limit 1;
  if v_clinic is null then raise exception 'No se encontró la clínica de Murcia';end if;
  v_values:=public.atlas_objectives_calculate(v_org,v_clinic,v_period);
  select coalesce(jsonb_object_agg(metric,target_value),'{}'::jsonb) into v_targets
  from public.management_targets where organization_id=v_org and clinic_id=v_clinic and period=v_period
    and metric in ('revenue','mbst_sessions','bomba_sessions','brains_sessions','robot_traction_sessions');
  select decrypted_secret into v_token from vault.decrypted_secrets where name='atlas_alicante_objectives_sync_token';
  select decrypted_secret into v_url from vault.decrypted_secrets where name='atlas_alicante_objectives_sync_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name='atlas_alicante_publishable_key';
  if v_token is null or v_url is null or v_key is null then raise exception 'Falta la configuración segura de sincronización';end if;
  v_body:=jsonb_build_object(
    'p_sync_token',v_token,'p_source_clinic','Murcia','p_period',v_period,'p_generated_at',now(),
    'p_revenue',coalesce((v_values->>'revenue')::numeric,0),'p_mbst_sessions',coalesce((v_values->>'mbst_sessions')::numeric,0),
    'p_bomba_sessions',coalesce((v_values->>'bomba_sessions')::numeric,0),'p_robot_traction_sessions',coalesce((v_values->>'robot_traction_sessions')::numeric,0),
    'p_brains_sessions',coalesce((v_values->>'brains_sessions')::numeric,0),'p_revenue_target',coalesce((v_targets->>'revenue')::numeric,0),
    'p_mbst_target',coalesce((v_targets->>'mbst_sessions')::numeric,0),'p_bomba_target',coalesce((v_targets->>'bomba_sessions')::numeric,0),
    'p_robot_traction_target',coalesce((v_targets->>'robot_traction_sessions')::numeric,0),'p_brains_target',coalesce((v_targets->>'brains_sessions')::numeric,0)
  );
  select net.http_post(url=>v_url,headers=>jsonb_build_object('Content-Type','application/json','apikey',v_key,'Authorization','Bearer '||v_key),body=>v_body,timeout_milliseconds=>10000) into v_request_id;
  return v_request_id;
end
$$;

revoke all on function public.atlas_objectives_sync_to_alicante() from public,anon,authenticated;
grant execute on function public.atlas_objectives_sync_to_alicante() to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='atlas-objectives-sync-alicante' limit 1;
  if v_job is not null then perform cron.unschedule(v_job);end if;
  perform cron.schedule('atlas-objectives-sync-alicante','5,20,35,50 * * * *','select public.atlas_objectives_sync_to_alicante();');
end
$$;
