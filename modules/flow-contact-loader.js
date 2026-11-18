/* Murcia: bounded, deduplicated reads. Never retries a write or stores contacts. */
(function (root) {
  'use strict';
  const columns = 'id,source,source_detail,first_name,last_name,email,phone,status,assigned_name,next_action_at,last_contact_at,marketing_consent,marketing_consent_at,notes,patient_id,external_id,metadata,created_at,updated_at,updated_by';
  const scopeKey = c => JSON.stringify([c?.userId, c?.organizationId, c?.clinicId]);
  const failure = (message, code) => Object.assign(new Error(message), { code });
  function bounded(work, ms) {
    const controller = new AbortController();
    let timer;
    return Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort();
        reject(failure('La conexión está tardando demasiado. Vuelve a actualizar los contactos.', 'ATLAS_FLOW_TIMEOUT'));
      }, ms); })
    ]).finally(() => { clearTimeout(timer); controller.abort(); });
  }
  const transient = e => ['408', '429', '502', '503', '504'].includes(String(e?.status || e?.code || '')) ||
    /failed to fetch|networkerror|network request failed|fetch failed|connection reset/i.test(String(e?.message || ''));
  function create(db, getContext, hydrate, timing = {}) {
    const pending = new Map();
    const primaryMs = timing.primaryMs || 5400, extraMs = timing.extraMs || 1400;
    let revision = 0;
    function scoped(table, fields, c) {
      return db.from(table).select(fields).eq('organization_id', c.organizationId).eq('clinic_id', c.clinicId);
    }
    async function read(makeQuery, signal) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal.aborted) throw failure('Lectura cancelada.', 'ATLAS_FLOW_TIMEOUT');
        let result;
        try { result = await makeQuery().abortSignal(signal); }
        catch (error) { result = { error }; }
        if (!result.error) return result.data || [];
        const error = Object.assign(new Error(result.error.message || 'No se pudieron cargar los contactos.'), result.error,
          { status: result.status || result.error.status });
        if (attempt || signal.aborted || !transient(error)) throw error;
      }
    }
    async function profiles(ids, c, signal) {
      const unique = [...new Set(ids.filter(Boolean))], rows = [];
      for (let from = 0; from < unique.length; from += 100) {
        rows.push(...await read(() => db.from('profiles').select('user_id,full_name').in('user_id', unique.slice(from, from + 100)), signal));
      }
      return rows;
    }
    async function contacts(c, signal) {
      const page = from => read(() => scoped('leads', columns, c).is('deleted_at', null)
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, from + 999), signal);
      const rows = await page(0);
      if (rows.length < 1000) return rows;
      // Three pages at a time; preserve the original order and never return partial success.
      for (let from = 1000; from <= 20000; from += 3000) {
        const offsets = [from, from + 1000, from + 2000].filter(offset => offset <= 20000);
        const pages = await Promise.all(offsets.map(page));
        for (let i = 0; i < pages.length; i++) {
          if (offsets[i] === 20000) {
            if (pages[i].length) throw failure('La lista supera el límite de carga. Es necesario ampliar la paginación.', 'ATLAS_FLOW_LIMIT');
            return rows;
          }
          rows.push(...pages[i]);
          if (pages[i].length < 1000) return rows;
        }
      }
      return rows;
    }
    async function optional(label, work, fallback) {
      try { return await bounded(work, extraMs); }
      catch (error) {
        // Diagnostics contain no identities, contact data or server messages.
        root.atlasFlowLoadDiagnostic = { status: 'partial', component: label, code: String(error.code || 'read_failed') };
        return fallback;
      }
    }
    async function list(c) {
      const rows = (await bounded(signal => contacts(c, signal), primaryMs))
        .filter(row => String(row.metadata?.workflow || '') !== 'appointment_cancellation_rebook');
      if (!rows.length) return [];
      const [people, audit, display] = await Promise.all([
        optional('actors', signal => profiles(rows.map(row => row.updated_by), c, signal), []),
        optional('history', signal => read(() => scoped('lead_activities', 'lead_id,metadata,created_at', c)
          .order('created_at', { ascending: false }).limit(5000), signal), []),
        optional('labels', signal => typeof hydrate === 'function' ? hydrate(db, c, rows, { signal }) : rows, rows)
      ]);
      const names = new Map(people.map(row => [row.user_id, row.full_name])), latest = new Map();
      for (const row of audit) if (!latest.has(row.lead_id)) latest.set(row.lead_id, row);
      return display.map(row => ({ ...row,
        last_actor_name: latest.get(row.id)?.metadata?.actor_name || names.get(row.updated_by) || null,
        last_activity_at: latest.get(row.id)?.created_at || row.updated_at
      }));
    }
    async function activities(c, id) {
      if (!id) throw failure('Falta el identificador del contacto.', 'ATLAS_FLOW_ID');
      const [rows, leads] = await bounded(signal => Promise.all([
        read(() => scoped('lead_activities', 'id,lead_id,activity_type,summary,outcome,due_at,completed_at,metadata,created_at,created_by', c)
          .eq('lead_id', id).order('created_at', { ascending: false }).limit(1000), signal),
        read(() => scoped('leads', 'metadata', c).eq('id', id).is('deleted_at', null).limit(1), signal)
      ]), primaryMs);
      if (!leads.length) throw failure('El contacto ya no está disponible.', 'ATLAS_FLOW_NOT_FOUND');
      const labels = { no_answer: 'Llamada registrada: sin respuesta', answered: 'Respuesta registrada: gestionar cita',
        whatsapp_sent: 'WhatsApp marcado como enviado', appointment_booked: 'Cita acordada registrada',
        resume: 'Seguimiento reactivado', reschedule: 'Hora de llamada ajustada' };
      const history = leads[0].metadata?.follow_up?.history, seen = new Set(rows.map(row => row.metadata?.follow_event_at).filter(Boolean));
      const legacy = (Array.isArray(history) ? history : []).filter(item => !seen.has(item.at)).map((item, i) => ({
        id: 'legacy:' + i, lead_id: id, activity_type: 'note', summary: labels[item.event] || 'Seguimiento registrado',
        outcome: item.note, created_at: item.at, created_by: item.actor, metadata: { legacy: true, event: item.event, evidence: 'recorded_in_atlas' }
      }));
      const combined = [...rows, ...legacy];
      const people = await optional('actors', signal => profiles(combined.map(row => row.created_by), c, signal), []);
      const names = new Map(people.map(row => [row.user_id, row.full_name]));
      return combined.map(row => ({ ...row, metadata: { ...row.metadata,
        actor_name: row.metadata?.actor_name || names.get(row.created_by) || (row.created_by ? 'Usuario de Atlas' : 'Integración automática')
      } })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    function invalidate() { revision++; pending.clear(); }
    function load(action, payload = {}) {
      const c = { ...getContext() }, original = scopeKey(c), version = revision;
      if (!c.userId || !c.organizationId || !c.clinicId) return Promise.reject(failure('Vuelve a iniciar sesión.', 'ATLAS_SESSION'));
      const key = JSON.stringify([original, version, action, action === 'leads:activities' ? payload.leadId : null]);
      if (pending.has(key)) return pending.get(key);
      const work = (async () => {
        const data = await (action === 'leads:list' ? list(c) : activities(c, payload.leadId));
        if (scopeKey(getContext()) !== original || revision !== version) throw failure('Los contactos han cambiado durante la carga. Actualiza de nuevo.', 'ATLAS_FLOW_CHANGED');
        return { data, error: null };
      })();
      pending.set(key, work);
      work.finally(() => { if (pending.get(key) === work) pending.delete(key); }).catch(() => {});
      return work;
    }
    return { load, invalidate };
  }
  root.atlasCreateFlowContactLoader = create;
  root.atlasBoundedFlowRead = bounded;
})(globalThis);
