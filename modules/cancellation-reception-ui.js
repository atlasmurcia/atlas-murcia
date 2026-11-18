(() => {
  let reviewPatients = new Set();
  const patientId = appointment => String(appointment?.patientRemoteId || appointment?.patient_id || patientMaster.find(p => String(p.code) === String(appointment?.patientCode))?.remoteId || '');
  const pending = appointment => (appointment?.metadata?.cancellationRequest || appointment?.cancellationRequest)?.status === 'pending' || reviewPatients.has(patientId(appointment));
  window.atlasCancellationPending = pending;
  const style = document.createElement('style');
  style.textContent = '.appt.atlas-cancellation-pending{outline:3px solid #b45309;background:#fff4df!important}.atlas-cancellation-label{display:block;font-size:11px;font-weight:800;color:#85420a;background:#fff4df;padding:3px 5px;border-radius:4px}.atlas-cancellation-dialog{border:1px solid #d4dee5;border-radius:14px;max-width:520px;padding:22px}.atlas-cancellation-dialog::backdrop{background:#102b3a99}.atlas-cancellation-dialog select{display:block;width:100%;margin:14px 0}.atlas-cancellation-dialog menu{display:flex;gap:10px;justify-content:flex-end;padding:0}';
  document.head.append(style);
  function paint() {
    document.querySelectorAll('.appt[data-id]').forEach(card => {
      const appointment = appointments.find(a => String(a.id) === String(card.dataset.id));
      const active = pending(appointment);
      card.classList.toggle('atlas-cancellation-pending', active);
      card.querySelector('[data-cancellation-label]')?.remove();
      if (active) {
        card.classList.remove('atlas-wa-confirmed');
        const badge = document.createElement('span');
        badge.className = 'atlas-cancellation-label';
        badge.dataset.cancellationLabel = '1';
        badge.textContent = reviewPatients.has(patientId(appointment)) ? '⚠ Cancelación pendiente de aclarar' : '⚠ Pendiente de cancelación';
        card.append(badge);
      }
    });
  }
  const previousRender = render;
  render = function() { const result = previousRender.apply(this, arguments); paint(); return result; };
  const previousDrawer = window.openDrawer;
  window.openDrawer = function(id) {
    const result = previousDrawer.apply(this, arguments);
    const appointment = appointments.find(a => String(a.id) === String(id));
    if (pending(appointment)) {
      const state = document.getElementById('appointmentConfirmationState');
      if (state) { state.classList.remove('confirmed'); state.textContent = '⚠ Pendiente de cancelación · Recepción debe cancelar la cita y después completar la tarea.'; }
      const button = document.getElementById('confirmAppointmentBtn');
      if (button) { button.disabled = true; button.textContent = 'Pendiente de cancelación'; }
    }
    return result;
  };
  window.atlasChooseCancelledAppointment = task => new Promise(resolve => {
    const options = appointments.filter(a => a.status === 'Cancelada' && a.centralId && (!task.patient_id || String(a.patientRemoteId || a.patient_id || patientMaster.find(p => String(p.code) === String(a.patientCode))?.remoteId) === String(task.patient_id)));
    const dialog = document.createElement('dialog');
    dialog.className = 'atlas-cancellation-dialog';
    const title = document.createElement('h2'); title.textContent = 'Vincular la cita cancelada';
    const note = document.createElement('p'); note.textContent = options.length ? 'Selecciona la cita que has cancelado para completar esta gestión.' : 'Cancela primero la cita desde la agenda. Después podrás vincularla aquí y completar la gestión.';
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Cita cancelada');
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Selecciona una cita'; select.append(placeholder);
    for (const appointment of options) { const option = document.createElement('option'); option.value = appointment.centralId; option.textContent = `${appointment.patient} · ${appointment.date} ${appointment.time} · ${(appointment.services || [appointment.therapy]).join(' + ')}`; select.append(option); }
    const menu = document.createElement('menu');
    const close = document.createElement('button'); close.textContent = 'Volver'; close.type = 'button';
    const save = document.createElement('button'); save.textContent = 'Vincular y completar'; save.type = 'button'; save.className = 'primary'; save.disabled = true;
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    select.onchange = () => { save.disabled = !select.value; };
    close.onclick = () => finish(null); save.onclick = () => finish(select.value); dialog.oncancel = event => { event.preventDefault(); finish(null); };
    menu.append(close, save); dialog.append(title, note, select, menu); document.body.append(dialog); dialog.showModal();
  });
  async function refreshReviews() {
    if (typeof window.atlasCentralRequest !== 'function') return;
    try {
      const tasks = await window.atlasCentralRequest('internalTasks:list');
      reviewPatients = new Set((tasks || []).filter(task => task.patient_id && String(task.source_label || '').startsWith('whatsapp-cancellation-review:') && ['pending','in_progress','snoozed'].includes(task.status)).map(task => String(task.patient_id)));
      paint();
    } catch (error) { console.warn('No se pudo actualizar el aviso de cancelaciones pendientes de aclarar', error); }
  }
  window.addEventListener('message', event => { if (event.source === parent && ['atlas:central-ready','atlas:central-internal-tasks-changed'].includes(event.data?.type)) refreshReviews(); });
  refreshReviews();
  paint();
})();
