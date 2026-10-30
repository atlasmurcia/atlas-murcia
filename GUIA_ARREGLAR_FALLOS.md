# Cómo arreglar un fallo de ATLAS Murcia con Claude

Guía para el equipo de gestión. No hace falta saber programar.

## Antes de empezar (solo la primera vez)

1. Ten tu cuenta de GitHub y acepta la invitación al repositorio `atlasmurcia/atlas-murcia` (te llega por correo).
2. Entra en https://claude.ai/code con tu cuenta de Claude.
3. Conecta tu cuenta de GitHub cuando te lo pida y elige el repositorio **atlasmurcia/atlas-murcia**.

## Cuando aparece un fallo

1. **Haz una captura** de la pantalla donde se ve el fallo.
2. Abre una **sesión nueva** en claude.ai/code sobre el repositorio `atlasmurcia/atlas-murcia`.
3. Pega la captura y escribe tres frases:
   - Qué estabas haciendo (por ejemplo: «he agendado una cita de Fisioavanzada y Osteopatía»).
   - Qué esperabas que pasara («que solo ocupara la columna del fisio»).
   - Qué ha pasado en realidad («ha ocupado todas las máquinas»).
4. Claude buscará la causa, te la explicará y preparará el arreglo como **propuesta** (pull request).
5. **Avisa a Rubén** por el grupo de incidencias con el enlace de la propuesta. Hasta que él la apruebe, no se publica nada.
6. Cuando esté aprobada, en uno o dos minutos está en ATLAS: pide a todos que **recarguen** (Cmd+R en Mac, Ctrl+R en Windows).

## Lo que NO se arregla desde aquí

Díselo a Rubén directamente si el fallo es de:

- **Facturas, VeriFactu o cobros ya hechos.**
- **Datos mal guardados** (una cita o un paciente que hay que corregir): Claude te dirá qué hay que cambiar, pero lo hace Rubén.
- **WhatsApp o correos a pacientes.**
- **FlowAtlas** (leads y captación): está en otro sitio.

## Consejos

- Una sesión por fallo. Si encuentras otro, abre otra sesión.
- Si Claude te pregunta algo que no sabes, contesta «no lo sé, pregúntaselo a Rubén» y para ahí.
- No compartas contraseñas ni datos de pacientes en la sesión. Para describir el fallo basta con «un paciente» o un nombre de prueba.
