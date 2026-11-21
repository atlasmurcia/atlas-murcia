# Objetivos y celebraciones · Murcia

Esta propuesta crea el cálculo central del panel, las metas mensuales, su auditoría y los avisos que cada trabajador debe confirmar con «He visto el aviso».

## Orden seguro de implantación

1. Aplicar `migration.sql` en una rama sintética de Supabase, sin copiar pacientes ni cobros.
2. Ejecutar los casos de `tests/objectives-engine.cjs` y revisar la pantalla con la maqueta ficticia.
3. Comprobar los asesores de seguridad y rendimiento de Supabase.
4. Aplicar la migración en Murcia y publicar el código web únicamente cuando todo lo anterior esté correcto.

Si `migration.sql` ya se aplicó antes de incorporar la optimización del historial de noviembre, ejecutar después `performance-fix.sql`. El ajuste conserva las mismas reglas y evita repetir el recorrido completo de cobros por cada cita.

Si la revisión de seguridad se hizo antes de incorporar el cierre de la función interna de auditoría, ejecutar `security-fix.sql`. No cambia datos ni permisos del panel; únicamente impide invocar directamente una función reservada a su trigger.

La primera fase muestra Alicante y Barcelona a cero y los identifica como pendientes de conexión. No consulta ni mezcla sus bases de datos. La conexión real de Alicante se hará en una segunda fase contra su despliegue productivo confirmado.
