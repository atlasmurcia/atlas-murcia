# Cierres globales de Murcia — 2027

La configuración central ya contiene las 14 fechas solicitadas, sin duplicados
ni excepciones manuales. No es necesario reescribirla. Se conservan todos los
cierres anteriores, horarios, recursos, profesionales y citas existentes.

`database.sql` añade exclusivamente una validación de reservas para Murcia y
los cierres centrales de 2027. No actualiza registros existentes ni cambia RLS,
permisos, secretos o las demás funciones. Rechaza nuevas reservas y cambios de
fecha/hora que se solapen con el festivo, incluidas reservas forzadas. Usa el día
local de Europe/Madrid. Permite conservar y cancelar citas antiguas; restaurar
una cita cancelada o eliminada se valida otra vez. La función se ejecuta con los
permisos del invocador y falla si no puede leer la configuración necesaria.

La agenda y el calendario anual leen la configuración central vigente. El
calendario anual muestra el año seleccionado. La búsqueda local evita usar una
copia antigua de los cierres. Los nombres internos heredados de la aplicación
se conservan para evitar cambios ajenos a este encargo.

Pruebas con datos exclusivamente ficticios:

- `node tests/holiday-central-calendar.cjs` (requiere Playwright y Chrome).
- `node tests/holiday-booking-database.cjs` (requiere @electric-sql/pglite 0.5.17;
  se admite `PGLITE_PATH` para instalarlo fuera del repositorio).
- `node tests/planning-atomic-routes.cjs`.

No ejecutar reservas de prueba en producción. La instalación utiliza la
migración nativa de Supabase y se verifica por metadatos, sin escribir citas.
Recepción debe recargar ATLAS Murcia después de la publicación.
