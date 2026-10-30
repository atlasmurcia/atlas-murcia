# ATLAS Murcia: instrucciones para Claude

ATLAS es el programa de gestión de FisioSport Murcia (agenda, fichas de pacientes, caja, comisiones). Lo usan a diario recepción y fisioterapeutas. Quien abre la sesión suele ser alguien del equipo de gestión, no un programador: explica siempre en español sencillo, sin jerga, qué pasa y qué vas a cambiar.

## Cómo está hecho

- Web estática publicada con GitHub Pages desde la rama `main`: https://atlasmurcia.github.io/atlas-murcia/
- Todo lo que llega a `main` se publica solo en uno o dos minutos y lo ven todos los ordenadores de la clínica al recargar (Cmd+R / Ctrl+R).
- `atlas.html`: armazón (inicio de sesión, menú, conexión con la base de datos, puente con FlowAtlas). Carga los módulos con `atlas.html?load=`.
- `modules/agenda.html`: agenda, directorio de pacientes, leads, caja diaria. Es el archivo más grande.
- `modules/ficha.html`: ficha clínica del paciente. `modules/finance.html`: finanzas. `modules/commissions.html`: comisiones.
- El código es HTML y JavaScript en línea, muy compacto (líneas largas). Busca con grep por nombres de función o textos que se ven en pantalla, y edita con cambios mínimos. Respeta el estilo del archivo: no reformatees ni reorganices código que no tocas.
- Datos: Supabase, proyecto `zaskiakmwicvhkwyleof`. Clínica de Murcia `0b741520-b7dc-48a2-9f79-3ef6b74258d4`, organización `4908e607-19bd-4139-a4b4-646c585f0cbf`.
- Lo que NO está en este repositorio: las funciones del servidor (correos, VeriFactu, recordatorios de WhatsApp), los permisos y triggers de la base de datos, y FlowAtlas (captación de leads, publicado aparte en chatgpt.site). Si el fallo está ahí, dilo claramente y deja que lo resuelva Rubén; no intentes arreglarlo desde aquí.

## Reglas que no se saltan nunca

1. Nunca publiques directamente en `main`. Trabaja en una rama nueva y abre un pull request explicando en español qué fallaba, qué cambias y cómo comprobarlo. Rubén (@atlasmurcia) lo aprueba antes de que se publique.
2. Facturas y VeriFactu: no cambies cómo se numeran, emiten, rectifican o envían facturas. Son registros fiscales. Si el fallo es de facturación, describe el problema y para.
3. WhatsApp y correos a pacientes: no cambies a quién, cuándo o qué se envía sin que Rubén lo pida expresamente.
4. Datos: no borres ni modifiques datos de pacientes, citas, cobros o caja. Desde estas sesiones no hay acceso de escritura a la base de datos; si un arreglo necesita tocar datos, explica qué habría que hacer y lo hace Rubén.
5. Nunca escribas claves, contraseñas ni datos de pacientes en el código, en los commits ni en el pull request. Este repositorio es público.
6. Las citas migradas de Koibox (`metadata.historico`) y las completadas están protegidas en el servidor; no intentes rodear esas protecciones.
7. Un arreglo por pull request, lo más pequeño posible. Si ves otros fallos por el camino, menciónalos en el pull request en lugar de arreglarlos todos a la vez.

## Antes de proponer el arreglo

- Localiza la causa exacta y explícala en una o dos frases.
- Comprueba el cambio: como mínimo, que el JavaScript sigue siendo válido y que la función corregida da el resultado esperado con los casos del fallo (por ejemplo, con un script que ejecute la función aislada).
- En el pull request indica qué tiene que hacer recepción después (normalmente: recargar ATLAS) y si hay que corregir a mano algo que se guardó mal antes del arreglo.

## Avisos conocidos

- Agenda: `resourcesForTherapy` decide qué columnas (fisios y máquinas) ocupa cada servicio. Los servicios del catálogo que no están en la tabla se deducen por el nombre; uno sin máquina solo ocupa al fisio.
- Fotos de pacientes: los enlaces firmados se piden en tandas de 1000 (`addSignedUrls` en `atlas.html`).
