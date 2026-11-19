BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM atlas_merge_private.configuration cfg JOIN public.clinics c ON c.id=cfg.clinic_id AND c.organization_id=cfg.organization_id WHERE c.active AND c.name='Murcia')<>1 THEN RAISE EXCEPTION 'Configuración de fusión no disponible para el centro.';END IF; END $$;
UPDATE atlas_merge_private.configuration cfg SET schema_signature=atlas_merge_private.schema_signature(),coverage_review='Validación local: conservación de referencias, índices y políticas de cada clínica; integración de consultas, escritura de presupuestos y recorrido visual sintético de escritorio y móvil. Concurrencia remota no ejecutada: prueba rechazada.',enabled=true
FROM public.clinics c WHERE c.id=cfg.clinic_id AND c.organization_id=cfg.organization_id AND c.active AND c.name='Murcia';
SELECT atlas_merge_private.ready(c.organization_id,c.id) FROM public.clinics c WHERE c.active AND c.name='Murcia';
COMMIT;
