# Propuesta: retirar servicios y unificar Fisioterapia en Murcia

Estado: PROPUESTA PARA REVISIÓN. No aplicada.
Este documento no ejecuta cambios. Su fusión no modifica la base de datos ni FlowAtlas.

## Resultado solicitado por el equipo

- Retirar ACUPUNTURA de las opciones para nuevas citas, conservando las sesiones ya pautadas.
- Retirar el servicio exacto Fisioterapia de las opciones para nuevas citas y utilizar FISIOAVANZADA.
- Configurar FISIOAVANZADA con una duración predeterminada de 30 minutos.
- Pasar las citas futuras pendientes del servicio exacto Fisioterapia a FISIOAVANZADA, conservando sus horarios y condiciones pactadas.
- Conservar el historial y los demás servicios.
- No acortar automáticamente citas de FISIOAVANZADA ya existentes: los 30 minutos serán la duración predeterminada para nuevas citas.

## Localización en el código público

Versión revisada: main 8519f3760879b82d48ac941173615c7276a820c3.
Se ha leído CLAUDE.md; el árbol de esta versión no contiene AGENTS.md.

atlas.html utiliza clinic_settings para cargar y guardar la configuración central.
modules/agenda.html contiene el catálogo sales.services:
- applyRuntimeSettings y persistSales excluyen servicios con active=false.
- La duración de los nuevos servicios procede del campo duration.
- normalizeAlicanteServiceCatalog crea Fisioterapia cuando falta, pero conserva active=false si la entrada existe.

Por ello, la propuesta es desactivar las entradas existentes, conservando sus referencias para el historial, y cambiar la duración predeterminada de FISIOAVANZADA. No borrar el registro de Fisioterapia, porque el inicializador puede recrearlo.

## Aplicación pendiente de revisión humana

Las instrucciones de CLAUDE.md reservan a Rubén los cambios de datos.

1. Revisar el catálogo de Murcia en el sistema autorizado y desactivar ACUPUNTURA y Fisioterapia. Mantener FISIOAVANZADA activo con duration=30 y conservar las condiciones económicas existentes.
2. Revisar las citas futuras pendientes del servicio exacto Fisioterapia y sustituir exclusivamente ese servicio por FISIOAVANZADA. Conservar sus horas de inicio y fin, profesionales, recursos y demás servicios.
3. Respetar las protecciones de citas históricas y completadas; no deshabilitar controles del servidor.
4. Conservar las sesiones ya pautadas de Acupuntura sin alterar servicio ni horario.
5. Revisar por separado si los planes activos aún no agendados, la repetición de citas o FlowAtlas permiten ofrecer estos servicios. No modificar presupuestos, cobros, facturas ni sesiones realizadas automáticamente.
6. Recargar ATLAS en los equipos tras confirmar el guardado central.

## Comprobaciones para cerrar la revisión

- Una nueva cita de FISIOAVANZADA adopta 30 minutos.
- No se pueden pautar nuevas sesiones de ACUPUNTURA o Fisioterapia desde los flujos disponibles.
- Abrir una cita ya pautada de Acupuntura conserva su servicio y duración.
- Las citas futuras elegibles de Fisioterapia pasan a FISIOAVANZADA sin cambios de horario.
- El historial, los demás servicios, cobros y facturas permanecen iguales.
- Completar la revisión visual con datos sintéticos y la verificación posterior en el sistema autorizado.

Este PR contiene únicamente la propuesta operativa. No incluye datos extraídos de pacientes, recuentos de actividad ni identificadores internos de la base de datos. No se han realizado escrituras en Supabase.
