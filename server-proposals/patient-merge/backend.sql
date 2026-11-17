-- CANDIDATO NO APLICADO A NINGÚN PROYECTO. Revisar contra el esquema completo.
-- Requiere patients(id,organization_id,clinic_id,patient_number,active,deleted_at)
-- y memberships(user_id,organization_id,clinic_id,active,permissions).
-- Deshabilitado por defecto: la certificación de cobertura no se puede hacer desde el cliente.
BEGIN;
CREATE SCHEMA atlas_merge_private;
REVOKE ALL ON SCHEMA atlas_merge_private FROM PUBLIC;

CREATE TABLE atlas_merge_private.relations(
  relation regclass PRIMARY KEY, patient_column name NOT NULL DEFAULT 'patient_id',
  pk_column name NOT NULL DEFAULT 'id', label text NOT NULL,
  CHECK (relation <> 'public.patients'::regclass)
);
CREATE TABLE atlas_merge_private.configuration(
  organization_id uuid NOT NULL, clinic_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT false,
  schema_signature text, coverage_review text, reviewed_by uuid,
  PRIMARY KEY(organization_id,clinic_id)
);
CREATE TABLE atlas_merge_private.previews(
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor uuid NOT NULL,
  organization_id uuid NOT NULL, clinic_id uuid NOT NULL,
  primary_id uuid NOT NULL, secondary_id uuid NOT NULL,
  snapshot jsonb NOT NULL, review jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes'
);
CREATE TABLE atlas_merge_private.operations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor uuid NOT NULL,
  organization_id uuid NOT NULL,clinic_id uuid NOT NULL,
  primary_id uuid NOT NULL,secondary_id uuid NOT NULL,
  request_key text NOT NULL,request_body jsonb NOT NULL,
  before_state jsonb NOT NULL,after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reverted_at timestamptz,reverted_by uuid,revert_reason text,
  UNIQUE(organization_id,clinic_id,actor,request_key)
);
CREATE TABLE atlas_merge_private.links(
  secondary_id uuid PRIMARY KEY REFERENCES public.patients(id),
  primary_id uuid NOT NULL REFERENCES public.patients(id),
  operation_id uuid NOT NULL UNIQUE REFERENCES atlas_merge_private.operations(id),
  CHECK(secondary_id<>primary_id)
);
CREATE INDEX atlas_merge_links_primary ON atlas_merge_private.links(primary_id);
ALTER TABLE atlas_merge_private.relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_merge_private.configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_merge_private.previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_merge_private.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_merge_private.links ENABLE ROW LEVEL SECURITY;

