-- ATLAS Murcia: separar fecha del cobro y fecha de expedición.
-- Esta propuesta conserva intacta la lógica fiscal restante de la función.
-- Requiere revisión y aplicación explícita en el proyecto Supabase de Murcia.

do $atlas_budget_payment_date$
declare
  v_routine regprocedure := to_regprocedure(
    'public.atlas_issue_sales_invoice(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,numeric,text)'
  );
  v_definition text;
  v_old text := 'target_date := (pay.paid_at at time zone ''Europe/Madrid'')::date;';
  v_new text := 'target_date := (now() at time zone ''Europe/Madrid'')::date;';
  v_matches integer;
begin
  if v_routine is null then
    raise exception 'No se encontró public.atlas_issue_sales_invoice con la firma esperada';
  end if;

  select pg_get_functiondef(v_routine) into v_definition;
  v_matches := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);

  if v_matches <> 1 then
    raise exception 'Se esperaba una asignación exacta de target_date; se encontraron %', v_matches;
  end if;

  execute replace(v_definition, v_old, v_new);
end;
$atlas_budget_payment_date$;
