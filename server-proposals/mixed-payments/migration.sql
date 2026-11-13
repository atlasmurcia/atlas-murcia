-- Propuesta para ATLAS Murcia. No ejecutar directamente en producción.
-- Debe validarse primero en una base de pruebas con la misma versión del esquema.

create or replace function public.atlas_validate_mixed_payment_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_breakdown text := current_setting('atlas.mixed_payment_breakdown', true);
  v_breakdown jsonb;
  v_normalized jsonb;
  v_count integer;
  v_distinct integer;
  v_sum numeric(12,2);
begin
  if coalesce(v_session_breakdown, '') <> '' then
    begin
      v_breakdown := v_session_breakdown::jsonb;
    exception when others then
      raise exception 'El desglose del pago mixto no es válido.';
    end;
    new.method := 'mixed';
  elsif new.method = 'mixed' then
    v_breakdown := new.metadata->'payment_method_breakdown';
  else
    if jsonb_typeof(new.metadata->'payment_method_breakdown') = 'array'
       and jsonb_array_length(new.metadata->'payment_method_breakdown') > 0 then
      raise exception 'El desglose mixto requiere la forma de pago Pago mixto.';
    end if;
    return new;
  end if;

  if jsonb_typeof(v_breakdown) <> 'array' or jsonb_array_length(v_breakdown) <> 2 then
    raise exception 'El pago mixto requiere exactamente dos métodos e importes.';
  end if;

  begin
    select count(*), count(distinct item->>'method'), round(sum((item->>'amount')::numeric), 2),
           jsonb_agg(
             jsonb_build_object('method', item->>'method', 'amount', round((item->>'amount')::numeric, 2))
             order by case item->>'method'
               when 'cash' then 1 when 'card' then 2 when 'transfer' then 3
               when 'bizum' then 4 when 'financing' then 5 when 'other' then 6 else 99 end
           )
      into v_count, v_distinct, v_sum, v_normalized
    from jsonb_array_elements(v_breakdown) item
    where item->>'method' in ('cash','card','transfer','bizum','financing','other')
      and jsonb_typeof(item->'amount') in ('number','string')
      and (item->>'amount')::numeric > 0
      and round((item->>'amount')::numeric, 2) = (item->>'amount')::numeric;
  exception when others then
    raise exception 'Los importes del pago mixto deben ser positivos y tener un máximo de dos decimales.';
  end;

  if v_count <> 2 or v_distinct <> 2 then
    raise exception 'Selecciona dos métodos de pago diferentes con importes positivos.';
  end if;
  if abs(v_sum - round(new.amount, 2)) > 0.001 then
    raise exception 'La suma de los dos métodos debe coincidir exactamente con el total a cobrar.';
  end if;

  new.metadata := jsonb_set(
    jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{payment_method_label}', '"Pago mixto"'::jsonb, true),
    '{payment_method_breakdown}', v_normalized, true
  );
  return new;
end;
$$;

revoke all on function public.atlas_validate_mixed_payment_write() from public, anon, authenticated;

drop trigger if exists atlas_validate_mixed_payment_before_write on public.payments;
create trigger atlas_validate_mixed_payment_before_write
before insert or update of amount, method, metadata on public.payments
for each row execute function public.atlas_validate_mixed_payment_write();

create or replace function public.atlas_create_patient_sale_mixed(
  p_organization_id uuid,
  p_clinic_id uuid,
  p_patient_id uuid,
  p_client_ref text,
  p_method text,
  p_lines jsonb,
  p_discount_amount numeric default 0,
  p_discount_type text default 'discount',
  p_discount_reason text default null,
  p_notes text default null,
  p_payment_date date default null,
  p_breakdown jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_normalized jsonb;
  v_count integer;
  v_distinct integer;
  v_sum numeric(12,2);
  v_result jsonb;
begin
  if p_method <> 'mixed' then
    raise exception 'Esta operación solo admite la forma de pago Pago mixto.';
  end if;
  if jsonb_typeof(p_breakdown) <> 'array' or jsonb_array_length(p_breakdown) <> 2 then
    raise exception 'El pago mixto requiere exactamente dos métodos e importes.';
  end if;

  begin
    select count(*), count(distinct item->>'method'), round(sum((item->>'amount')::numeric), 2),
           jsonb_agg(
             jsonb_build_object('method', item->>'method', 'amount', round((item->>'amount')::numeric, 2))
             order by case item->>'method'
               when 'cash' then 1 when 'card' then 2 when 'transfer' then 3
               when 'bizum' then 4 when 'financing' then 5 when 'other' then 6 else 99 end
           )
      into v_count, v_distinct, v_sum, v_normalized
    from jsonb_array_elements(p_breakdown) item
    where item->>'method' in ('cash','card','transfer','bizum','financing','other')
      and jsonb_typeof(item->'amount') in ('number','string')
      and (item->>'amount')::numeric > 0
      and round((item->>'amount')::numeric, 2) = (item->>'amount')::numeric;
  exception when others then
    raise exception 'Los importes del pago mixto deben ser positivos y tener un máximo de dos decimales.';
  end;
  if v_count <> 2 or v_distinct <> 2 then
    raise exception 'Selecciona dos métodos de pago diferentes con importes positivos.';
  end if;

  perform set_config('atlas.mixed_payment_breakdown', v_normalized::text, true);
  begin
    v_result := public.atlas_create_patient_sale_v4(
      p_organization_id, p_clinic_id, p_patient_id, p_client_ref, 'cash', p_lines,
      p_discount_amount, p_discount_type, p_discount_reason, p_notes, p_payment_date
    );
  exception when others then
    perform set_config('atlas.mixed_payment_breakdown', '', true);
    raise;
  end;
  perform set_config('atlas.mixed_payment_breakdown', '', true);

  if abs(coalesce((v_result->>'amount')::numeric, 0) - v_sum) > 0.001 then
    raise exception 'La suma del pago mixto no coincide con el total calculado de la venta.';
  end if;
  if v_result->'metadata'->'payment_method_breakdown' is distinct from v_normalized then
    raise exception 'La referencia de venta ya pertenece a otro desglose de pago.';
  end if;
  return v_result;
end;
$$;

revoke all on function public.atlas_create_patient_sale_mixed(uuid,uuid,uuid,text,text,jsonb,numeric,text,text,text,date,jsonb) from public, anon;
grant execute on function public.atlas_create_patient_sale_mixed(uuid,uuid,uuid,text,text,jsonb,numeric,text,text,text,date,jsonb) to authenticated;
