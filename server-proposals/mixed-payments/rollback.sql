-- Reversión exclusiva de la migración de pago mixto de Murcia.
-- No modifica ni elimina cobros, justificantes o facturas existentes.

drop trigger if exists atlas_validate_mixed_payment_before_write on public.payments;

drop function if exists public.atlas_create_patient_sale_mixed(
  uuid, uuid, uuid, text, text, jsonb, numeric, text, text, text, date, jsonb
);

drop function if exists public.atlas_validate_mixed_payment_write();
