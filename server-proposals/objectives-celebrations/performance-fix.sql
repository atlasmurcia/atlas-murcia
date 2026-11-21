-- ATLAS Murcia · ajuste de rendimiento posterior a migration.sql
-- Sustituye únicamente el cálculo del panel. No modifica datos clínicos ni cobros.

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
revoke all on function public.atlas_audit_objective_target() from public,anon,authenticated;
