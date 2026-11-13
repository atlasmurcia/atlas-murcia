# Fecha de cobro en presupuestos — ATLAS Murcia

La pantalla de cobro registra la fecha elegida en payments.paid_at. Esa fecha ya alimenta la caja, el recibo, las ventas por periodo y la línea «Fecha del cobro» que muestran las vistas de factura.

La función actual de expedición toma payments.paid_at como sales_invoices.issue_date, por lo que elegir una fecha pasada retrotraería la expedición y la serie fiscal. migration.sql modifica únicamente el cálculo de target_date de esa función para que la fecha de expedición, la serie anual y el hash usen el día real de emisión en horario de Madrid. La fecha de cobro permanece en el pago y se muestra por separado en la vista de factura.

La migración es una propuesta local. No se ha aplicado a Supabase. El cambio afecta a facturas nuevas; no modifica facturas ya emitidas. Antes de aplicarla, revisar el impacto fiscal y los flujos de emisión VeriFactu en Murcia.

Fuentes normativas consultadas:
- AEAT, contenido de las facturas: https://sede.agenciatributaria.gob.es/Sede/iva/facturacion-registro/facturacion-iva/contenido-facturas.html
- AEAT, preguntas frecuentes de VeriFactu: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html
