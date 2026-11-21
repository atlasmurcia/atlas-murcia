begin;

do $$
declare
  v_org uuid;
  v_clinic uuid;
  v_token text:='synthetic-token-012345678901234567890123456789';
  v_period date:=date_trunc('month',timezone('Europe/Madrid',now()))::date;
  v_id uuid;
begin
  select organization_id,clinic_id into v_org,v_clinic
  from public.objective_external_snapshots
  where source_clinic='Alicante'
  order by received_at desc limit 1;
  if v_org is null then raise exception 'Falta el destino sintético';end if;

  insert into atlas_private.objective_sync_sources(source_clinic,target_organization_id,target_clinic_id,token_hash)
  values('Alicante',v_org,v_clinic,extensions.crypt(v_token,extensions.gen_salt('bf',6)))
  on conflict(source_clinic) do update set token_hash=excluded.token_hash,active=true;

  v_id:=public.atlas_objectives_receive_external_snapshot(
    v_token,'Alicante',v_period,now(),12345,12,13,14,15,65000,250,100,110,0
  );
  if v_id is null then raise exception 'No se guardó el resumen';end if;

  begin
    perform public.atlas_objectives_receive_external_snapshot(
      'synthetic-token-wrong-012345678901234567890','Alicante',v_period,now(),1,1,1,1,1,1,1,1,1,1
    );
    raise exception 'Se aceptó una clave incorrecta';
  exception when others then
    if sqlerrm='Se aceptó una clave incorrecta' then raise;end if;
  end;
end
$$;

rollback;
