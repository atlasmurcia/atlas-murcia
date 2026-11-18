const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const local = path.join(__dirname, '../changes/flow-contact-performance/atlas-murcia');
const dir = fs.existsSync(local) ? local : path.join(__dirname, '..');
const source = fs.readFileSync(path.join(dir, 'modules/flow-contact-loader.js'), 'utf8');
const scope = { userId: 'synthetic-user', organizationId: 'synthetic-org', clinicId: 'synthetic-clinic' };
const contact = i => ({ id: 'synthetic-' + i, first_name: 'Contacto ficticio', updated_by: 'synthetic-user', updated_at: '2026-11-18T10:00:00Z', metadata: {} });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function fakeDB(respond) {
  const calls = []; let active = 0, maxActive = 0;
  const db = { from(table) {
    const q = { table, filters: [], fields: '', from: 0, to: 999 };
    const builder = {
      select(fields) { q.fields = fields; return this; },
      eq(...args) { q.filters.push(['eq', ...args]); return this; },
      is(...args) { q.filters.push(['is', ...args]); return this; },
      in(...args) { q.filters.push(['in', ...args]); return this; },
      order(...args) { (q.order ||= []).push(args); return this; },
      range(from, to) { Object.assign(q, { from, to }); return this; },
      limit(limit) { q.limit = limit; return this; },
      abortSignal(signal) { q.signal = signal; return this; },
      then(resolve, reject) {
        calls.push(q); active++; maxActive = Math.max(active, maxActive);
        return Promise.race([
          Promise.resolve().then(() => respond(q, calls)),
          new Promise((_, fail) => { if (q.signal) {
            const abort = () => fail(Object.assign(new Error('Aborted'), { code: 'ABORTED' }));
            if (q.signal.aborted) abort(); else q.signal.addEventListener('abort', abort, { once: true });
          } })
        ]).finally(() => active--).then(resolve, reject);
      }
    };
    return builder;
  } };
  return { db, calls, maxActive: () => maxActive, active: () => active };
}
function setup(respond, hydrate, timing) {
  const env = { AbortController, setTimeout, clearTimeout, console };
  vm.createContext(env); vm.runInContext(source, env);
  const fake = fakeDB(respond); let context = { ...scope };
  return { ...fake, env, setContext(c) { context = c; }, loader: env.atlasCreateFlowContactLoader(fake.db, () => context, hydrate, timing) };
}
const baseReply = q => ({ data: q.table === 'leads' ? [contact(1)] : [] });
const tests = [];
const test = (name, run) => tests.push([name, run]);
test('concurrent refreshes share one complete read; the next refresh fetches fresh contacts', async () => {
  const s = setup(async q => { await sleep(5); return baseReply(q); });
  const [a, b] = await Promise.all([s.loader.load('leads:list'), s.loader.load('leads:list')]);
  assert.strictEqual(a, b); assert.equal(s.calls.filter(q => q.table === 'leads').length, 1);
  await s.loader.load('leads:list'); assert.equal(s.calls.filter(q => q.table === 'leads').length, 2);
});
test('paginated list uses at most three concurrent contact pages and preserves order beyond 1000', async () => {
  const all = Array.from({ length: 4250 }, (_, i) => contact(i));
  const s = setup(async q => { await sleep(2); return { data: q.table === 'leads' ? all.slice(q.from, q.to + 1) : [] }; });
  const r = await s.loader.load('leads:list'); assert.equal(r.data.length, all.length);
  assert.deepEqual(Array.from(r.data, r => r.id), all.map(r => r.id));
  for (const q of s.calls.filter(q => q.table === 'leads')) {
    assert(q.filters.some(f => f[1] === 'organization_id' && f[2] === scope.organizationId));
    assert(q.filters.some(f => f[1] === 'clinic_id' && f[2] === scope.clinicId));
    assert(q.filters.some(f => f[1] === 'deleted_at' && f[2] === null)); assert.equal(q.order[1][0], 'id');
  }
  assert(s.maxActive() <= 3);
});
test('one transient read failure retries automatically; denied reads never retry', async () => {
  let attempts = 0;
  const s = setup(q => q.table === 'leads' && attempts++ === 0 ? { error: { message: 'temporary' }, status: 503 } : baseReply(q));
  assert.equal((await s.loader.load('leads:list')).data.length, 1); assert.equal(attempts, 2);
  const denied = setup(() => ({ error: { message: 'denied', code: '42501' }, status: 403 }));
  await assert.rejects(denied.loader.load('leads:list'), /denied/); assert.equal(denied.calls.length, 1);
});
test('a page failure never returns a partial list; failure clears pending work for retry', async () => {
  let fail = true;
  const s = setup(q => q.table === 'leads' ? q.from === 0 ? { data: Array.from({ length: 1000 }, (_, i) => contact(i)) } :
    fail ? { error: { message: 'page failed', code: '42501' } } : { data: [] } : { data: [] });
  await assert.rejects(s.loader.load('leads:list'), /page failed/); fail = false;
  assert.equal((await s.loader.load('leads:list')).data.length, 1000);
});
test('hanging contact reads terminate and abort; a later refresh can succeed', async () => {
  let hang = true;
  const s = setup(q => hang && q.table === 'leads' ? new Promise(() => {}) : baseReply(q), null, { primaryMs: 30, extraMs: 20 });
  await assert.rejects(s.loader.load('leads:list'), e => e.code === 'ATLAS_FLOW_TIMEOUT');
  assert(s.calls[0].signal.aborted); hang = false; assert.equal((await s.loader.load('leads:list')).data.length, 1);
});
test('slow labels and unavailable audit/profiles do not block contacts or invent badge states', async () => {
  let labelSignal;
  const s = setup(q => q.table === 'leads' ? baseReply(q) : new Promise(() => {}),
    async (_, __, rows, options) => { labelSignal = options.signal; await new Promise(() => {}); }, { primaryMs: 40, extraMs: 25 });
  const start = Date.now(), r = await s.loader.load('leads:list');
  assert(Date.now() - start < 200); assert(labelSignal.aborted); assert.equal(r.data.length, 1);
  assert.equal(r.data[0].metadata.whatsapp_ai_pilot, undefined); assert.equal(r.data[0].last_actor_name, null);
});
test('successful labels, audit actor and activity time are preserved', async () => {
  const s = setup(q => ({ data: q.table === 'leads' ? [contact(1)] : q.table === 'profiles' ? [{ user_id: scope.userId, full_name: 'Usuario sintético' }] :
    [{ lead_id: 'synthetic-1', metadata: { actor_name: 'Actor sintético' }, created_at: '2026-11-18T11:00:00Z' }] }),
    async (_, __, rows) => rows.map(r => ({ ...r, metadata: { whatsapp_ai_pilot: { status: 'read' } } })));
  const r = (await s.loader.load('leads:list')).data[0]; assert.equal(r.metadata.whatsapp_ai_pilot.status, 'read');
  assert.equal(r.last_actor_name, 'Actor sintético'); assert.equal(r.last_activity_at, '2026-11-18T11:00:00Z');
});
test('clinic/session switches and writes invalidate in-flight responses', async () => {
  const s = setup(async q => { await sleep(10); return baseReply(q); });
  const p = s.loader.load('leads:list'); s.setContext({ ...scope, clinicId: 'other-synthetic' });
  await assert.rejects(p, e => e.code === 'ATLAS_FLOW_CHANGED');
  const p2 = s.loader.load('leads:list'); s.loader.invalidate();
  await assert.rejects(p2, e => e.code === 'ATLAS_FLOW_CHANGED');
});
test('empty lists avoid supplementary work and cancellation-only contacts remain excluded', async () => {
  const s = setup(() => ({ data: [{ ...contact(1), metadata: { workflow: 'appointment_cancellation_rebook' } }] }));
  assert.equal((await s.loader.load('leads:list')).data.length, 0); assert.equal(s.calls.length, 1);
});
test('individual history loads base queries in parallel, deduplicates legacy events, preserves actor names', async () => {
  const s = setup(async q => { await sleep(2); return { data: q.table === 'leads' ? [{ metadata: { follow_up: { history: [
    { at: '2026-11-18T09:00:00Z', event: 'no_answer', actor: scope.userId },
    { at: '2026-11-18T10:00:00Z', event: 'answered', actor: scope.userId }
  ] } } }] : q.table === 'lead_activities' ? [{ id: 'act-1', created_at: '2026-11-18T10:00:00Z', created_by: scope.userId, metadata: { follow_event_at: '2026-11-18T10:00:00Z' } }] : [{ user_id: scope.userId, full_name: 'Usuario sintético' }] }; });
  const r = await s.loader.load('leads:activities', { leadId: 'synthetic-1' }); assert.equal(r.data.length, 2);
  assert.equal(r.data[1].summary, 'Llamada registrada: sin respuesta'); assert.equal(r.data[1].metadata.actor_name, 'Usuario sintético');
  assert.equal(s.maxActive(), 2);
  for (const q of s.calls.filter(q => q.table !== 'profiles')) assert(q.filters.some(f => f[1] === 'clinic_id'));
});
test('missing contact and absent identifiers are errors, not empty successful histories', async () => {
  const s = setup(() => ({ data: [] }));
  await assert.rejects(s.loader.load('leads:activities', {}), e => e.code === 'ATLAS_FLOW_ID');
  await assert.rejects(s.loader.load('leads:activities', { leadId: 'synthetic-1' }), e => e.code === 'ATLAS_FLOW_NOT_FOUND');
});
test('20000 limit is checked explicitly instead of returning a truncated list', async () => {
  const s = setup(q => ({ data: q.table === 'leads' ? Array.from({ length: 1000 }, (_, i) => contact(q.from + i)) : [] }));
  await assert.rejects(s.loader.load('leads:list'), e => e.code === 'ATLAS_FLOW_LIMIT');
});
test('all inline candidate scripts parse; bridge routes only read actions through the loader', () => {
  const html = fs.readFileSync(path.join(dir, 'atlas.html'), 'utf8');
  let count = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!match[1].includes('src=')) { new vm.Script(match[2]); count++; }
  }
  assert(count > 10);
  assert(html.includes("else if(m.action==='leads:list')result=await flowContactLoader.load"));
  assert(html.includes("else if(m.action==='leads:activities')result=await flowContactLoader.load"));
  if (fs.existsSync(path.join(dir, 'before.html'))) {
    const before = fs.readFileSync(path.join(dir, 'before.html'), 'utf8');
    for (const action of ['leads:create', 'leads:update', 'leads:addActivity']) {
      const line = before.split('\n').find(l => l.includes("else if(m.action==='" + action + "')"));
      assert(html.includes(line), action + ' write unchanged');
    }
  }
});
test('the actual label adapter receives cancellation and launches no follow-on queries after timeout', async () => {
  const env = { AbortController, setTimeout, clearTimeout, console };
  vm.createContext(env); vm.runInContext(source, env);
  vm.runInContext(fs.readFileSync(path.join(dir, 'modules/lead-whatsapp-state.js'), 'utf8'), env);
  const s = fakeDB(baseReply); let receivedSignal, invokes = 0;
  s.db.functions = { invoke: (_, options) => { invokes++; receivedSignal = options.signal;
    return new Promise(resolve => options.signal.addEventListener('abort', () => resolve({ error: { code: 'ABORTED' } }), { once: true }));
  } };
  const loader = env.atlasCreateFlowContactLoader(s.db, () => scope, env.atlasHydrateLeadWhatsappStates, { primaryMs: 100, extraMs: 20 });
  assert.equal((await loader.load('leads:list')).data.length, 1);
  await sleep(0); assert(receivedSignal.aborted); assert.equal(invokes, 1);
  assert(!s.calls.some(q => q.table.startsWith('whatsapp_')));
});
test('actual parent bridge returns correlated responses and rejects an expired session before reading', async () => {
  const html = fs.readFileSync(path.join(dir, 'atlas.html'), 'utf8');
  const start = html.indexOf(" window.addEventListener('message',async e=>{const m=e.data||{};if(m.type==='atlas:central-db-request'){");
  const end = html.indexOf("if(m.type==='atlas:central-module-ready')", start);
  const listener = html.slice(start, end) + '});';
  const s = setup(baseReply); const replies = [];
  s.db.auth = { getSession: async () => ({ data: { session: { user: { id: scope.userId } } } }) };
  Object.assign(s.env, { window: s.env, context: { ...scope }, db: s.db, flowContactLoader: s.loader,
    commissionsFrame: {}, marketingFrame: {}, agendaFrame: {}, fichaFrame: {},
    addEventListener: (_, fn) => { s.env.onMessage = fn; } });
  vm.runInContext(listener, s.env);
  await s.env.onMessage({ data: { type: 'atlas:central-db-request', requestId: 'synthetic-request', action: 'leads:list' },
    source: { postMessage: m => replies.push(m) } });
  await sleep(0); assert.equal(replies[0].requestId, 'synthetic-request'); assert.equal(replies[0].ok, true);
  assert.equal(replies[0].data.length, 1);
  s.db.auth.getSession = async () => ({ data: { session: null } });
  const readCount = s.calls.length;
  await s.env.onMessage({ data: { type: 'atlas:central-db-request', requestId: 'expired-request', action: 'leads:list' },
    source: { postMessage: m => replies.push(m) } });
  assert.equal(replies.at(-1).code, 'ATLAS_SESSION'); assert.equal(s.calls.length, readCount);
});
(async () => { for (const [name, run] of tests) { await run(); console.log('OK ' + name); } console.log(tests.length + ' synthetic test groups passed; no production connections.'); })().catch(error => { console.error(error); process.exitCode = 1; });
