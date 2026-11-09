# CAMBIO PREPARADO: confirmaciones de WhatsApp y reagendaciones pendientes

Clínica: Murcia. Sistema afectado: función de Supabase `whatsapp-webhook`, versión 22.
Esta carpeta contiene un parche revisable del servicio. No modifica la interfaz web ni despliega nada al fusionarse en GitHub. No cambia el Site de FlowAtlas.

## Problema y comportamiento esperado

Una conversación que conserva `metadata.rebook` pendiente intercepta respuestas a recordatorios nuevos. «He confirmado» se reconoce, pero el flujo de confirmación lo bloquea; «Confirmar» como texto tampoco estaba admitido.

El parche reconoce «Confirmar» como respuesta completa y da prioridad al recordatorio si hay una respuesta explícita o un contexto de WhatsApp vinculado a un recordatorio enviado y a una cita futura válida del mismo paciente, clínica y teléfono. Sin contexto se exige un recordatorio de las últimas 48 horas. Un paciente identificado solo por teléfono debe coincidir de forma única.

Los «sí/ok/vale» sin contexto conservan la reagendación abierta. Una reserva con horario seleccionado conserva su confirmación, salvo respuesta vinculada expresamente a un recordatorio. Las reagendaciones caducadas o cerradas no bloquean los recordatorios.

Con un recordatorio identificado o con prioridad sobre una reagendación se conserva su selección: no se amplía a otras citas del mismo día. El flujo existente sin contexto y sin reagendación conserva su comportamiento anterior.

No se borra el contexto de reagendación: puede pertenecer a otra cita. La corrección no cancela, mueve ni reactiva citas. «No confirmar» en un recordatorio conserva el aviso a recepción, sin cancelar automáticamente.

## Archivos y comprobaciones

- `baseline.json`: proyecto, función, versión y hashes SHA-256 de los originales obtenidos con la conexión autorizada de Supabase. No contiene claves ni datos de pacientes.
- `whatsapp-webhook.patch`: diferencia mínima sobre `index.ts` y `reminder-confirmation.mjs` originales.
- `regression.test.cjs`: aplica el parche a una copia temporal, comprueba los hashes, compila el TypeScript y ejecuta los manejadores reales con base de datos y envíos simulados. No hace solicitudes de red.

Requisitos: Node.js 24 y `patch`. Descargar mediante acceso autorizado los dos archivos de la función versión 22 a una carpeta local. No sustituirlos por archivos de otra versión.

```bash
WEBHOOK_BASELINE=/ruta/a/originales node --test server-proposals/whatsapp-reminder-routing/regression.test.cjs
```

Resultado local: 36 pruebas correctas. Incluyen los mensajes del fallo, botones, negaciones, reagendación, reservas seleccionadas, expiración, contexto exacto, citas de otro paciente, otra clínica o teléfono, citas canceladas/completadas/borradas/pasadas, recordatorios antiguos, identidad ambigua y fallo de lectura.

## Revisión y aplicación pendientes

1. Rubén revisa el parche y autoriza su despliegue en el servicio. Fusionar esta propuesta en `main` no lo aplica en Supabase.
2. Volver a descargar la función activa y comprobar versión y hashes. Si han cambiado, adaptar el parche y repetir las pruebas; no sobrescribir cambios posteriores.
3. Conservar la versión original para reversión. Aplicar el parche en una copia y desplegar exclusivamente `whatsapp-webhook` con sus dos archivos, conservando `verify_jwt=false` y las demás opciones actuales. No desplegar todo el proyecto ni modificar secretos.
4. Verificar con un número y citas de prueba autorizados: confirmación del recordatorio con reagendación anterior abierta, confirmación de una reserva nueva y petición real de reagendar. Comprobar una sola respuesta y la cita correspondiente. Esta prueba con Meta y la base de datos reales aún no se ha realizado.
5. Si falla, restaurar los dos archivos originales y comprobar la restauración. La reversión del código no revierte mensajes ni marcas que ya se hayan producido.

Recepción no necesita recargar la web para una corrección del servidor. Los mensajes anteriores no se reprocesan y las citas afectadas anteriormente requieren revisión individual autorizada; este parche no las corrige en masa.

## Límites

La simulación comprueba la lógica y las consultas esperadas, pero no certifica la entrega real de Meta ni la escritura real en producción. No se han enviado mensajes ni cambiado datos de pacientes. La captura original no se incorpora a esta propuesta.

Fuera de alcance: reintentos duplicados de webhooks, cierre automático de contextos antiguos y el comportamiento previo de agrupación por día sin contexto de mensaje. No se han modificado.
