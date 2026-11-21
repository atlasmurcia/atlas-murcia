-- ATLAS Murcia · objetivos mensuales y celebraciones
-- Aplicar primero en una rama de Supabase sin datos reales.

begin;

alter table public.management_targets drop constraint if exists management_targets_metric_check;
alter table public.management_targets add constraint management_targets_metric_check check (metric = any (array[
  'revenue','expenses','operating_margin','appointments','new_leads','lead_conversion','attendance_rate',
  'mbst_sessions','bomba_sessions','brains_sessions','robot_traction_sessions'
]));
alter table public.management_targets enable row level security;

create or replace function public.atlas_objectives_is_management(p_organization_id uuid,p_clinic_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.organization_id=p_organization_id and m.active and (m.clinic_id is null or m.clinic_id=p_clinic_id) and (m.role in ('owner','administrator') or coalesce((m.permissions->>'management')::boolean,false) or coalesce((m.permissions->>'management_access')::boolean,false) or lower(coalesce(m.permissions->>'display_role',''))='gestión'))
$$;
revoke all on function public.atlas_objectives_is_management(uuid,uuid) from public,anon;grant execute on function public.atlas_objectives_is_management(uuid,uuid) to authenticated;

drop policy if exists management_targets_insert_owner on public.management_targets;
drop policy if exists management_targets_update_owner on public.management_targets;
create policy management_targets_insert_management on public.management_targets for insert to authenticated
with check ((select public.atlas_objectives_is_management(organization_id,clinic_id)));
create policy management_targets_update_management on public.management_targets for update to authenticated
using ((select public.atlas_objectives_is_management(organization_id,clinic_id)))
with check ((select public.atlas_objectives_is_management(organization_id,clinic_id)));

create table if not exists public.objective_target_audit (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), clinic_id uuid not null references public.clinics(id),
 period date not null, metric text not null, old_value numeric, new_value numeric not null, changed_by uuid references auth.users(id), changed_at timestamptz not null default now()
);
create index if not exists objective_target_audit_clinic_period_idx on public.objective_target_audit(clinic_id,period,changed_at desc);
create index if not exists objective_target_audit_organization_idx on public.objective_target_audit(organization_id);
create index if not exists objective_target_audit_changed_by_idx on public.objective_target_audit(changed_by);
alter table public.objective_target_audit enable row level security;
create policy objective_target_audit_read_management on public.objective_target_audit for select to authenticated
using ((select public.atlas_objectives_is_management(organization_id,clinic_id)));
revoke all on public.objective_target_audit from anon;
grant select on public.objective_target_audit to authenticated;

create or replace function public.atlas_audit_objective_target() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' or old.target_value is distinct from new.target_value then
  insert into public.objective_target_audit(organization_id,clinic_id,period,metric,old_value,new_value,changed_by)
  values(new.organization_id,new.clinic_id,new.period,new.metric,case when tg_op='UPDATE' then old.target_value end,new.target_value,(select auth.uid()));
 end if;
 return new;
end $$;
revoke all on function public.atlas_audit_objective_target() from public,anon,authenticated;
drop trigger if exists management_targets_objective_audit on public.management_targets;
create trigger management_targets_objective_audit after insert or update of target_value on public.management_targets for each row execute function public.atlas_audit_objective_target();

