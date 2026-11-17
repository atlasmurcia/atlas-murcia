-- SOLO PARA POSTGRESQL LOCAL VACÍO. NO APLICAR A SUPABASE.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.memberships(user_id uuid,organization_id uuid,clinic_id uuid,active boolean,permissions jsonb);
CREATE TABLE public.patients(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_number text NOT NULL,first_name text,last_name_1 text,last_name_2 text,
 phone text,email text,administrative_notes text,historical_income numeric DEFAULT 0,
 active boolean NOT NULL DEFAULT true,deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT '2026-01-01',updated_at timestamptz NOT NULL DEFAULT '2026-01-01'
);
CREATE TABLE public.appointments(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid NOT NULL REFERENCES public.patients(id),starts_at timestamptz NOT NULL,
 professional_id uuid,status text,client_ref text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT '2026-01-01',updated_at timestamptz NOT NULL DEFAULT '2026-01-01'
);
CREATE TABLE public.budgets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),client_ref text,name text,status text,
 discount numeric DEFAULT 0,total numeric NOT NULL,payment_terms jsonb DEFAULT '{}'::jsonb,
 accepted_at timestamptz,budget_number text DEFAULT 'SYNTHETIC',created_by uuid,
 metadata jsonb DEFAULT '{}'::jsonb,deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT '2026-01-01',updated_at timestamptz NOT NULL DEFAULT '2026-01-01'
);
CREATE UNIQUE INDEX budgets_clinic_client_ref ON public.budgets(clinic_id,client_ref) WHERE client_ref IS NOT NULL;
CREATE TABLE public.budget_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,budget_id uuid NOT NULL REFERENCES public.budgets(id),
 service_code text,service_name text NOT NULL,sessions integer NOT NULL,unit_price numeric NOT NULL,
 discount numeric NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),
 line_order integer NOT NULL DEFAULT 0,metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.treatment_plans(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),budget_id uuid REFERENCES public.budgets(id),planned_sessions int
);
CREATE TABLE public.payments(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),budget_id uuid REFERENCES public.budgets(id),
 appointment_id uuid REFERENCES public.appointments(id),payment_type text,amount numeric NOT NULL,
 method text,status text,external_reference text,notes text,paid_at timestamptz,
 created_by uuid,client_ref text,metadata jsonb DEFAULT '{}'::jsonb,cancellation_reason text,
 cancelled_at timestamptz,receipt_number text UNIQUE,deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT '2026-01-01',updated_at timestamptz NOT NULL DEFAULT '2026-01-01'
);
CREATE TABLE public.sales_invoices(
 id uuid PRIMARY KEY,payment_id uuid REFERENCES public.payments(id),invoice_number text UNIQUE,issued_at timestamptz,fiscal_content jsonb
);
CREATE TABLE public.documents(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),storage_path text,metadata jsonb
);
CREATE TABLE public.consents(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),signed_at timestamptz,patient_signature_path text,document_snapshot text
);
CREATE TABLE public.clinical_records(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),professional_id uuid,occurred_at timestamptz,content jsonb
);
CREATE TABLE public.patient_communications(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),channel text,body text,occurred_at timestamptz
);
CREATE TABLE public.patient_debts(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),amount_remaining numeric
);
CREATE TABLE public.atlas_internal_tasks(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),description text
);
CREATE TABLE public.appointment_reminder_jobs(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),appointment_id uuid REFERENCES public.appointments(id)
);
CREATE TABLE public.document_email_jobs(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid,kind text
);
CREATE TABLE public.inventory_movements(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),movement_type text
);
CREATE TABLE public.leads(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),phone text
);
CREATE TABLE public.patient_experience_surveys(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),appointment_id uuid REFERENCES public.appointments(id)
);
CREATE TABLE public.patient_reactivation_tasks(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),appointment_id uuid REFERENCES public.appointments(id)
);
CREATE TABLE public.quality_cases(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),case_ref text
);
CREATE TABLE public.treasury_receivables(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),amount numeric
);
CREATE TABLE public.whatsapp_conversations(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),contact_phone text
);
CREATE TABLE public.whatsapp_messages(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),conversation_id uuid REFERENCES public.whatsapp_conversations(id)
);
CREATE FUNCTION public.has_permission(p_organization_id uuid,p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.memberships m WHERE m.user_id=auth.uid()
   AND m.organization_id=p_organization_id AND m.active AND coalesce((m.permissions->>p_permission)::boolean,false))
$$;
CREATE FUNCTION public.has_clinic_permission(p_organization_id uuid,p_clinic_id uuid,p_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.memberships m WHERE m.user_id=auth.uid()
   AND m.organization_id=p_organization_id AND (m.clinic_id=p_clinic_id OR m.clinic_id IS NULL)
   AND m.active AND coalesce((m.permissions->>p_permission)::boolean,false))
$$;
CREATE FUNCTION private.atlas_replace_budget_lines(p_budget_id uuid,p_lines jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp' AS $$
DECLARE v_org uuid;v_user uuid:=auth.uid();item jsonb;v_order integer:=0;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada'; END IF;
 SELECT organization_id INTO v_org FROM public.budgets WHERE id=p_budget_id AND deleted_at IS NULL;
 IF v_org IS NULL THEN RAISE EXCEPTION 'Presupuesto no encontrado'; END IF;
 IF NOT public.has_permission(v_org,'budgets_write') THEN RAISE EXCEPTION 'Sin permiso para modificar presupuestos'; END IF;
 IF jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Las líneas del presupuesto deben ser una lista'; END IF;
 DELETE FROM public.budget_lines WHERE budget_id=p_budget_id;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) LOOP
  v_order:=v_order+1;
  INSERT INTO public.budget_lines(organization_id,budget_id,service_code,service_name,sessions,unit_price,discount,line_order,metadata)
  VALUES(v_org,p_budget_id,nullif(item->>'service_code',''),coalesce(nullif(btrim(item->>'service_name'),''),'Tratamiento'),
    greatest(1,coalesce((item->>'sessions')::integer,1)),greatest(0,coalesce((item->>'unit_price')::numeric,0)),
    greatest(0,least(100,coalesce((item->>'discount')::numeric,0))),v_order,coalesce(item->'metadata','{}'::jsonb));
 END LOOP;
 RETURN v_order;
END $$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.atlas_replace_budget_lines(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_clinic_permission(uuid,uuid,text) TO authenticated;
GRANT SELECT ON public.patients TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.budgets TO authenticated;
GRANT SELECT ON public.budget_lines TO authenticated;
CREATE POLICY patients_synthetic_read ON public.patients FOR SELECT TO authenticated
 USING(public.has_clinic_permission(organization_id,clinic_id,'patients_read'));
CREATE POLICY budgets_synthetic_read ON public.budgets FOR SELECT TO authenticated
 USING(public.has_clinic_permission(organization_id,clinic_id,'budgets_read'));
CREATE POLICY budgets_synthetic_write ON public.budgets FOR ALL TO authenticated
 USING(public.has_clinic_permission(organization_id,clinic_id,'budgets_write'))
 WITH CHECK(public.has_clinic_permission(organization_id,clinic_id,'budgets_write'));
CREATE POLICY budget_lines_synthetic_access ON public.budget_lines FOR ALL TO authenticated
 USING(public.has_permission(organization_id,'budgets_read'))
 WITH CHECK(public.has_permission(organization_id,'budgets_write'));
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_internal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_experience_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_reactivation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
-- Los datos y las certificaciones de prueba se insertan en backend.test.cjs.
