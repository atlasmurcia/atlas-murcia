# Pago mixto · propuesta de servidor para Murcia

Esta carpeta contiene una propuesta revisable. No se ha ejecutado contra producción y no modifica cobros existentes.

## Objetivo

- Validar en servidor que todo pago `mixed` tenga exactamente dos métodos distintos.
- Exigir importes positivos, con dos decimales como máximo, cuya suma coincida al céntimo con el cobro.
- Hacer que la venta directa se registre de forma atómica: un cobro, un justificante y una factura.
- Conservar la referencia de idempotencia para que un reintento no descuente stock ni genere otra factura.

## Diseño

La validación se ejecuta antes de insertar o actualizar un pago. Para ventas directas, `atlas_create_patient_sale_mixed` reutiliza el cálculo, permisos, catálogo, descuentos, stock e idempotencia de `atlas_create_patient_sale_v4`. Un indicador local a la transacción permite que el `BEFORE INSERT` incorpore el método y el desglose antes de que se ejecuten los disparadores de facturación.

Si la validación falla, PostgreSQL revierte la transacción completa, incluidos los cambios de stock. No se crean dos ventas ni se actualizan pagos históricos.

## Validación obligatoria antes de instalar

1. Aplicar el SQL en una base de pruebas clonada del esquema de Murcia, sin datos reales.
2. Confirmar que los permisos efectivos coinciden con `payments_write` y que `anon` no puede ejecutar la función.
3. Ejecutar los casos de `tests/mixed-payments-server.sql` dentro de una transacción que termine con `rollback`.
4. Probar desde la interfaz cita, presupuesto parcial/total y venta directa con producto.
5. Comprobar reintento tras pérdida de respuesta, stock, Caja, justificante y una sola factura.
6. Revisar los asesores de seguridad y rendimiento.

No se debe fusionar ni publicar la interfaz hasta superar estas comprobaciones.