create table if not exists public.objective_settings (
 clinic_id uuid primary key references public.clinics(id), organization_id uuid not null references public.organizations(id),
 sound_key text not null default 'caja-wow', hourly_frequency_minutes integer not null default 60 check(hourly_frequency_minutes between 15 and 240),
 opening_hours jsonb not null default '{"1":["08:00","21:00"],"2":["08:00","21:00"],"3":["08:00","21:00"],"4":["08:00","21:00"],"5":["08:00","21:00"],"6":["09:00","14:00"]}'::jsonb,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create index if not exists objective_settings_organization_idx on public.objective_settings(organization_id);
create index if not exists objective_settings_updated_by_idx on public.objective_settings(updated_by);
alter table public.objective_settings enable row level security;
create policy objective_settings_read_members on public.objective_settings for select to authenticated using (exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.organization_id=objective_settings.organization_id and m.active and (m.clinic_id is null or m.clinic_id=objective_settings.clinic_id)));
create policy objective_settings_insert_management on public.objective_settings for insert to authenticated with check ((select public.atlas_objectives_is_management(organization_id,clinic_id)));
create policy objective_settings_update_management on public.objective_settings for update to authenticated using ((select public.atlas_objectives_is_management(organization_id,clinic_id))) with check ((select public.atlas_objectives_is_management(organization_id,clinic_id)));
revoke all on public.objective_settings from anon;grant select,insert,update on public.objective_settings to authenticated;

create table if not exists public.objective_notifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), clinic_id uuid not null references public.clinics(id),
 recipient_user_id uuid not null references auth.users(id), kind text not null check(kind in ('hourly_progress','goal_reached','personal_sale')),
 period date not null, metric text, title text not null, body text not null, payload jsonb not null default '{}'::jsonb,
 dedupe_key text not null, created_at timestamptz not null default now(), acknowledged_at timestamptz,
 unique(recipient_user_id,dedupe_key)
);
create index if not exists objective_notifications_recipient_pending_idx on public.objective_notifications(recipient_user_id,created_at) where acknowledged_at is null;
create index if not exists objective_notifications_organization_idx on public.objective_notifications(organization_id);
create index if not exists objective_notifications_clinic_idx on public.objective_notifications(clinic_id);
alter table public.objective_notifications enable row level security;
create policy objective_notifications_read_own on public.objective_notifications for select to authenticated using (recipient_user_id=(select auth.uid()));
revoke all on public.objective_notifications from anon,authenticated;grant select on public.objective_notifications to authenticated;

create table if not exists public.objective_progress_snapshots (
 organization_id uuid not null references public.organizations(id), clinic_id uuid not null references public.clinics(id), period date not null,
 snapshot_hour timestamptz not null, values jsonb not null, created_at timestamptz not null default now(), primary key(clinic_id,snapshot_hour)
);
create index if not exists objective_progress_snapshots_organization_idx on public.objective_progress_snapshots(organization_id);
alter table public.objective_progress_snapshots enable row level security;
revoke all on public.objective_progress_snapshots from anon,authenticated;

create or replace function public.atlas_objective_metric_for_category(p_category text) returns text language sql immutable set search_path=public,pg_temp as $$
 select case
  when upper(trim(coalesce(p_category,'')))='MBST' then 'mbst_sessions'
  when upper(trim(coalesce(p_category,''))) in ('BOMBA','BOMBA DIAMAGNETICA') then 'bomba_sessions'
  when upper(trim(coalesce(p_category,'')))='BRAINS WAY' then 'brains_sessions'
  when upper(trim(coalesce(p_category,''))) in ('ROBOT','TRACCION','TRACCIÓN') then 'robot_traction_sessions'
 end
$$;

