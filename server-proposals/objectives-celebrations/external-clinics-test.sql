begin;

select public.atlas_objectives_upsert_external_snapshot(
  (select id from public.organizations limit 1),
  (select id from public.clinics limit 1),
  'Alicante',date '2026-11-01',timestamptz '2026-11-21 13:00:00+01',
  54981.50,147,52,88,0,
  65000,250,100,110,0
);

do $$
declare v_row record;
begin
  select * into v_row from public.objective_external_snapshots where source_clinic='Alicante' and period=date '2026-11-01';
  if v_row.values->>'revenue'<>'54981.50' or v_row.values->>'mbst_sessions'<>'147' then raise exception 'Resumen externo incorrecto';end if;
  if v_row.targets->>'robot_traction_sessions'<>'110' then raise exception 'Meta comparable incorrecta';end if;
end $$;

rollback;
