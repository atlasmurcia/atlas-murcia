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
    const failures = [];
    const report = () => {
      root.atlasLeadWhatsappStateDiagnostic = {
        status: failures.length ? 'partial' : 'ready',
        errors: failures.map(item => ({ ...item }))
      };
    };
    const fallback = lead => {
      if (known.has(lead.metadata?.whatsapp_ai_pilot?.status)) return lead;
      // The automatic sender records this only after Meta accepts the send.
      // This proves sending, but does not prove delivery, reading or AI activity.
      if (!time(lead.metadata?.first_whatsapp_sent_at)) return lead;
      return { ...lead, metadata: { ...lead.metadata, whatsapp_ai_pilot: {
        ...(lead.metadata.whatsapp_ai_pilot || {}), status: 'sent'
      } } };
    };
    const scope = table => db.from(table).select(
      table === 'whatsapp_conversations'
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
    async function optionalRows(table, field, values) {
      try { return await rows(table, field, values); }
      catch (error) {
        failures.push({ table, code: String(error?.code || 'status_read_failed') });
        return [];
      }
    }
    async function enrollmentStates() {
      const result = [];
      const ids = [...new Set(leads.map(lead => lead.id))];
      try {
        for (let i = 0; i < ids.length; i += 100) {
          const response = await db.functions.invoke('flow-lead-status', { body: {
            organizationId: context.organizationId, clinicId: context.clinicId,
            leadIds: ids.slice(i, i + 100)
          } });
          if (response.error || !Array.isArray(response.data?.enrollments)) {
            throw response.error || new Error('status_unavailable');
          }
          const requested = new Set(ids.slice(i, i + 100));
          result.push(...response.data.enrollments.filter(item => requested.has(item.lead_id)));
        }
        return result;
      } catch (error) {
        failures.push({ table: 'whatsapp_ai_lead_pilot_enrollments',
          code: String(error?.code || 'status_read_failed') });
        return [];
      }
    }
    try {
      const enrollments = await enrollmentStates();
      const firstSent = leads.filter(l => time(l.metadata?.first_whatsapp_sent_at) && phone(l.phone));
      const [enrolledConversations, firstConversations] = await Promise.all([
        optionalRows('whatsapp_conversations', 'id', enrollments.map(e => e.conversation_id)),
        optionalRows('whatsapp_conversations', 'contact_phone', firstSent.map(l => phone(l.phone)))
      ]);
      const conversations = new Map([...enrolledConversations, ...firstConversations].map(c => [c.id, c]));
      const byPhone = new Map();
      for (const c of firstConversations) {
        const key = phone(c.contact_phone);
        // Ambiguous phone ownership must not assign another conversation's badge.
        byPhone.set(key, byPhone.has(key) ? null : c);
      }
      const messages = await optionalRows('whatsapp_messages', 'conversation_id', [...conversations.keys()]);
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
      const result = leads.map(lead => {
        const metadata = lead.metadata || {}, enrollment = enrollmentByLead.get(lead.id);
        const conversation = enrollment ? conversations.get(enrollment.conversation_id) : byPhone.get(phone(lead.phone));
        if (!conversation) return fallback(lead);
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
        if (!status || !known.has(status)) return fallback(lead);
        return { ...lead, metadata: { ...metadata, whatsapp_ai_pilot: {
          ...(metadata.whatsapp_ai_pilot || {}), status
        } } };
      });
      report();
      return result;
    } catch (error) {
      // Status visibility must not prevent access to leads or invent a success.
      failures.push({ table: 'adapter', code: String(error?.code || 'status_read_failed') });
      report();
      return leads.map(fallback);
    }
  }
  root.atlasHydrateLeadWhatsappStates = hydrate;
})(globalThis);
