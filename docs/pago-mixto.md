# Pago mixto en cobros de pacientes

Cambio preparado para Murcia. Requiere validación e instalación del soporte de servidor antes de fusionar/publicar.

## Alcance

«Cobrar cita», «Pagar presupuesto» y «Generar venta independiente» permiten «Pago mixto»: dos métodos diferentes y dos importes positivos, de hasta dos decimales. La suma tiene que coincidir exactamente con lo que se cobra ahora, después de descuentos y anticipos.

Se conserva un único cobro con su justificante y factura existentes, y dos asignaciones en `metadata.payment_method_breakdown`, por ejemplo `[{"method":"cash","amount":30},{"method":"card","amount":70}]` para un total de 100 €. No hay dos ventas ni dos facturas por dividir los métodos.

Caja atribuye 30 € a efectivo y 70 € a tarjeta, y contabiliza el total de ventas una sola vez. El desglose se conserva al recargar y se muestra en los recibos. El editor genérico de Caja no cambia silenciosamente un pago mixto por «Otro»; para corregirlo se usa la corrección específica de forma de pago de la ficha/factura.

Los presupuestos y cobros agrupados reutilizan la referencia de un intento incierto y bloquean cambios del reparto hasta comprobar el justificante. Las ventas independientes mantienen la referencia de venta ya existente.

## Dependencia que debe resolver el responsable del servidor

Las funciones y disparadores de la base de datos de Murcia no están en este repositorio. No se han cambiado desde esta tarea.

Antes de fusionar, Rubén o el responsable técnico debe comprobar en una base de pruebas:

- Que `payments.method` admite `mixed`, se conserva el desglose completo y la suma de ambos importes coincide al céntimo con `payments.amount`.
- Que se valida antes de insertar, también en llamadas directas a la API, preservando los permisos de cobro y los índices de idempotencia existentes.
- Que existe el RPC `atlas_create_patient_sale_mixed`, con los mismos argumentos que `atlas_create_patient_sale_v4` y un argumento adicional `p_breakdown jsonb`. Debe delegar en la implementación actual para precios, stock y autorización, incluir el desglose antes de la emisión automática y devolver el mismo recibo al reintentar; nunca debe registrar primero una parte y luego la otra en operaciones independientes.
- Que una suma incorrecta revierte el cobro completo y cualquier cambio de stock, sin emitir una factura parcial.
- Que el flujo actual de facturas, numeración, VeriFactu y comunicaciones se mantiene. Este cambio no modifica esas funciones.

Se ha preparado un candidato SQL en la copia de trabajo de Alicante. Su compatibilidad con el esquema de Murcia **no está verificada**; no se debe instalar allí automáticamente ni transferir configuraciones entre clínicas.

## Validación y entrega

```sh
node tests/mixed-payments.cjs
node tests/mixed-payment-handlers.cjs
```

Con `jsdom@26.1.0` instalado fuera del repositorio y `NODE_PATH` apuntando a su `node_modules`:

```sh
node tests/mixed-payments-dom.cjs
```

Las pruebas usan formularios reales con datos sintéticos y un backend simulado; comprueban validación, asignación de efectivo, envío del desglose y referencias de reintento. Se ha analizado la sintaxis de los scripts de los tres módulos afectados. La revisión visual en navegador está pendiente porque el entorno de pruebas bloqueó su apertura.

Tras instalar y validar el servidor, comprobar cita, presupuesto parcial/total con descuento y venta con producto, incluidos reintentos tras pérdida de respuesta. Después, revisar y fusionar el PR: GitHub Pages publicará Murcia. Recepción solo tendrá que recargar ATLAS. No hay correcciones manuales de cobros anteriores y no se ha registrado ningún cobro real en esta tarea.
