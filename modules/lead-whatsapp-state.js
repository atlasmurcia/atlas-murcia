/* Display adapter for Murcia. Reads status only; never sends or updates data. */
(function (root) {
  'use strict';
  const known = new Set(['sent', 'delivered', 'read', 'replied', 'ai_active', 'failed']);
  const active = new Set(['active', 'awaiting_availability', 'awaiting_slot', 'awaiting_confirmation']);
  const phone = value => {
    let digits = String(value || '').replace(/\D/g, '').replace(/^00/, '');
    return digits.length === 9 ? '34' + digits : digits;
  };
  const time = value => Date.parse(value || '') || 0;
  async function hydrate(db, context, leads) {
    if (!leads.length || !context.organizationId || !context.clinicId) return leads;
    const scope = table => db.from(table).select(
      table === 'whatsapp_ai_lead_pilot_enrollments'
        ? 'id,lead_id,conversation_id,status,enrolled_at,updated_at'
        : table === 'whatsapp_conversations'
          ? 'id,contact_phone,metadata'
          : 'id,conversation_id,direction,status,sent_at,created_at'
    ).eq('organization_id', context.organizationId).eq('clinic_id', context.clinicId);
    // Batch and paginate so a large funnel cannot silently truncate statuses.
    async function rows(table, field, values) {
      const unique = [...new Set(values.filter(Boolean))], result = [];
      for (let i = 0; i < unique.length; i += 100) {
        let complete = false;
        for (let from = 0; from < 20000; from += 1000) {
          const query = await scope(table).in(field, unique.slice(i, i + 100))
            .order('id', { ascending: true }).range(from, from + 999);
          if (query.error) throw query.error;
          result.push(...(query.data || []));
          if ((query.data || []).length < 1000) { complete = true; break; }
        }
        if (!complete) throw new Error('Incomplete WhatsApp status page');
      }
      return result;
    }
    try {
      const enrollments = await rows('whatsapp_ai_lead_pilot_enrollments', 'lead_id', leads.map(l => l.id));
      const firstSent = leads.filter(l => time(l.metadata?.first_whatsapp_sent_at) && phone(l.phone));
      const [enrolledConversations, firstConversations] = await Promise.all([
        rows('whatsapp_conversations', 'id', enrollments.map(e => e.conversation_id)),
        rows('whatsapp_conversations', 'contact_phone', firstSent.map(l => phone(l.phone)))
      ]);
      const conversations = new Map([...enrolledConversations, ...firstConversations].map(c => [c.id, c]));
      const byPhone = new Map();
      for (const c of firstConversations) {
        const key = phone(c.contact_phone);
        // Ambiguous phone ownership must not assign another conversation's badge.
        byPhone.set(key, byPhone.has(key) ? null : c);
      }
      const messages = await rows('whatsapp_messages', 'conversation_id', [...conversations.keys()]);
      const grouped = new Map();
      for (const message of messages) {
        if (!grouped.has(message.conversation_id)) grouped.set(message.conversation_id, []);
        grouped.get(message.conversation_id).push(message);
      }
      const enrollmentByLead = new Map();
      for (const e of enrollments) {
        const old = enrollmentByLead.get(e.lead_id);
        if (!old || time(e.enrolled_at) > time(old.enrolled_at)) enrollmentByLead.set(e.lead_id, e);
      }
      return leads.map(lead => {
        const metadata = lead.metadata || {}, enrollment = enrollmentByLead.get(lead.id);
        const conversation = enrollment ? conversations.get(enrollment.conversation_id) : byPhone.get(phone(lead.phone));
        if (!conversation) return lead;
        const paused = metadata.no_contact || conversation.metadata?.ai_paused || conversation.metadata?.human_takeover;
        const history = grouped.get(conversation.id) || [];
        let status = null;
        const hasReply = enrollment && time(enrollment.enrolled_at) && history.some(m =>
          m.direction === 'outbound' && ['sent', 'delivered', 'read'].includes(m.status) &&
          time(m.sent_at || m.created_at) >= time(enrollment.enrolled_at));
        if (enrollment && active.has(enrollment.status) && !paused && hasReply) status = 'ai_active';
        if (!status) {
          const firstAt = time(metadata.first_whatsapp_sent_at), enrolledAt = time(enrollment?.enrolled_at);
          // An unrelated appointment reminder is never evidence of a lead send.
          const outbound = history.filter(m => m.direction === 'outbound' && (
            enrollment && enrolledAt && time(m.sent_at || m.created_at) >= enrolledAt ||
            firstAt && time(m.sent_at) === firstAt
          )).sort((a, b) => time(b.sent_at || b.created_at) - time(a.sent_at || a.created_at))[0];
          if (outbound && ['sent', 'delivered', 'read', 'failed'].includes(outbound.status)) {
            status = outbound.status;
            if (status !== 'failed' && history.some(m => m.direction === 'inbound' &&
              time(m.created_at) > time(outbound.sent_at || outbound.created_at))) status = 'replied';
          }
        }
        if (!status || !known.has(status)) return lead;
        return { ...lead, metadata: { ...metadata, whatsapp_ai_pilot: {
          ...(metadata.whatsapp_ai_pilot || {}), status
        } } };
      });
    } catch (_) {
      // Status visibility must not prevent access to leads or invent a success.
      return leads;
    }
  }
  root.atlasHydrateLeadWhatsappStates = hydrate;
})(globalThis);
