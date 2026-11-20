CREATE OR REPLACE FUNCTION public.atlas_murcia_reject_holiday_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  agenda jsonb;
  holiday_date date;
  holiday_name text;
BEGIN
  IF NEW.organization_id IS DISTINCT FROM '4908e607-19bd-4139-a4b4-646c585f0cbf'::uuid
     OR NEW.clinic_id IS DISTINCT FROM '0b741520-b7dc-48a2-9f79-3ef6b74258d4'::uuid THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.starts_at IS NOT DISTINCT FROM OLD.starts_at
       AND NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at
       AND NEW.clinic_id IS NOT DISTINCT FROM OLD.clinic_id
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND OLD.deleted_at IS NULL AND OLD.status <> 'cancelled' THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.starts_at IS NULL OR NEW.ends_at IS NULL OR NEW.ends_at <= NEW.starts_at THEN RETURN NEW; END IF;
  SELECT s.payload INTO agenda FROM public.clinic_settings s
    WHERE s.organization_id = NEW.organization_id AND s.clinic_id = NEW.clinic_id AND s.section = 'agenda';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No se pudo comprobar el calendario de cierres de FisioSport Murcia.';
  END IF;
  SELECT (h.value->>'date')::date, coalesce(nullif(h.value->>'name',''),'Festivo')
    INTO holiday_date, holiday_name
    FROM jsonb_array_elements(coalesce(agenda->'holidays','[]'::jsonb)) h(value)
    WHERE h.value->>'date' ~ '^2027-[0-9]{2}-[0-9]{2}$'
      AND NEW.starts_at < (((h.value->>'date')::date + 1)::timestamp AT TIME ZONE 'Europe/Madrid')
      AND NEW.ends_at > ((h.value->>'date')::date::timestamp AT TIME ZONE 'Europe/Madrid')
    ORDER BY h.value->>'date' LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('Festivo / Clínica cerrada: FisioSport Murcia permanece cerrada el %s (%s). No se permiten reservas ni asignaciones de citas.',to_char(holiday_date,'DD/MM/YYYY'),holiday_name);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER atlas_murcia_holiday_booking_guard
BEFORE INSERT OR UPDATE OF starts_at, ends_at, organization_id, clinic_id, status, deleted_at
ON public.appointments FOR EACH ROW
WHEN (NEW.organization_id = '4908e607-19bd-4139-a4b4-646c585f0cbf'::uuid
  AND NEW.clinic_id = '0b741520-b7dc-48a2-9f79-3ef6b74258d4'::uuid)
EXECUTE FUNCTION public.atlas_murcia_reject_holiday_booking();
