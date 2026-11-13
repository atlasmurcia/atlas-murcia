(() => {
  const panel = document.getElementById('tareasPaciente');
  if (!panel) return;
  const pending = new Map();
  let patient = null, ready = false, serial = 0, generation = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const statuses = {pending:'Pendiente', in_progress:'En curso', snoozed:'Pospuesta', completed:'Completada', cancelled:'Cancelada'};
  const areas = {fisio:'Fisio', recepcion:'Recepción', auxiliar:'Auxiliar'};
  const date = value => value ? new Date(value).toLocaleString('es-ES', {timeZone:'Europe/Madrid', dateStyle:'short', timeStyle:'short'}) : 'Sin fecha';
  function request(action, patientId) {
    return new Promise((resolve, reject) => {
      const requestId = 'patient-tasks-' + Date.now() + '-' + (++serial);
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('No se ha podido confirmar la carga de tareas.')); }, 25000);
      pending.set(requestId, {resolve, reject, timer});
      parent.postMessage({type:'atlas:central-db-request', requestId, action, payload:{patientId}}, '*');
    });
  }
  function message(text) {
    panel.innerHTML = '<div class="card"><h2>Tareas del paciente</h2><p role="status">' + escape(text) + '</p><button type="button" class="btn" id="patientTasksRetry">Actualizar tareas</button></div>';
    panel.querySelector('#patientTasksRetry').onclick = load;
  }
  function render(internal, communications) {
    const tasks = [
      ...internal.map(task => ({title:task.title, notes:task.notes, status:task.status, due:task.due_at, area:task.area, assigned:task.assigned_name || task.assigned_display_name})),
      ...communications.filter(row => row.channel === 'task').map(row => ({title:row.summary, notes:row.outcome, status:row.completed_at ? 'completed' : 'pending', due:row.due_at, area:row.metadata?.department}))
    ].sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
    const open = tasks.filter(task => !['completed', 'cancelled'].includes(task.status)).length;
    panel.innerHTML = '<div class="card"><div class="patient-tasks-heading"><div><h2>Tareas del paciente</h2><p>' + escape(patient.name || 'Paciente seleccionado') + ' · ' + open + ' pendiente(s)</p></div><button type="button" class="btn" id="patientTasksRefresh">↻ Actualizar</button></div><div class="patient-tasks-list">' +
      (tasks.length ? tasks.map(task => '<article class="patient-task-row"><div class="patient-task-meta"><span class="chip">' + escape(statuses[task.status] || task.status || 'Pendiente') + '</span><span>' + escape(areas[task.area] || 'Recepción') + '</span></div><h3>' + escape(task.title) + '</h3>' + (task.notes ? '<p class="patient-task-notes">' + escape(task.notes) + '</p>' : '') + '<div class="small">' + escape(date(task.due)) + (task.assigned ? ' · Responsable: ' + escape(task.assigned) : '') + '</div></article>').join('') : '<p>No hay tareas asociadas a este paciente.</p>') + '</div></div>';
    panel.querySelector('#patientTasksRefresh').onclick = load;
  }
  async function load() {
    const token = ++generation, patientId = patient?.remoteId;
    if (!patientId) return message('Selecciona un paciente para consultar sus tareas.');
    if (!ready) {
      message('Esperando la conexión con ATLAS…');
      parent.postMessage({type:'atlas:central-module-ready', module:'ficha'}, '*');
      return;
    }
    message('Cargando las tareas de este paciente…');
    try {
      const [internal, communications] = await Promise.all([request('internalTasks:list', patientId), request('communications:list', patientId)]);
      if (token !== generation || patient?.remoteId !== patientId) return;
      render((internal || []).filter(row => String(row.patient_id) === String(patientId)), communications || []);
    } catch (error) {
      if (token !== generation || patient?.remoteId !== patientId) return;
      message('No se pudieron cargar las tareas. Pulsa «Actualizar tareas» para reintentar.');
    }
  }
  window.addEventListener('message', event => {
    const data = event.data || {}, item = pending.get(data.requestId);
    if (data.type === 'atlas:central-db-response' && item) {
      pending.delete(data.requestId); clearTimeout(item.timer);
      data.ok ? item.resolve(data.data) : item.reject(new Error(data.error || 'Error al cargar las tareas.'));
    }
    if (data.type === 'atlas:load-patient') { patient = data.patient || null; load(); }
    if (data.type === 'atlas:central-ready') { ready = true; if (patient) load(); }
    if (['atlas:central-internal-tasks-changed', 'atlas:central-communications-changed'].includes(data.type) && patient) load();
  });
  document.querySelector('[data-t="tareasPaciente"]')?.addEventListener('click', load);
  message('Selecciona un paciente para consultar sus tareas.');
  // This external script can load after the ficha has already received its context.
  // Announce readiness after installing the listener so ATLAS resends both context and patient.
  parent.postMessage({type:'atlas:module-ready', module:'ficha'}, '*');
})();
