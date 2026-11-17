-- SOLO PARA POSTGRESQL LOCAL VACÍO. NO APLICAR A SUPABASE.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.memberships(user_id uuid,organization_id uuid,clinic_id uuid,active boolean,permissions jsonb);
CREATE TABLE public.patients(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
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
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),amount numeric NOT NULL,client_ref text UNIQUE
);
CREATE TABLE public.treatment_plans(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),budget_id uuid REFERENCES public.budgets(id),planned_sessions int
);
CREATE TABLE public.payments(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
 patient_id uuid REFERENCES public.patients(id),appointment_id uuid REFERENCES public.appointments(id),
 amount numeric NOT NULL,paid_at timestamptz,receipt_number text UNIQUE
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
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
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
