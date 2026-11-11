# Lista de espera compartida · propuesta para Murcia

## Causa confirmada en el código

modules/agenda.html guardaba la lista únicamente en localStorage del navegador que la creó. Por eso unas compañeras podían verla y otras encontraban la lista vacía. La base consultada no tenía una tabla de lista de espera compartida.

## Contenido de la propuesta

- migration.sql crea una tabla separada para ATLAS Murcia, con políticas de lectura agenda_read y escritura agenda_write.
- La agenda consulta esa tabla a través del puente autenticado de atlas.html.
- Al abrir la lista, se carga el estado central. Mientras permanece abierta se actualiza cada 20 segundos.
- Cada navegador importa una sola vez sus entradas locales. La importación no sustituye una entrada central con una copia local antigua; conserva las copias locales como respaldo.
- Si dos navegadores tenían entradas distintas para el mismo paciente, ambas pueden importarse; no se deduplican automáticamente porque no se puede asegurar que sean la misma preferencia.
- Las eliminaciones son marcas lógicas (deleted_at), para que una pestaña antigua no restaure accidentalmente una entrada eliminada.
- El contenido operativo (identificador de paciente, teléfono y notas) queda en la tabla protegida por los permisos de Agenda de la clínica.

## Orden de aplicación

1. Rubén revisa migration.sql y lo aplica en el proyecto Supabase Murcia zaskiakmwicvhkwyleof. No ejecutarlo en Alicante.
2. Completar las comprobaciones de código e interfaz con datos sintéticos y una sesión de pruebas autorizada.
3. Si todo queda correcto, fusionar el PR a main; GitHub Pages publicará la agenda y recepción deberá recargar ATLAS.
4. En dos navegadores de prueba, crear una entrada en el primero y confirmar que aparece en el segundo; cambiar su estado y borrarla desde el segundo, y comprobar la actualización al volver al primero.

No se ha ejecutado la migración, escrito en la base de datos ni usado información de pacientes reales. La propuesta requiere comprobar que el permiso de Agenda de Murcia se resuelve con has_clinic_permission antes de aplicarla.

## Reversión

Revertir el PR detiene el uso de la tabla desde la web, pero no borra datos. No eliminar la tabla ni sus entradas como parte de una reversión de código. La migración y la tabla se mantienen hasta que Rubén revise expresamente su contenido y decida su conservación.
