# Presupuestos entre equipos · PR 78

## Alcance

Cliente: `modules/ficha.html`, cargado con `?v=119` desde `atlas.html`.
Solo se suscribe a `public.budgets` y `public.budget_lines` usando el cliente autenticado existente. No añade claves, roles ni permisos. Los eventos invalidan el estado; la lectura `budgets:list` mantiene sus filtros de organización, clínica, paciente y `deleted_at`, y obtiene las líneas relacionadas. No hay sondeo periódico de presupuestos. Las comprobaciones de citas y configuración cada 15 segundos quedan fuera de este arreglo.

La ficha espera a que termine un borrador o un envío antes de aplicar cambios remotos, agrupa eventos durante 80 ms y comprueba de nuevo al reconectar, volver a la ficha o recuperar el foco. Elimina la suscripción al cambiar de paciente o cerrar sesión. Los DELETE de líneas requieren una escucha sin filtro, porque Postgres Changes no admite filtros para DELETE; solo se usa la notificación para releer bajo RLS. No se cambia REPLICA IDENTITY.

## Configuración aplicada en Murcia

Proyecto `zaskiakmwicvhkwyleof`. Migración `enable_budget_realtime_only`: añade únicamente `public.budgets` y `public.budget_lines` a `supabase_realtime`, comprobando antes que ambas mantienen RLS. Verificación posterior: la publicación contiene exactamente esas dos tablas y ambas tienen `relrowsecurity=true`, `relreplident=d`. No se alteran políticas ni registros.

SQL aplicado:

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budgets','budget_lines'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'RLS must remain enabled for %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END $$;
```

Reversión de esta configuración, si fuera necesaria: quitar exclusivamente esas dos tablas de la publicación. No afecta al guardado de presupuestos ni borra datos.

## Pruebas completadas

- `node tests/budget-refresh.cjs`: guardado y visualización mediante evento entre dos clientes aislados SIMULADOS, cabecera, líneas, baja remota, ausencia de sondeo, reconexión, cambio de paciente, cierre de sesión, protección de borrador, lectura inicial compartida, error y reintento del guardado inicial. No duplica canales ni convierte una baja remota en un presupuesto pendiente.
- `node tests/appointment-confirmation.cjs`: pasa.
- Sintaxis JavaScript: los 29 scripts de atlas.html y 48 de ficha.html son válidos.
- Consulta a los catálogos de producción: solo las dos tablas indicadas están en la publicación; RLS sigue activo.

## Puerta de publicación: pendiente

Estas pruebas simuladas NO acreditan la entrega por WebSocket ni el guardado mediante dos usuarios autenticados en Murcia. La sesión de navegador disponible está abierta en la versión publicada anterior. No se han copiado tokens, extraído credenciales ni creado presupuestos sobre pacientes reales para suplir esa prueba.

Antes de fusionar hay que disponer de una vista de prueba de esta rama y dos sesiones independientes autenticadas, con permiso de presupuestos y un paciente de prueba identificado como sintético. No publicar para poder hacer la prueba después.

1. Abrir la misma ficha de prueba en A y B. Confirmar que ambos canales llegan a SUBSCRIBED.
2. En A crear y guardar un presupuesto sintético con dos líneas. Esperar «Presupuesto confirmado en servidor». En B, sin recargar ni cambiar de pestaña, comprobar en menos de 2 segundos desde la confirmación el mismo identificador central, nombre, líneas, sesiones, precios y total. Medir el tiempo; repetir cinco veces.
3. Desde B editar nombre, sesiones y precio; guardar. Verificar lo mismo en A y abrir la vista de impresión desde A sin rehacer el presupuesto. No emitir facturas, cobros ni enviar comunicaciones.
4. Con un borrador sin guardar en A, cambiar el presupuesto desde B. Confirmar que A conserva el borrador y que un guardado concurrente recibe el conflicto de revisión existente, sin sobrescribir silenciosamente.
5. Desconectar B, guardar desde A y reconectar B. Comprobar que B recupera el estado completo al restablecer la suscripción.
6. Cambiar B a otro paciente de prueba, guardar en A y comprobar que una respuesta antigua no modifica la ficha nueva. Volver a la primera ficha y comprobar el dato actual.
7. Dejar ambas sesiones un minuto sin actividad: ninguna consulta periódica `budgets:list`. Guardar una vez: lecturas agrupadas, sin bucle de presupuestos, pagos o justificantes. No atribuir a esta prueba una solución de la lentitud general.
8. Verificar que una sesión sin permiso no puede leer presupuestos ni recibe contenido de filas ajenas, y que el cierre de sesión elimina el canal.
9. Completar inspección visual de lista, editor y vista de impresión con datos exclusivamente sintéticos. Solo si todo pasa: quitar borrador, revisar diff final y fusionar con SHA esperado. Comprobar el despliegue de Pages y `ficha.html?v=119` en la URL final.

Recepción, después de publicar: guardar formularios pendientes y recargar ATLAS una vez. No rehacer presupuestos anteriores ni conciliar duplicados como parte de este cambio.
