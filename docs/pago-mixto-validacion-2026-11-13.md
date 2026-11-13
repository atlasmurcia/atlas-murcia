# Validación del pago mixto · 13 de noviembre de 2026

Pruebas realizadas en una rama temporal y aislada de Supabase Murcia, sin copiar pacientes ni cobros de producción. Todos los registros utilizados fueron ficticios.

## Resultado

- Migración aplicada correctamente sobre el esquema actual de Murcia.
- Venta directa de producto por 100 €: 30 € en metálico y 70 € en tarjeta.
- Un único cobro, justificante y factura por 100 €.
- Stock reducido de 10 a 9 una sola vez.
- Reintento con la misma referencia: devuelve el mismo cobro, sin otra factura ni movimiento de stock.
- Reintento con otro reparto: rechazado sin modificar el cobro.
- Venta sin stock: rechazada y revertida por completo.
- Cobro de cita por 80 €: 20 € en metálico y 60 € por Bizum, con una única factura.
- Pago parcial de presupuesto por 120 €: 50 € en metálico y 70 € por transferencia, con una única factura.
- Conciliación conjunta: 100 € metálico, 70 € tarjeta, 60 € Bizum y 70 € transferencia.
- Importes incorrectos, métodos repetidos, ceros y más de dos decimales: rechazados.
- Acceso anónimo a la función nueva: rechazado.
- Acceso autenticado con permiso de cobros: correcto.

## Observación del entorno temporal

La rama de Supabase se creó desde el historial de migraciones y no heredó algunos permisos de tabla ni la activación de RLS que sí existen actualmente en producción. Para probar el comportamiento real se restauraron únicamente en la rama temporal los permisos de `payments` y su RLS, igualándolos a producción. Este ajuste no forma parte de la migración de pago mixto y no se aplicó a producción.

La interfaz continúa sin publicarse. El siguiente paso es revisar el pull request, preparar el orden de despliegue servidor-interfaz y realizar una comprobación controlada tras la publicación.