-- Cada trabajador privilegiado queda en un esquema no expuesto y se autoriza dentro.
CREATE FUNCTION atlas_merge_private.authorize(o uuid,c uuid,need_merge boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid();
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'No tienes permiso para esta operación.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.memberships m
    WHERE m.user_id=u AND m.organization_id=o AND (m.clinic_id=c OR m.clinic_id IS NULL)
      AND m.active AND (NOT need_merge OR m.permissions->>'patient_merge'='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No tienes permiso para esta operación.' USING ERRCODE='42501'; END IF;
  RETURN u;
END $$;

CREATE FUNCTION atlas_merge_private.schema_signature() RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT md5(coalesce(string_agg(x,'|' ORDER BY x),'')) FROM (
  SELECT concat('c:',a.attrelid::regclass,':',a.attname,':',a.atttypid,':',a.attnotnull,':',a.attgenerated) x
  FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT concat('k:',c.conrelid::regclass,':',pg_catalog.pg_get_constraintdef(c.oid))
  FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
  UNION ALL SELECT concat('t:',t.tgrelid::regclass,':',t.tgenabled,':',pg_catalog.pg_get_triggerdef(t.oid))
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
  UNION ALL SELECT concat('i:',schemaname,':',indexdef) FROM pg_catalog.pg_indexes WHERE schemaname='public'
  UNION ALL SELECT concat('p:',tablename,':',policyname,':',roles,':',cmd,':',qual,':',with_check)
   FROM pg_catalog.pg_policies WHERE schemaname='public'
  UNION ALL SELECT concat('r:',relation,':',patient_column,':',pk_column,':',label) FROM atlas_merge_private.relations
  UNION ALL SELECT concat('f:',pg_catalog.pg_get_functiondef(p.oid)) FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','atlas_merge_private') AND p.prokind IN ('f','p')
  UNION ALL SELECT concat('d:',adrelid::regclass,':',adnum,':',pg_catalog.pg_get_expr(adbin,adrelid))
    FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_class c ON c.oid=d.adrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  UNION ALL SELECT concat('s:',c.oid::regclass,':',c.relrowsecurity,':',c.relforcerowsecurity)
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 ) s
$$;

CREATE FUNCTION atlas_merge_private.ready(o uuid,c uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE guard_row record; missing text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM atlas_merge_private.configuration cfg WHERE cfg.organization_id=o
   AND cfg.clinic_id=c AND cfg.enabled AND cfg.reviewed_by IS NOT NULL
   AND length(cfg.coverage_review)>20 AND cfg.schema_signature=atlas_merge_private.schema_signature())
 THEN RAISE EXCEPTION 'La cobertura del esquema no está validada. Fusión deshabilitada.'; END IF;
 -- No ignorar FKs hacia patients aunque no se llamen patient_id.
 SELECT string_agg(con.conrelid::regclass::text,', ') INTO missing
 FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class cl ON cl.oid=con.conrelid
 JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
 WHERE con.contype='f' AND con.confrelid='public.patients'::regclass AND ns.nspname<>'atlas_merge_private'
 AND NOT EXISTS(SELECT 1 FROM atlas_merge_private.relations r
   JOIN pg_catalog.pg_attribute a ON a.attrelid=r.relation AND a.attname=r.patient_column
   WHERE r.relation=con.conrelid AND con.conkey=ARRAY[a.attnum]);
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'Relaciones pendientes de revisión: %',missing; END IF;
 -- Un nombre sugerente sin FK también requiere registro; no lo damos por cubierto.
 SELECT string_agg(format('%s.%I',a.attrelid::regclass,a.attname),', ') INTO missing
 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class cl ON cl.oid=a.attrelid
 JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
 WHERE ns.nspname='public' AND cl.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
 AND a.attrelid<>'public.patients'::regclass AND (a.attname ILIKE '%patient%' OR a.attname ILIKE '%paciente%')
 AND NOT EXISTS(SELECT 1 FROM atlas_merge_private.relations r WHERE r.relation=a.attrelid AND r.patient_column=a.attname);
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'Campos de paciente pendientes de revisión: %',missing; END IF;
 FOR guard_row IN SELECT * FROM atlas_merge_private.relations ORDER BY relation::text LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=guard_row.relation
      AND t.tgname='atlas_merge_reference_guard' AND t.tgenabled='O')
   THEN RAISE EXCEPTION 'Falta protección de escrituras en %',guard_row.relation; END IF;
 END LOOP;
END $$;

-- Bloqueos conservadores para una operación excepcional. No bloquea los SELECT.
-- Los triggers de referencia resuelven las escrituras que esperen al COMMIT.
CREATE FUNCTION atlas_merge_private.lock_relations() RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record;
BEGIN
 LOCK TABLE atlas_merge_private.configuration,atlas_merge_private.relations IN SHARE MODE;
 LOCK TABLE public.patients IN SHARE ROW EXCLUSIVE MODE;
 FOR r IN SELECT relation FROM atlas_merge_private.relations ORDER BY relation::text LOOP
   EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',r.relation);
 END LOOP;
END $$;

CREATE FUNCTION atlas_merge_private.canonical(p uuid,o uuid,c uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target uuid:=p; next_id uuid; seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 LOOP
   IF target=ANY(seen) OR cardinality(seen)>32 THEN RAISE EXCEPTION 'Alias circular.'; END IF;
   seen:=array_append(seen,target);
   SELECT l.primary_id INTO next_id FROM atlas_merge_private.links l WHERE l.secondary_id=target;
   EXIT WHEN next_id IS NULL; target:=next_id;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.patients WHERE id=target AND organization_id=o AND clinic_id=c)
 THEN RAISE EXCEPTION 'Referencia fuera del ámbito autorizado.'; END IF;
 RETURN target;
END $$;

CREATE FUNCTION atlas_merge_private.record_ids(p uuid,o uuid,c uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; ids jsonb;
BEGIN
 target:=atlas_merge_private.canonical(p,o,c);
 WITH RECURSIVE family(id) AS (
   SELECT target
   UNION
   SELECT l.secondary_id FROM atlas_merge_private.links l
     JOIN atlas_merge_private.operations op ON op.id=l.operation_id
     JOIN family f ON l.primary_id=f.id
    WHERE op.organization_id=o AND op.clinic_id=c AND op.reverted_at IS NULL
 )
 SELECT coalesce(jsonb_agg(id ORDER BY id::text),'[]'::jsonb) INTO ids FROM family;
 RETURN jsonb_build_object('canonicalId',target,'patientIds',ids);
END $$;

CREATE FUNCTION atlas_merge_private.families(o uuid,c uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(atlas_merge_private.record_ids(roots.primary_id,o,c) ORDER BY roots.primary_id::text),'[]'::jsonb)
 FROM (SELECT DISTINCT l.primary_id FROM atlas_merge_private.links l
   JOIN atlas_merge_private.operations op ON op.id=l.operation_id
   WHERE op.organization_id=o AND op.clinic_id=c AND op.reverted_at IS NULL) roots
$$;

CREATE FUNCTION atlas_merge_private.reference_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc jsonb:=to_jsonb(NEW); p uuid; target uuid;
BEGIN
 p:=(doc->>TG_ARGV[0])::uuid;
 IF p IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND p IS NOT DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[0])::uuid THEN RETURN NEW; END IF;
 target:=atlas_merge_private.canonical(p,(doc->>'organization_id')::uuid,(doc->>'clinic_id')::uuid);
 IF target<>p THEN NEW:=jsonb_populate_record(NEW,jsonb_build_object(TG_ARGV[0],target)); END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION atlas_merge_private.patient_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM atlas_merge_private.links WHERE secondary_id=OLD.id
    OR (TG_OP='DELETE' AND primary_id=OLD.id))
 THEN RAISE EXCEPTION 'Ficha fusionada protegida. Utiliza la ficha definitiva.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER atlas_merge_patient_guard BEFORE UPDATE OR DELETE ON public.patients
 FOR EACH ROW EXECUTE FUNCTION atlas_merge_private.patient_guard();

