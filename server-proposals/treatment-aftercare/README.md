Instalación y publicación autorizadas por Gely el 20/11/2026.

Ver [alcance, requisitos y validación](../../docs/treatment-aftercare.txt).

SQL específico de murcia. Revisado contra sus metadatos y disparadores,
probado en PostgreSQL aislado con datos sintéticos. No aplicar planes reales
como parte de la instalación. Estado efectivo en la evidencia de despliegue.

Complemento de selección individual: `card-selection.sql`.
Habilita una elección independiente por tarjeta y conserva configuraciones
antiguas. Para actualizar una instalación ya activa, instalar solo este
complemento antes de publicar las interfaces nuevas; nunca repetir database.sql.
El cambio reemplaza únicamente atlas_aftercare_validate con SECURITY INVOKER;
no altera tablas, datos, políticas ni permisos de las clínicas.
Pruebas aisladas: tests/treatment-aftercare-database.cjs. Incluyen guardado,
reintentos, vinculación de un plan anterior, reajuste, rechazo de tarjetas no
seleccionadas y fallo atómico si aún se usa el validador anterior.

Regla independiente de una semana: reactivation-week.sql. Aplicada antes del
complemento de selección por tarjeta; conserva la opción de tarjeta individual
disponible después de instalar card-selection.sql y publicar su interfaz.
