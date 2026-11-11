# Lista de espera compartida · ATLAS Murcia

## Causa

modules/agenda.html guardaba la lista únicamente en localStorage del navegador que la creó. Por eso unas compañeras podían verla y otras encontraban la lista vacía.

## Cambio aplicado

- La agenda consulta y guarda la lista en Supabase Murcia mediante la sesión autenticada.
- La tabla tiene RLS y políticas de lectura agenda_read y escritura agenda_write. El rol anónimo no tiene acceso.
- Al abrir la lista se carga el estado central; mientras permanece abierta se actualiza cada 20 segundos.
- Cada navegador importa una sola vez sus entradas locales y guarda una copia local. La importación no sustituye una entrada central con una copia antigua.
- Las eliminaciones son marcas lógicas para que una pestaña antigua no restaure accidentalmente una entrada eliminada.
- Si distintos navegadores habían creado por separado una preferencia para el mismo paciente, ambas pueden importarse. No se deduplican automáticamente porque no se puede asegurar que sean la misma preferencia.

## Ejecución y comprobación

La migración se aplicó el 11 de noviembre de 2026 al proyecto Supabase Murcia zaskiakmwicvhkwyleof. Se verificó RLS activo, acceso SELECT/INSERT/UPDATE para authenticated, ningún SELECT para anon y las tres políticas de agenda. La tabla quedó vacía; no se añadieron ni modificaron registros de pacientes reales.

Las pruebas locales pasan con datos sintéticos: importación local, error de conexión sin mostrar una lista falsamente vacía, alta, cambio de estado, borrado lógico y sincronización simulada entre dos sesiones. La interfaz también se revisó visualmente en una página local que no se conecta a Supabase.

Tras fusionar el PR, GitHub Pages publicará el cambio y recepción deberá recargar ATLAS. Conviene confirmar el uso normal en dos cuentas autorizadas de Murcia. No probar con pacientes reales; usar una entrada sintética autorizada y retirarla después.

## Reversión

Revertir el código detiene el uso de la tabla desde la web, pero no borra datos. No eliminar la tabla ni sus entradas como parte de una reversión de código. La tabla se conserva hasta que Rubén revise su contenido y decida expresamente qué hacer con ella.
