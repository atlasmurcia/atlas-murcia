-- ATLAS Murcia · cierre del acceso directo a la función interna de auditoría.
-- La función seguirá funcionando exclusivamente desde su trigger.

revoke all on function public.atlas_audit_objective_target() from public,anon,authenticated;
