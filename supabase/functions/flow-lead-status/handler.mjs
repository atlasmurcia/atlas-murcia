const MURCIA = '0b741520-b7dc-48a2-9f79-3ef6b74258d4';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleStatusRequest(request, { makeUserDb, makeAdminDb }) {
  const origin = request.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info'
  };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (origin && origin !== 'https://atlasmurcia.github.io') return reply(403, { error: 'origin_not_allowed' });
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, { error: 'session_required' });
  try {
    const text = await request.text();
    if (text.length > 12000) return reply(413, { error: 'request_too_large' });
    let body;
    try { body = JSON.parse(text); } catch { return reply(400, { error: 'invalid_request' }); }
    if (!body || body.clinicId !== MURCIA || !UUID.test(body.organizationId || '') ||
      !Array.isArray(body.leadIds) || body.leadIds.length > 100 ||
      body.leadIds.some(id => typeof id !== 'string' || !UUID.test(id))) {
      return reply(400, { error: 'invalid_scope' });
    }
    const userDb = makeUserDb(authorization);
    const session = await userDb.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (session.error || !session.data?.user?.id) return reply(401, { error: 'session_required' });
    const permission = await userDb.rpc('has_clinic_permission', {
      target_org: body.organizationId, target_clinic: body.clinicId, permission_name: 'patients_read'
    });
    if (permission.error || permission.data !== true) return reply(403, { error: 'clinic_access_required' });
    const ids = [...new Set(body.leadIds)];
    if (!ids.length) return reply(200, { enrollments: [] });
    // Recheck each lead through the caller's existing RLS before any service read.
    const visible = await userDb.from('leads').select('id')
      .eq('organization_id', body.organizationId).eq('clinic_id', body.clinicId)
      .is('deleted_at', null).in('id', ids);
    if (visible.error) return reply(503, { error: 'status_unavailable' });
    const allowed = new Set((visible.data || []).map(item => item.id));
    if (ids.some(id => !allowed.has(id))) return reply(403, { error: 'lead_access_required' });
    const admin = makeAdminDb(), enrollments = [];
    for (let from = 0; from < 10000; from += 1000) {
      const result = await admin.from('whatsapp_ai_lead_pilot_enrollments')
        .select('lead_id,conversation_id,status,enrolled_at,updated_at')
        .eq('organization_id', body.organizationId).eq('clinic_id', body.clinicId)
        .in('lead_id', ids).order('id', { ascending: true }).range(from, from + 999);
      if (result.error) return reply(503, { error: 'status_unavailable' });
      for (const row of result.data || []) {
        if (!allowed.has(row.lead_id)) continue;
        // Explicit response projection: no phone, metadata or message contents.
        enrollments.push({ lead_id: row.lead_id, conversation_id: row.conversation_id,
          status: row.status, enrolled_at: row.enrolled_at, updated_at: row.updated_at });
      }
      if ((result.data || []).length < 1000) return reply(200, { enrollments });
    }
    return reply(503, { error: 'status_unavailable' });
  } catch { return reply(503, { error: 'status_unavailable' }); }
}
