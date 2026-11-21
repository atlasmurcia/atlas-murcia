begin;
do $$
declare v_org uuid;v_clinic uuid;v_period date:=date_trunc('month',timezone('Europe/Madrid',now()))::date;v_values jsonb;v_targets jsonb;
begin
 select c.organization_id,c.id into v_org,v_clinic from public.clinics c where c.active and (lower(trim(c.name))='murcia' or lower(trim(c.city))='murcia') order by c.created_at limit 1;
 v_values:=public.atlas_objectives_calculate(v_org,v_clinic,v_period);
 select coalesce(jsonb_object_agg(metric,target_value),'{}'::jsonb) into v_targets from public.management_targets where organization_id=v_org and clinic_id=v_clinic and period=v_period;
 if not (v_values ?& array['revenue','mbst_sessions','bomba_sessions','brains_sessions','robot_traction_sessions']) then raise exception 'Faltan valores';end if;
 if not (v_targets ?& array['revenue','mbst_sessions','bomba_sessions','brains_sessions','robot_traction_sessions']) then raise exception 'Faltan metas';end if;
end $$;
rollback;
