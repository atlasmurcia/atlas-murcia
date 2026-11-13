-- Ejecutar solo en una base de pruebas y con UUID ficticios válidos del entorno.
-- La transacción siempre se revierte.
begin;

select to_regprocedure('public.atlas_validate_mixed_payment_write()') is not null as trigger_function_must_exist;

select has_function_privilege('anon', 'public.atlas_create_patient_sale_mixed(uuid,uuid,uuid,text,text,jsonb,numeric,text,text,text,date,jsonb)', 'EXECUTE') as anon_must_be_false,
       has_function_privilege('authenticated', 'public.atlas_create_patient_sale_mixed(uuid,uuid,uuid,text,text,jsonb,numeric,text,text,text,date,jsonb)', 'EXECUTE') as authenticated_must_be_true;

create temporary table mixed_payment_contract (
  amount numeric not null,
  method text not null,
  metadata jsonb not null default '{}'::jsonb
) on commit drop;

create trigger validate_mixed_payment_contract
before insert or update of amount, method, metadata on mixed_payment_contract
for each row execute function public.atlas_validate_mixed_payment_write();

create or replace function pg_temp.expect_mixed_failure(
  p_amount numeric,
  p_method text,
  p_metadata jsonb
) returns void language plpgsql as $$
declare
  v_failed boolean := false;
begin
  begin
    insert into mixed_payment_contract(amount, method, metadata)
    values (p_amount, p_method, p_metadata);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'La escritura debía haberse rechazado: %, %, %', p_amount, p_method, p_metadata;
  end if;
end;
$$;

insert into mixed_payment_contract(amount, method, metadata)
values (100, 'mixed', '{"payment_method_breakdown":[{"method":"cash","amount":30},{"method":"card","amount":70}]}'::jsonb);

do $$
declare
  v_row mixed_payment_contract%rowtype;
begin
  select * into strict v_row from mixed_payment_contract;
  if v_row.method <> 'mixed'
     or v_row.metadata->>'payment_method_label' <> 'Pago mixto'
     or v_row.metadata->'payment_method_breakdown' <> '[{"method":"cash","amount":30},{"method":"card","amount":70}]'::jsonb then
    raise exception 'El pago mixto válido no se normalizó correctamente: %', row_to_json(v_row);
  end if;
end;
$$;

select pg_temp.expect_mixed_failure(100, 'mixed', '{"payment_method_breakdown":[{"method":"cash","amount":30},{"method":"cash","amount":70}]}'::jsonb);
select pg_temp.expect_mixed_failure(100, 'mixed', '{"payment_method_breakdown":[{"method":"cash","amount":0},{"method":"card","amount":100}]}'::jsonb);
select pg_temp.expect_mixed_failure(100, 'mixed', '{"payment_method_breakdown":[{"method":"cash","amount":30.001},{"method":"card","amount":69.999}]}'::jsonb);
select pg_temp.expect_mixed_failure(100, 'mixed', '{"payment_method_breakdown":[{"method":"cash","amount":30},{"method":"card","amount":69.99}]}'::jsonb);
select pg_temp.expect_mixed_failure(100, 'cash', '{"payment_method_breakdown":[{"method":"cash","amount":30},{"method":"card","amount":70}]}'::jsonb);

select set_config('atlas.mixed_payment_breakdown', '[{"method":"cash","amount":20},{"method":"transfer","amount":80}]', true);
insert into mixed_payment_contract(amount, method, metadata) values (100, 'cash', '{}'::jsonb);
select set_config('atlas.mixed_payment_breakdown', '', true);

do $$
begin
  if not exists (
    select 1 from mixed_payment_contract
    where method='mixed'
      and metadata->'payment_method_breakdown'='[{"method":"cash","amount":20},{"method":"transfer","amount":80}]'::jsonb
  ) then
    raise exception 'La venta directa no trasladó el desglose al pago antes de facturar.';
  end if;
end;
$$;

-- Los siguientes casos necesitan paciente, catálogo y usuario ficticios del entorno:
-- 100,00 = 30,00 cash + 70,00 card -> debe crear un único pago y una única factura.
-- 100,00 = 20,00 cash + 80,00 transfer -> debe crear un único pago y una única factura.
-- Repetir p_client_ref con el mismo reparto -> debe devolver el mismo pago.
-- Repetir p_client_ref con otro reparto -> debe fallar sin cambiar el registro.
-- Error de stock o desglose -> debe revertir pago, stock y factura.

rollback;