-- Solo el propietario de la migración puede registrar y proteger tablas.
CREATE FUNCTION atlas_merge_private.install_guards() RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record; cols integer;
BEGIN
 FOR r IN SELECT * FROM atlas_merge_private.relations ORDER BY relation::text LOOP
   SELECT count(DISTINCT a.attname) INTO cols FROM pg_catalog.pg_attribute a
   WHERE a.attrelid=r.relation AND NOT a.attisdropped AND a.attnum>0
     AND a.attname=ANY(ARRAY[r.patient_column,r.pk_column,'organization_id','clinic_id']::name[]);
   IF cols<>4 THEN RAISE EXCEPTION 'La tabla % necesita un adaptador específico de ámbito y PK.',r.relation; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_attribute a
      ON a.attrelid=k.conrelid AND a.attname=r.pk_column
      WHERE k.conrelid=r.relation AND k.contype='p' AND k.conkey=ARRAY[a.attnum])
   THEN RAISE EXCEPTION 'Clave primaria no compatible en %',r.relation; END IF;
   EXECUTE format('CREATE TRIGGER atlas_merge_reference_guard BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION atlas_merge_private.reference_guard(%L)',r.relation,r.patient_column);
 END LOOP;
END $$;

CREATE FUNCTION atlas_merge_private.snapshot(a uuid,b uuid,o uuid,c uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb; r record; rows jsonb; outside_scope boolean;
BEGIN
 SELECT jsonb_build_object('primary',to_jsonb(p),'secondary',to_jsonb(s),'relations','{}'::jsonb)
 INTO result FROM public.patients p CROSS JOIN public.patients s
 WHERE p.id=a AND s.id=b AND p.organization_id=o AND s.organization_id=o AND p.clinic_id=c AND s.clinic_id=c;
 IF result IS NULL THEN RAISE EXCEPTION 'Selecciona dos fichas de la misma clínica.'; END IF;
 FOR r IN SELECT * FROM atlas_merge_private.relations ORDER BY relation::text LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=ANY($1) AND (organization_id IS DISTINCT FROM $2 OR clinic_id IS DISTINCT FROM $3))',r.relation,r.patient_column)
    INTO outside_scope USING ARRAY[a,b],o,c;
   IF outside_scope THEN RAISE EXCEPTION 'Referencia de otra clínica en %',r.relation; END IF;
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY %I::text),''[]''::jsonb) FROM %s t WHERE %I=ANY($1) AND organization_id=$2 AND clinic_id=$3',r.pk_column,r.relation,r.patient_column)
    INTO rows USING ARRAY[a,b],o,c;
   result:=jsonb_set(result,ARRAY['relations',r.relation::text],rows);
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION atlas_merge_private.fields() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY['first_name','last_name_1','last_name_2','phone','landline','email','birth_date','sex','address','city','postal_code','source','category','category_date','administrative_notes','dni_nie']::text[]
$$;

