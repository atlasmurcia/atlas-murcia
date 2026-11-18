// New deliveries only: never replay pre-activation conversations or provider retries.
export const receptionCancellationStartsAt = '2026-11-18T11:50:38Z';
export function isNewReceptionMessage(inbound) {
  const sentAt = Date.parse(inbound?.sent_at || inbound?.created_at || '');
  return Number.isFinite(sentAt) && sentAt >= Date.parse(receptionCancellationStartsAt);
}
// Incoming text is untrusted: route only explicit attendance/cancellation intent.
export function normalizeCancellationText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[¡!¿?.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isCancellationRequest(text, actionId = '') {
  const value = normalizeCancellationText(text);
  if (/^(?:atlas[-_:])?(?:no[-_:]?confirmar|rechazar)[-_:]?cita$/i.test(actionId)) return true;
  // Negated cancellation statements must never be interpreted as confirmation.
  const clauses = value.split(/\b(?:pero|aunque|sin embargo)\b/);
  return clauses.some(clause => {
    if (/\b(?:no (?:quiero|deseo|necesito|voy a)|prefiero no) (?:cancelar|anular)\b/.test(clause)) return /\bno (?:puedo|podre) (?:ir|asistir|acudir)\b/.test(clause);
    return /\bno (?:puedo|podre|podemos|podremos)(?: (?:ir|venir|acudir|asistir)| asistir a la cita| a la cita|$)/.test(clause.trim()) ||
      /\bno (?:voy|vamos) a (?:poder )?(?:ir|venir|acudir|asistir)\b/.test(clause) ||
      /\b(?:no (?:ire|iremos|asistire|asistiremos|acudire|acudiremos)|me es imposible (?:ir|venir|acudir|asistir)|no me viene bien|me viene mal|no confirmo|no confirmar)\b/.test(clause) ||
      /\b(?:quiero|queria|querria|necesito|deseo|tengo que|debo|me gustaria) (?:cancelar|anular)\b/.test(clause) ||
      /\b(?:cancelo|anulo|cancelad|anulad|cancela|anula)(?: la| mi)? (?:cita|sesion|consulta)\b/.test(clause) ||
      /^(?:por favor )?(?:cancelar|anular)(?: (?:la|mi|esta))?(?: (?:cita|sesion|consulta))?(?: por favor)?$/.test(clause.trim());
  });
}

export function cancellationPending(appointment) {
  return (appointment?.metadata || appointment || {}).cancellationRequest?.status === 'pending';
}

const terminal = row => ['cancelled', 'cancelada', 'completed', 'realizada', 'completada', 'no_show'].includes(String(row.status || '').toLowerCase());
const scope = (db, table, connection) => db.from(table).select('*').eq('organization_id', connection.organization_id).eq('clinic_id', connection.clinic_id);
const checked = result => { if (result.error) throw result.error; return result.data; };

export async function handleReceptionCancellation({ db, connection, conversation, inbound }) {
  const action = String(inbound?.payload?.interactive?.button_reply?.id || inbound?.payload?.button?.payload || inbound?.payload?.interactive?.list_reply?.id || '');
  const text = String(inbound?.body || '');
  if (!isCancellationRequest(text, action)) return false;
  if (!inbound?.id || !conversation?.id || !connection?.clinic_id || !connection?.organization_id) throw new Error('Falta contexto para registrar la solicitud de cancelación');
  const previous = checked(await scope(db, 'appointments', connection).contains('metadata', { cancellationRequest: { inboundMessageIds: [inbound.id] } }).limit(1));
  if (previous?.length) return true;
  const reviewLabel = `whatsapp-cancellation-review:${conversation.id}:${inbound.id}`;
  const previousReview = checked(await scope(db, 'atlas_internal_tasks', connection).eq('source_label', reviewLabel).limit(1));
  if (previousReview?.length) return true;
  let patient = null;
  if (conversation.patient_id) patient = checked(await scope(db, 'patients', connection).eq('id', conversation.patient_id).is('deleted_at', null).maybeSingle());
  if (!patient) {
    const phone = String(conversation.contact_phone || '').replace(/\D/g, '');
    const local = phone.length === 11 && phone.startsWith('34') ? phone.slice(2) : phone;
    const variants = [...new Set([phone, local, `34${local}`, `+34${local}`])].filter(v => v.length >= 9);
    if (variants.length) {
      const rows = checked(await scope(db, 'patients', connection).in('phone', variants).is('deleted_at', null).limit(2)) || [];
      if (rows.length === 1) patient = rows[0];
    }
  }
  const now = new Date().toISOString();
  const appointments = patient ? (checked(await scope(db, 'appointments', connection).eq('patient_id', patient.id).is('deleted_at', null).gt('starts_at', now).order('starts_at', { ascending: true }).limit(51)) || []).filter(row => !terminal(row)) : [];
  let target = null;
  const contextId = String(inbound?.payload?.context?.id || '');
  if (patient && contextId) {
    const jobs = checked(await scope(db, 'appointment_reminder_jobs', connection).eq('patient_id', patient.id).eq('provider_message_id', contextId).eq('status', 'sent').limit(2)) || [];
    const phone = String(conversation.contact_phone || '').replace(/\D/g, '');
    if (jobs.length === 1 && String(jobs[0].phone || '').replace(/\D/g, '') === phone) target = appointments.find(row => row.id === jobs[0].appointment_id) || null;
    // An explicit context that doesn't match must never fall back to another appointment.
  } else if (appointments.length === 1) target = appointments[0];

  if (target) {
    // The installation script creates/retains the task in this same transaction.
    // Read the row again with an optimistic version check: never overwrite a concurrent reception edit.
    const seenIds = target.metadata?.cancellationRequest?.inboundMessageIds || [];
    const metadata = { ...(target.metadata || {}), cancellationRequest: { status: 'pending', inboundMessageId: inbound.id, inboundMessageIds: [...new Set([...seenIds, inbound.id])], conversationId: conversation.id, requestedAt: now, reason: text.slice(0, 500) } };
    let query = db.from('appointments').update({ status: 'pending', metadata, updated_at: now }).eq('organization_id', connection.organization_id).eq('clinic_id', connection.clinic_id).eq('id', target.id).is('deleted_at', null);
    if (!target.updated_at) throw new Error('No se puede comprobar la versión de la cita');
    const result = checked(await query.eq('updated_at', target.updated_at).select('id').maybeSingle());
    if (!result) throw new Error('La cita ha cambiado; se debe reintentar la solicitud');
  } else {
    // Deterministic per-inbound key; unique index covers concurrent deliveries and retries.
    const sourceLabel = reviewLabel;
    const row = { organization_id: connection.organization_id, clinic_id: connection.clinic_id, patient_id: patient?.id || null, source_label: sourceLabel, title: 'Pendiente de cancelación · identificar cita', notes: `Recepción debe identificar la cita y tramitar la cancelación antes de cerrar esta tarea.\nMensaje: ${text.slice(0, 500)}\nConversación: ${conversation.id}\nCandidatas: ${appointments.map(a => a.id).join(', ') || 'Sin cita identificada'}`, task_type: 'seguimiento', status: 'pending', area: 'recepcion', assigned_name: 'Recepción', due_at: now };
    const result = await db.from('atlas_internal_tasks').insert(row);
    if (result.error && result.error.code !== '23505') throw result.error;
  }
  // No outbound message, lead conversion or rebooking is needed for this administrative handoff.
  return true;
}

export async function hasPendingReceptionCancellation({ db, connection, conversation }) {
  const open = () => scope(db, 'atlas_internal_tasks', connection).in('status', ['pending', 'in_progress', 'snoozed']);
  const byConversation = checked(await open().like('source_label', `whatsapp-cancellation-review:${conversation.id}:%`).limit(1));
  if (byConversation?.length) return true;
  // Resolve identity uniquely, including conversations not yet linked to a patient.
  let patientId = conversation.patient_id;
  if (!patientId) {
    const digits = String(conversation.contact_phone || '').replace(/\D/g, '');
    const local = digits.length === 11 && digits.startsWith('34') ? digits.slice(2) : digits;
    if (!local) return false;
    const rows = checked(await scope(db, 'patients', connection).in('phone', [...new Set([digits, local, `34${local}`, `+34${local}`])]).is('deleted_at', null).limit(2));
    if (rows?.length !== 1) return false;
    patientId = rows[0].id;
  }
  return !!checked(await open().eq('patient_id', patientId).or('source_label.eq.whatsapp-cancellation-pending,source_label.like.whatsapp-cancellation-review:%').limit(1))?.length;
}