create or replace function public.atlas_objectives_calculate(p_organization_id uuid,p_clinic_id uuid,p_period date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_from timestamptz;v_to timestamptz;v_revenue numeric:=0;v_sessions jsonb:='{}'::jsonb;
begin
 v_from=(date_trunc('month',p_period::timestamp) at time zone 'Europe/Madrid');v_to=v_from+interval '1 month';
 with payment_events as (
  select p.id,p.budget_id,p.appointment_id,p.metadata,p.paid_at event_at,
   case when p.payment_type='refund' then -abs(p.amount) else p.amount end signed_amount
  from public.payments p where p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null and p.status in ('completed','cancelled','refunded')
  union all
  select p.id,p.budget_id,p.appointment_id,p.metadata,p.cancelled_at,-abs(p.amount)
  from public.payments p where p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null and p.payment_type<>'refund' and p.cancelled_at is not null
 ) select coalesce(sum(signed_amount),0) into v_revenue from payment_events where event_at>=v_from and event_at<v_to;

 with catalog as (
  select lower(trim(s->>'name')) service_name,public.atlas_objective_metric_for_category(s->>'category') metric
  from public.clinic_settings c cross join lateral jsonb_array_elements(coalesce(c.payload->'services','[]'::jsonb)) s
  where c.organization_id=p_organization_id and c.clinic_id=p_clinic_id and c.section='sales'
 ), payment_events as (
  select p.id,p.budget_id,p.appointment_id,p.metadata,p.paid_at event_at,case when p.payment_type='refund' then -abs(p.amount) else p.amount end signed_amount
  from public.payments p where p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null and p.status in ('completed','cancelled','refunded')
  union all select p.id,p.budget_id,p.appointment_id,p.metadata,p.cancelled_at,-abs(p.amount)
  from public.payments p where p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null and p.payment_type<>'refund' and p.cancelled_at is not null
 ), month_events as (select * from payment_events where event_at>=v_from and event_at<v_to),
 budget_units as (
  select c.metric,sum(bl.sessions::numeric*e.signed_amount/nullif(b.total,0)) units
  from month_events e join public.budgets b on b.id=e.budget_id join public.budget_lines bl on bl.budget_id=b.id
  join catalog c on c.service_name=lower(trim(bl.service_name)) where c.metric is not null and coalesce(bl.metadata->>'line_kind','service')<>'product' group by c.metric
 ), direct_lines as (
  select e.*,coalesce(line->>'service',line->>'name',line#>>'{}') service_name,coalesce(nullif(line->>'quantity','')::numeric,nullif(line->>'sessions','')::numeric,1) quantity
  from month_events e cross join lateral jsonb_array_elements(case when jsonb_typeof(e.metadata->'invoice_lines')='array' then e.metadata->'invoice_lines' when jsonb_typeof(e.metadata->'services')='array' then e.metadata->'services' else '[]'::jsonb end) line where e.budget_id is null
 ), direct_units as (select c.metric,sum(case when e.signed_amount<0 then -abs(e.quantity) else abs(e.quantity) end) units from direct_lines e join catalog c on c.service_name=lower(trim(e.service_name)) where c.metric is not null group by c.metric),
 month_appointments as materialized (
  select a.* from public.appointments a
  where a.organization_id=p_organization_id and a.clinic_id=p_clinic_id and a.deleted_at is null and a.status='completed' and a.starts_at>=v_from and a.starts_at<v_to
 ), paid_central_appointments as materialized (
  select distinct p.appointment_id
  from public.payments p
  where p_period=date '2026-11-01' and p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null and p.appointment_id is not null
  union
  select distinct value::uuid
  from public.payments p cross join lateral jsonb_array_elements_text(coalesce(p.metadata->'group_central_appointment_ids','[]'::jsonb)) value
  where p_period=date '2026-11-01' and p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null
   and value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ), paid_client_appointments as materialized (
  select distinct value client_ref
  from public.payments p cross join lateral jsonb_array_elements_text(coalesce(p.metadata->'group_appointment_ids','[]'::jsonb)) value
  where p_period=date '2026-11-01' and p.organization_id=p_organization_id and p.clinic_id=p_clinic_id and p.deleted_at is null
 ), paid_budget_services as materialized (
  select distinct b.patient_id,b.clinic_id,lower(trim(bl.service_name)) service_name
  from public.budgets b join public.budget_lines bl on bl.budget_id=b.id
  join public.payments p on p.budget_id=b.id and p.deleted_at is null and p.status='completed' and p.payment_type<>'refund' and p.cancelled_at is null
  where p_period=date '2026-11-01' and b.organization_id=p_organization_id and b.clinic_id=p_clinic_id
 ),
 gift_lines as (
  select a.id,a.client_ref,service#>>'{}' service_name
  from month_appointments a cross join lateral jsonb_array_elements(coalesce(a.services,'[]'::jsonb)) service
  left join paid_central_appointments pc on pc.appointment_id=a.id
  left join paid_client_appointments pcl on pcl.client_ref=a.client_ref
  left join paid_budget_services pbs on pbs.patient_id=a.patient_id and pbs.clinic_id=a.clinic_id and pbs.service_name=lower(trim(service#>>'{}'))
  where coalesce((a.metadata->>'no_cost_gift')::boolean,(a.metadata->>'noCostGift')::boolean,false)
   or (p_period=date '2026-11-01' and pc.appointment_id is null and pcl.client_ref is null and pbs.patient_id is null)
 ), gift_units as (select c.metric,count(*)::numeric units from gift_lines g join catalog c on c.service_name=lower(trim(g.service_name)) where c.metric is not null group by c.metric),
 combined as (select metric,sum(units) units from (select * from budget_units union all select * from direct_units union all select * from gift_units) x group by metric)
 select coalesce(jsonb_object_agg(metric,round(units,1)),'{}'::jsonb) into v_sessions from combined;
 return jsonb_build_object('revenue',round(v_revenue,2),'mbst_sessions',coalesce((v_sessions->>'mbst_sessions')::numeric,0),'bomba_sessions',coalesce((v_sessions->>'bomba_sessions')::numeric,0),'brains_sessions',coalesce((v_sessions->>'brains_sessions')::numeric,0),'robot_traction_sessions',coalesce((v_sessions->>'robot_traction_sessions')::numeric,0));
end $$;
revoke all on function public.atlas_objectives_calculate(uuid,uuid,date) from public,anon,authenticated;

create or replace function public.atlas_objectives_is_member(p_organization_id uuid,p_clinic_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.memberships m where m.user_id=(select auth.uid()) and m.organization_id=p_organization_id and m.active and (m.clinic_id is null or m.clinic_id=p_clinic_id))
$$;
revoke all on function public.atlas_objectives_is_member(uuid,uuid) from public,anon;grant execute on function public.atlas_objectives_is_member(uuid,uuid) to authenticated;

create or replace function public.atlas_objectives_snapshot(p_organization_id uuid,p_clinic_id uuid,p_period date default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_period date:=coalesce(date_trunc('month',p_period)::date,date_trunc('month',timezone('Europe/Madrid',now()))::date);v_values jsonb;v_targets jsonb;v_settings jsonb;v_now timestamptz:=now();v_hour timestamptz;v_previous jsonb;v_summary text;v_metric record;v_budget record;
begin
 if not public.atlas_objectives_is_member(p_organization_id,p_clinic_id) then raise exception 'Acceso no autorizado';end if;
 v_values:=public.atlas_objectives_calculate(p_organization_id,p_clinic_id,v_period);
 select coalesce(jsonb_object_agg(metric,target_value),'{}'::jsonb) into v_targets from public.management_targets where organization_id=p_organization_id and clinic_id=p_clinic_id and period=v_period and metric in ('revenue','mbst_sessions','bomba_sessions','brains_sessions','robot_traction_sessions');
 select coalesce((select jsonb_build_object('sound_key',sound_key,'hourly_frequency_minutes',hourly_frequency_minutes,'opening_hours',opening_hours) from public.objective_settings where clinic_id=p_clinic_id),jsonb_build_object('sound_key','caja-wow','hourly_frequency_minutes',60)) into v_settings;
 for v_metric in select key,value from jsonb_each(v_targets) loop
  if (v_metric.value#>>'{}')::numeric>0 and coalesce((v_values->>v_metric.key)::numeric,0)>=(v_metric.value#>>'{}')::numeric then
   insert into public.objective_notifications(organization_id,clinic_id,recipient_user_id,kind,period,metric,title,body,payload,dedupe_key)
   select p_organization_id,p_clinic_id,m.user_id,'goal_reached',v_period,v_metric.key,'¡Objetivo conseguido!','¡Murcia ha alcanzado el objetivo de '||case v_metric.key when 'revenue' then 'Facturación' when 'mbst_sessions' then 'MBST' when 'bomba_sessions' then 'Bomba' when 'brains_sessions' then 'Brains' else 'Robot' end||'! ¡Vamos, equipo!',jsonb_build_object('values',v_values,'target',v_metric.value),'goal:'||p_clinic_id||':'||v_period||':'||v_metric.key
   from public.memberships m where m.organization_id=p_organization_id and m.active and (m.clinic_id is null or m.clinic_id=p_clinic_id) on conflict do nothing;
  end if;
 end loop;
 v_hour:=date_bin(make_interval(mins=>coalesce((v_settings->>'hourly_frequency_minutes')::integer,60)),v_now,timestamptz '2000-01-01 00:00:00+00');select values into v_previous from public.objective_progress_snapshots where clinic_id=p_clinic_id and period=v_period and snapshot_hour<v_hour order by snapshot_hour desc limit 1;
 insert into public.objective_progress_snapshots(organization_id,clinic_id,period,snapshot_hour,values) values(p_organization_id,p_clinic_id,v_period,v_hour,v_values) on conflict(clinic_id,snapshot_hour) do update set values=excluded.values;
 if v_previous is not null
  and coalesce(v_settings->'opening_hours','{}'::jsonb) ? (extract(isodow from timezone('Europe/Madrid',v_now))::integer)::text
  and timezone('Europe/Madrid',v_now)::time between (v_settings->'opening_hours'->(extract(isodow from timezone('Europe/Madrid',v_now))::integer)::text->>0)::time and (v_settings->'opening_hours'->(extract(isodow from timezone('Europe/Madrid',v_now))::integer)::text->>1)::time
  and exists(select 1 from jsonb_each_text(v_values) n left join jsonb_each_text(v_previous) p using(key) where n.value::numeric>coalesce(p.value::numeric,0)) then
  v_summary:='🚀 Avance de Murcia: '||(select string_agg(case n.key when 'revenue' then 'Facturación '||round(n.value::numeric)||' €' when 'mbst_sessions' then 'MBST '||n.value when 'bomba_sessions' then 'Bomba '||n.value when 'brains_sessions' then 'Brains '||n.value else 'Robot '||n.value end,' · ') from jsonb_each_text(v_values) n left join jsonb_each_text(v_previous) p using(key) where n.value::numeric>coalesce(p.value::numeric,0));
  insert into public.objective_notifications(organization_id,clinic_id,recipient_user_id,kind,period,title,body,payload,dedupe_key)
  select p_organization_id,p_clinic_id,m.user_id,'hourly_progress',v_period,'¡Seguimos avanzando!',v_summary,jsonb_build_object('values',v_values),'hour:'||p_clinic_id||':'||v_hour from public.memberships m where m.organization_id=p_organization_id and m.active and (m.clinic_id is null or m.clinic_id=p_clinic_id) on conflict do nothing;
 end if;
 for v_budget in
  with accepted as (
   select b.*,p.first_name,p.last_name_1,
    coalesce((select sum(case when pay.payment_type='refund' then -abs(pay.amount) when pay.cancelled_at is not null then 0 else pay.amount end) from public.payments pay where pay.budget_id=b.id and pay.deleted_at is null and pay.status in ('completed','cancelled','refunded')),0) net_paid,
    nullif(b.metadata->>'budget_presenter_user_id','')::uuid presenter_id
   from public.budgets b join public.patients p on p.id=b.patient_id
   where b.organization_id=p_organization_id and b.clinic_id=p_clinic_id and b.deleted_at is null and b.status='accepted' and b.accepted_at is not null
  ), attributed as (
   select a.*,vp.user_id valuation_user_id,va.id valuation_appointment_id
   from accepted a
   join lateral (select (array_agg(candidate.user_id))[1] user_id from (select distinct pr.user_id from public.profiles pr join public.memberships m on m.user_id=pr.user_id and m.organization_id=p_organization_id and m.active and (m.clinic_id is null or m.clinic_id=p_clinic_id) where lower(trim(pr.full_name))=lower(trim(a.metadata->>'valuation_professional'))) candidate having count(*)=1) vp on true
   join lateral (select ap.id from public.appointments ap cross join lateral jsonb_array_elements_text(coalesce(ap.services,'[]'::jsonb)) service where ap.patient_id=a.patient_id and ap.clinic_id=p_clinic_id and ap.deleted_at is null and ap.status='completed' and ap.starts_at<=a.accepted_at and ap.starts_at>=a.accepted_at-interval '14 days' and (lower(service) like '%valoraci%' or lower(service) like '%1.%consulta%' or lower(service) like '%1ª%consulta%') order by ap.starts_at desc limit 1) va on true
   where a.presenter_id is not null and (coalesce((a.metadata->>'periodic_cash')::boolean,false) or a.net_paid>=a.total)
  ) select * from attributed
 loop
  insert into public.objective_notifications(organization_id,clinic_id,recipient_user_id,kind,period,title,body,payload,dedupe_key)
  select p_organization_id,p_clinic_id,recipient,'personal_sale',v_period,'¡Tratamiento cerrado!',
   '🎉 ¡Felicidades, '||coalesce((select full_name from public.profiles where user_id=recipient),'equipo')||'! '||trim(v_budget.first_name||' '||coalesce(v_budget.last_name_1,''))||case when coalesce((v_budget.metadata->>'periodic_cash')::boolean,false) then ' ha cerrado su tratamiento, que comenzará en breve. ¡Vamos, equipo!' else ' ha cerrado y pagado su tratamiento, que comenzará en breve. ¡Vamos, equipo!' end,
   jsonb_build_object('budget_id',v_budget.id,'valuation_appointment_id',v_budget.valuation_appointment_id),'sale:'||v_budget.id
  from (select distinct unnest(array[v_budget.valuation_user_id,v_budget.presenter_id]) recipient) recipients on conflict do nothing;
 end loop;
 return jsonb_build_object('period',v_period,'clinics',jsonb_build_array(
  jsonb_build_object('name','Murcia','live',true,'values',v_values,'targets',v_targets),
  jsonb_build_object('name','Alicante','live',false,'values',jsonb_build_object('revenue',0,'mbst_sessions',0,'bomba_sessions',0,'brains_sessions',0,'robot_traction_sessions',0),'targets',jsonb_build_object('revenue',65000,'mbst_sessions',250,'bomba_sessions',100,'brains_sessions',0,'robot_traction_sessions',110)),
  jsonb_build_object('name','Barcelona','live',false,'values',jsonb_build_object('revenue',0,'mbst_sessions',0,'bomba_sessions',0,'brains_sessions',0,'robot_traction_sessions',0),'targets',jsonb_build_object('revenue',0,'mbst_sessions',0,'bomba_sessions',0,'brains_sessions',0,'robot_traction_sessions',0))
 ),'settings',v_settings,'notifications',(select coalesce(jsonb_agg(n order by n.created_at),'[]'::jsonb) from public.objective_notifications n where n.recipient_user_id=(select auth.uid()) and n.acknowledged_at is null));
end $$;
revoke all on function public.atlas_objectives_snapshot(uuid,uuid,date) from public,anon;grant execute on function public.atlas_objectives_snapshot(uuid,uuid,date) to authenticated;

create or replace function public.atlas_objectives_acknowledge(p_notification_id uuid) returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare v_at timestamptz:=now();begin update public.objective_notifications set acknowledged_at=v_at where id=p_notification_id and recipient_user_id=(select auth.uid()) and acknowledged_at is null;if not found then raise exception 'Aviso no disponible';end if;return v_at;end $$;
revoke all on function public.atlas_objectives_acknowledge(uuid) from public,anon;grant execute on function public.atlas_objectives_acknowledge(uuid) to authenticated;

create or replace function public.atlas_objectives_save_targets(p_organization_id uuid,p_clinic_id uuid,p_period date,p_targets jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_metric text;begin if not public.atlas_objectives_is_management(p_organization_id,p_clinic_id) then raise exception 'Acceso reservado a Dirección y Gestión';end if;if p_period<>date_trunc('month',p_period)::date then raise exception 'Mes no válido';end if;foreach v_metric in array array['revenue','mbst_sessions','bomba_sessions','brains_sessions','robot_traction_sessions'] loop insert into public.management_targets(organization_id,clinic_id,period,metric,target_value,created_by,updated_by) values(p_organization_id,p_clinic_id,p_period,v_metric,greatest(0,coalesce((p_targets->>v_metric)::numeric,0)),(select auth.uid()),(select auth.uid())) on conflict(clinic_id,period,metric) do update set target_value=excluded.target_value,updated_by=(select auth.uid()),updated_at=now();end loop;return true;end $$;
revoke all on function public.atlas_objectives_save_targets(uuid,uuid,date,jsonb) from public,anon;grant execute on function public.atlas_objectives_save_targets(uuid,uuid,date,jsonb) to authenticated;

create or replace function public.atlas_objectives_previous_targets(p_organization_id uuid,p_clinic_id uuid,p_period date) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.atlas_objectives_is_management(p_organization_id,p_clinic_id) then coalesce((select jsonb_object_agg(metric,target_value) from public.management_targets where organization_id=p_organization_id and clinic_id=p_clinic_id and period=(p_period-interval '1 month')::date and metric in ('revenue','mbst_sessions','bomba_sessions','brains_sessions','robot_traction_sessions')),'{}'::jsonb) else '{}'::jsonb end
$$;
revoke all on function public.atlas_objectives_previous_targets(uuid,uuid,date) from public,anon;grant execute on function public.atlas_objectives_previous_targets(uuid,uuid,date) to authenticated;

create or replace function public.atlas_objectives_save_settings(p_organization_id uuid,p_clinic_id uuid,p_sound_key text,p_hourly_frequency_minutes integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin if not public.atlas_objectives_is_management(p_organization_id,p_clinic_id) then raise exception 'Acceso reservado a Dirección y Gestión';end if;if p_sound_key not in ('caja-wow','none') then raise exception 'Sonido no válido';end if;if p_hourly_frequency_minutes not in (60,120,180) then raise exception 'Frecuencia no válida';end if;insert into public.objective_settings(organization_id,clinic_id,sound_key,hourly_frequency_minutes,updated_by) values(p_organization_id,p_clinic_id,p_sound_key,p_hourly_frequency_minutes,(select auth.uid())) on conflict(clinic_id) do update set sound_key=excluded.sound_key,hourly_frequency_minutes=excluded.hourly_frequency_minutes,updated_by=(select auth.uid()),updated_at=now();return true;end $$;
revoke all on function public.atlas_objectives_save_settings(uuid,uuid,text,integer) from public,anon;grant execute on function public.atlas_objectives_save_settings(uuid,uuid,text,integer) to authenticated;

insert into public.management_targets(organization_id,clinic_id,period,metric,target_value,notes)
select c.organization_id,c.id,date '2026-11-01',x.metric,x.target,'Objetivos confirmados por Dirección para noviembre de 2026'
from public.clinics c cross join (values ('revenue',150000::numeric),('robot_traction_sessions',210),('mbst_sessions',340),('bomba_sessions',320),('brains_sessions',180)) x(metric,target)
where c.active and (lower(trim(c.name))='murcia' or lower(trim(c.city))='murcia')
on conflict(clinic_id,period,metric) do nothing;

commit;
