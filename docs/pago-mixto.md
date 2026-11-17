# Pago mixto en cobros de pacientes

Implementación preparada exclusivamente para ATLAS Murcia. Permite dividir un cobro nuevo entre dos métodos diferentes sin crear dos ventas ni dos facturas.

## Alcance

- Cobro de una cita o de varias citas del mismo paciente.
- Pago total o parcial de un presupuesto.
- Venta directa de servicios, productos u otros conceptos.
- Reparto del importe en Caja y presentación del desglose en justificantes.

El registro conserva `method = mixed` y dos asignaciones en `metadata.payment_method_breakdown`. Un cobro de 100 € puede guardarse, por ejemplo, como 30 € en metálico y 70 € con tarjeta.

## Protecciones

- Dos métodos distintos e importes positivos.
- Máximo de dos decimales y suma exacta al total.
- Una sola referencia de reintento cuando no se recibe respuesta.
- El servidor rechaza cambios de reparto para una referencia ya utilizada.
- El efectivo teórico de Caja incluye solo la parte abonada en metálico.
- No se migran ni modifican cobros anteriores.

## Estado de publicación

La interfaz tiene pruebas automáticas y revisión visual con datos ficticios. La propuesta SQL está en `server-proposals/mixed-payments/` y no debe instalarse directamente en producción. La rama puede revisarse mediante un pull request en borrador, pero no debe fusionarse ni publicarse hasta validar interfaz y servidor juntos en una base de pruebas con el esquema de Murcia.
