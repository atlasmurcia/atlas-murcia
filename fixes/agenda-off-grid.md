# Citas que comienzan entre los cuartos de hora

Parche preparado sobre main `2a8b49cc40e7a9eab05eb083c358568968690463`.

La cuadrícula solo dibujaba citas cuya hora coincidía exactamente con una fila de 15 minutos. El parche sitúa una cita de prueba de las 09:25 en la fila de 09:15 y desplaza su bloque diez minutos hacia abajo; mantiene la hora y duración reales. Cubre también reservas profesionales y simulaciones. La versión de carga de agenda pasa de 193 a 194.

No modifica registros de la base de datos. No contiene pacientes, credenciales ni configuración clínica. El archivo completo de agenda no se incluye en esta propuesta: la revisión automática rechazó su subida. Este parche no está aplicado a main ni publicado.

## Aplicación por una persona con acceso al repositorio

Trabajar en una rama separada y revisar primero la diferencia. Si main ha cambiado, resolver y revisar los cambios antes de continuar.

```sh
git apply --check --unidiff-zero fixes/agenda-off-grid.patch
git apply --unidiff-zero fixes/agenda-off-grid.patch
node fixes/agenda-off-grid-check.cjs
node tests/appointment-confirmation.cjs
git diff --check
```

La prueba de renderizado utiliza exclusivamente datos sintéticos: horarios 08:01, 09:14, 09:25, 10:05, límites del día, citas alineadas, reservas profesionales, simulaciones, varias unidades y filtros. Se verificó que falla antes del parche y pasa después. También compilan los 108 scripts de agenda y los 29 de atlas.

Falta revisión visual en navegador antes de publicar. El intento de abrir Playwright falló porque no está instalado Chromium headless shell v1234. Tras la publicación revisada, recepción debe guardar su trabajo pendiente y recargar ATLAS; no debe rehacer ni cambiar la hora de las citas afectadas.