CREATE FUNCTION atlas_merge_private.summary(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p||jsonb_build_object('lastAppointment',(SELECT max(ap.starts_at) FROM public.appointments ap
   WHERE ap.patient_id=(p->>'id')::uuid AND ap.organization_id=(p->>'organization_id')::uuid
   AND ap.clinic_id=(p->>'clinic_id')::uuid AND ap.starts_at<=now()
   AND to_jsonb(ap)->>'deleted_at' IS NULL))
$$;

CREATE FUNCTION atlas_merge_private.matches(p jsonb,q text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT position(translate(lower(btrim(q)),'áéíóúüñ','aeiouun') IN
   translate(lower(concat_ws(' ',p->>'first_name',p->>'last_name_1',p->>'last_name_2',p->>'phone',p->>'patient_number')),'áéíóúüñ','aeiouun'))>0
 OR (length(regexp_replace(q,'[^0-9]','','g'))>=6 AND
   position(regexp_replace(q,'[^0-9]','','g') IN regexp_replace(coalesce(p->>'phone',''),'[^0-9]','','g'))>0)
$$;

CREATE FUNCTION atlas_merge_private.review(s jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE conflicts jsonb:='[]'; blockers jsonb:='[]'; categories jsonb:='[]';
 f text; r record; n integer; duplicate boolean; x jsonb; a jsonb:=s->'primary'; b jsonb:=s->'secondary';
 ignore_fields text[]:=ARRAY['id','organization_id','clinic_id','patient_number','active','deleted_at','deleted_by','delete_reason','created_at','updated_at','created_by','updated_by'];
BEGIN
 FOR f IN SELECT jsonb_object_keys(a) LOOP
   IF f=ANY(atlas_merge_private.fields()) THEN
     IF coalesce(a->>f,'')<>'' AND coalesce(b->>f,'')<>'' AND a->f IS DISTINCT FROM b->f
     THEN conflicts:=conflicts||jsonb_build_array(jsonb_build_object('field',f,'label',f)); END IF;
   ELSIF NOT f=ANY(ignore_fields) AND (coalesce(a->>f,'') NOT IN ('','0','false') OR coalesce(b->>f,'') NOT IN ('','0','false')) THEN
     -- No sumar importes históricos, fusionar JSON desconocido ni sobrescribir extensiones.
     blockers:=blockers||jsonb_build_array('Requiere regla específica: patients.'||f);
   END IF;
 END LOOP;
 FOR r IN SELECT * FROM atlas_merge_private.relations ORDER BY relation::text LOOP
   x:=s->'relations'->r.relation::text;
   SELECT count(*) INTO n FROM jsonb_array_elements(x) el WHERE el->>r.patient_column=b->>'id';
   categories:=categories||jsonb_build_array(jsonb_build_object('label',r.label,'primary',jsonb_array_length(x)-n,'secondary',n));
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(x) embedded WHERE
       position((b->>'id') IN (embedded-ARRAY[r.pk_column::text,r.patient_column::text])::text)>0)
   THEN blockers:=blockers||jsonb_build_array('Referencia incrustada pendiente de adaptar: '||r.label); END IF;
   -- Coincidencia exacta de contenido: requiere revisión, nunca borrado silencioso.
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(x) l CROSS JOIN jsonb_array_elements(x) q
    WHERE l->>r.patient_column=a->>'id' AND q->>r.patient_column=b->>'id'
    AND l-ARRAY[r.pk_column::text,r.patient_column::text,'created_at','updated_at','created_by','updated_by']
       =q-ARRAY[r.pk_column::text,r.patient_column::text,'created_at','updated_at','created_by','updated_by']) INTO duplicate;
   IF duplicate THEN blockers:=blockers||jsonb_build_array('Posible registro repetido: '||r.label); END IF;
 END LOOP;
 RETURN jsonb_build_object('conflicts',conflicts,'categories',categories,'blockers',blockers,'coverageComplete',true);
END $$;

CREATE FUNCTION atlas_merge_private.verify_preserved_relations(before_s jsonb,after_s jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF before_s->'relations' IS DISTINCT FROM after_s->'relations' THEN
   RAISE EXCEPTION 'Un registro relacionado cambió durante la operación. Se cancela toda la operación.';
 END IF;
END $$;

CREATE FUNCTION atlas_merge_private.worker(action text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.patients%ROWTYPE; secondary public.patients%ROWTYPE; actor_id uuid;
 a uuid; b uuid; o uuid; c uuid; s jsonb; after_s jsonb; review jsonb;
 v atlas_merge_private.previews%ROWTYPE; op atlas_merge_private.operations%ROWTYPE;
 r record; f text; value jsonb; changes jsonb:='{}'; clauses text; new_id uuid; rec jsonb;
 expiry timestamptz; query_text text; ids jsonb; key_text text;
BEGIN
 IF action IN ('undo','status') THEN
   IF action='undo' THEN SELECT * INTO op FROM atlas_merge_private.operations WHERE id=(payload->>'mergeId')::uuid;
   ELSE SELECT * INTO op FROM atlas_merge_private.operations m WHERE m.actor=auth.uid()
      AND m.request_key=payload->>'idempotencyKey' AND m.clinic_id=(payload->>'clinicId')::uuid; END IF;
   IF op.id IS NULL THEN RAISE EXCEPTION 'Operación no encontrada.'; END IF;
   a:=op.primary_id;b:=op.secondary_id;o:=op.organization_id;c:=op.clinic_id;
 ELSE
   a:=(payload->>'primaryId')::uuid;b:=(payload->>'secondaryId')::uuid;
   IF action IN ('resolve','recordIds','families','search','capabilities') THEN
     o:=(payload->>'organizationId')::uuid;c:=(payload->>'clinicId')::uuid;
   ELSE
     SELECT * INTO p FROM public.patients WHERE id=a;
     IF p.id IS NULL THEN RAISE EXCEPTION 'Ficha no encontrada.'; END IF;
     o:=p.organization_id;c:=p.clinic_id;
   END IF;
 END IF;
 actor_id:=atlas_merge_private.authorize(o,c,action NOT IN ('resolve','recordIds','families'));
 IF action='resolve' THEN
   RETURN jsonb_build_object('id',atlas_merge_private.canonical((payload->>'id')::uuid,o,c));
 END IF;
 IF action='recordIds' THEN
   RETURN atlas_merge_private.record_ids((payload->>'id')::uuid,o,c);
 END IF;
 IF action='families' THEN
   RETURN atlas_merge_private.families(o,c);
 END IF;
 IF action='capabilities' THEN
   PERFORM atlas_merge_private.ready(o,c);RETURN jsonb_build_object('enabled',true);
 END IF;
 IF action='search' THEN
   query_text:=lower(btrim(payload->>'query'));
   IF length(query_text)<2 THEN RETURN '[]'; END IF;
   -- Alias derivados de las instantáneas, con ámbito y acceso específico de fusión.
   SELECT coalesce(jsonb_agg(result),'[]') INTO ids FROM (
     SELECT DISTINCT jsonb_build_object('id',patient.id,'name',concat_ws(' ',patient.first_name,patient.last_name_1,patient.last_name_2),
        'code',patient.patient_number,'phone',patient.phone,'lastAppointment',
        (atlas_merge_private.summary(to_jsonb(patient))->'lastAppointment')) result
     FROM public.patients patient WHERE patient.organization_id=o AND patient.clinic_id=c AND patient.deleted_at IS NULL
       AND (atlas_merge_private.matches(to_jsonb(patient),query_text)
       OR EXISTS(SELECT 1 FROM atlas_merge_private.operations m
         CROSS JOIN LATERAL (VALUES(m.before_state->'primary'),(m.before_state->'secondary')) old_patient(doc)
         WHERE m.primary_id=patient.id AND m.reverted_at IS NULL AND m.organization_id=o AND m.clinic_id=c
         AND atlas_merge_private.matches(old_patient.doc,query_text)))
     ORDER BY 1 LIMIT 30
   ) hits; RETURN ids;
 END IF;
 IF action='status' THEN RETURN jsonb_build_object('mergeId',op.id,'primaryId',op.primary_id,'verified',true,'reverted',op.reverted_at IS NOT NULL); END IF;
 PERFORM atlas_merge_private.lock_relations();
 PERFORM atlas_merge_private.ready(o,c);
 IF action='undo' THEN
   SELECT * INTO op FROM atlas_merge_private.operations WHERE id=op.id FOR UPDATE;
   IF payload->>'confirmed' IS DISTINCT FROM 'true' OR length(btrim(coalesce(payload->>'reason','')))=0
    THEN RAISE EXCEPTION 'Confirma la reversión e indica el motivo.'; END IF;
   IF op.reverted_at IS NOT NULL THEN RETURN jsonb_build_object('reverted',true,'verified',true); END IF;
   IF atlas_merge_private.snapshot(a,b,o,c) IS DISTINCT FROM op.after_state
    THEN RAISE EXCEPTION 'Hay cambios posteriores. Reversión bloqueada para no sobrescribir información.'; END IF;
   DELETE FROM atlas_merge_private.links WHERE operation_id=op.id;
   SELECT string_agg(format('%1$I=(jsonb_populate_record(NULL::public.patients,$1)).%1$I',attname),',') INTO clauses
     FROM pg_catalog.pg_attribute WHERE attrelid='public.patients'::regclass AND attnum>0
       AND NOT attisdropped AND attgenerated='' AND attname NOT IN ('id','organization_id','clinic_id');
   EXECUTE 'UPDATE public.patients SET '||clauses||' WHERE id=$2 AND organization_id=$3 AND clinic_id=$4'
     USING op.before_state->'primary',a,o,c;
   EXECUTE 'UPDATE public.patients SET '||clauses||' WHERE id=$2 AND organization_id=$3 AND clinic_id=$4'
     USING op.before_state->'secondary',b,o,c;
   s:=atlas_merge_private.snapshot(a,b,o,c);
   -- Los triggers de updated_at pueden cambiar la fecha técnica de actualización.
   IF s->'relations' IS DISTINCT FROM op.before_state->'relations'
   THEN RAISE EXCEPTION 'No se han podido conservar los registros relacionados.'; END IF;
   IF ((s->'primary')-'updated_at') IS DISTINCT FROM ((op.before_state->'primary')-'updated_at')
      OR ((s->'secondary')-'updated_at') IS DISTINCT FROM ((op.before_state->'secondary')-'updated_at')
   THEN RAISE EXCEPTION 'No se han podido restaurar las fichas.'; END IF;
   UPDATE atlas_merge_private.operations SET reverted_at=clock_timestamp(),reverted_by=actor_id,revert_reason=btrim(payload->>'reason') WHERE id=op.id;
   RETURN jsonb_build_object('reverted',true,'verified',true);
 END IF;
 IF action NOT IN ('preview','commit') THEN RAISE EXCEPTION 'Acción no reconocida.'; END IF;
 IF a IS NULL OR b IS NULL OR a=b THEN RAISE EXCEPTION 'Selecciona dos fichas diferentes.'; END IF;
 -- Idempotencia antes de comprobar el estado ya fusionado y antes de la caducidad.
 IF action='commit' THEN
   key_text:=payload->>'idempotencyKey';
   IF length(coalesce(key_text,'')) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'Falta una clave de operación válida.'; END IF;
   SELECT * INTO op FROM atlas_merge_private.operations m WHERE m.organization_id=o AND m.clinic_id=c AND m.actor=actor_id AND m.request_key=key_text;
   IF op.id IS NOT NULL THEN
     IF op.request_body IS DISTINCT FROM payload OR op.reverted_at IS NOT NULL THEN RAISE EXCEPTION 'Clave de operación ya utilizada.'; END IF;
     RETURN jsonb_build_object('mergeId',op.id,'primaryId',a,'verified',true);
   END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM atlas_merge_private.links WHERE secondary_id IN(a,b) OR primary_id IN(a,b))
 THEN RAISE EXCEPTION 'Hay una fusión anterior activa. Requiere revisión antes de encadenar fusiones.'; END IF;
 SELECT * INTO secondary FROM public.patients WHERE id=b AND organization_id=o AND clinic_id=c;
 IF secondary.id IS NULL OR secondary.deleted_at IS NOT NULL OR p.deleted_at IS NOT NULL
 THEN RAISE EXCEPTION 'Las fichas deben pertenecer a la misma clínica y no estar eliminadas.'; END IF;
 s:=atlas_merge_private.snapshot(a,b,o,c);review:=atlas_merge_private.review(s);
 IF action='preview' THEN
   INSERT INTO atlas_merge_private.previews(actor,organization_id,clinic_id,primary_id,secondary_id,snapshot,review)
     VALUES(actor_id,o,c,a,b,s,review) RETURNING token,expires_at INTO new_id,expiry;
   RETURN review||jsonb_build_object('primary',atlas_merge_private.summary(s->'primary'),'secondary',atlas_merge_private.summary(s->'secondary'),'token',new_id,'expiresAt',expiry);
 END IF;
 IF payload->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Se necesita confirmación expresa.'; END IF;
 SELECT * INTO v FROM atlas_merge_private.previews pv WHERE pv.token=(payload->>'token')::uuid AND pv.actor=actor_id
   AND pv.organization_id=o AND pv.clinic_id=c AND pv.primary_id=a AND pv.secondary_id=b FOR UPDATE;
 IF v.token IS NULL OR v.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'La revisión ha caducado.'; END IF;
 IF s IS DISTINCT FROM v.snapshot THEN RAISE EXCEPTION 'Los datos han cambiado. Vuelve a comparar las fichas.'; END IF;
 IF jsonb_array_length(review->'blockers')>0 THEN RAISE EXCEPTION 'Hay información pendiente de revisión: %',review->'blockers'; END IF;
 IF jsonb_typeof(payload->'resolutions') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Faltan las decisiones sobre los datos.'; END IF;
 FOR f IN SELECT jsonb_object_keys(payload->'resolutions') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'conflicts') x WHERE x->>'field'=f)
   THEN RAISE EXCEPTION 'Decisión no reconocida: %',f; END IF;
 END LOOP;
 FOR rec IN SELECT x FROM jsonb_array_elements(review->'conflicts') x LOOP
   IF coalesce(payload->'resolutions'->>(rec->>'field'),'') NOT IN ('primary','secondary')
   THEN RAISE EXCEPTION 'Falta decidir el campo %',rec->>'field'; END IF;
 END LOOP;
 FOREACH f IN ARRAY atlas_merge_private.fields() LOOP
   IF NOT s->'primary'?f THEN CONTINUE; END IF;
   value:=s->'primary'->f;
   IF coalesce(s->'primary'->>f,'')='' OR payload->'resolutions'->>f='secondary' THEN value:=s->'secondary'->f; END IF;
   changes:=changes||jsonb_build_object(f,value);
 END LOOP;
 SELECT string_agg(format('%1$I=(jsonb_populate_record(NULL::public.patients,$1)).%1$I',field_name),',') INTO clauses FROM jsonb_object_keys(changes) AS fields_to_set(field_name);
 IF clauses IS NOT NULL THEN EXECUTE 'UPDATE public.patients SET '||clauses||' WHERE id=$2 AND organization_id=$3 AND clinic_id=$4' USING changes,a,o,c; END IF;
 -- El historial permanece bajo los UUID originales. Las lecturas resuelven la familia de alias;
 -- las escrituras nuevas se canonicalizan en los triggers de referencia.
 UPDATE public.patients SET active=false,deleted_at=clock_timestamp() WHERE id=b AND organization_id=o AND clinic_id=c;
 after_s:=atlas_merge_private.snapshot(a,b,o,c);
 IF ((after_s->'primary')-'updated_at') IS DISTINCT FROM (((s->'primary')||changes)-'updated_at')
   OR ((after_s->'secondary')-ARRAY['active','deleted_at','updated_at'])
      IS DISTINCT FROM ((s->'secondary')-ARRAY['active','deleted_at','updated_at'])
 THEN RAISE EXCEPTION 'Una regla del servidor ha alterado datos de la ficha. Se cancela la operación.'; END IF;
 PERFORM atlas_merge_private.verify_preserved_relations(s,after_s);
 INSERT INTO atlas_merge_private.operations(actor,organization_id,clinic_id,primary_id,secondary_id,request_key,request_body,before_state,after_state)
 VALUES(actor_id,o,c,a,b,key_text,payload,s,after_s) RETURNING id INTO new_id;
 INSERT INTO atlas_merge_private.links(secondary_id,primary_id,operation_id) VALUES(b,a,new_id);
 DELETE FROM atlas_merge_private.previews WHERE token=v.token;
 RETURN jsonb_build_object('mergeId',new_id,'primaryId',a,'verified',true);
END $$;

CREATE FUNCTION public.atlas_patient_merge(action text,payload jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT atlas_merge_private.worker(action,payload)
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA atlas_merge_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_merge_private FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atlas_patient_merge(text,jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA atlas_merge_private TO authenticated;
GRANT EXECUTE ON FUNCTION atlas_merge_private.worker(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_patient_merge(text,jsonb) TO authenticated;
COMMIT;
