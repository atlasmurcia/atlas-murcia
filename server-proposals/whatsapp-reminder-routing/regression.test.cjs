// Offline: no red, claves, mensajes reales ni datos de producción.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { stripTypeScriptTypes } = require('node:module');
const { spawnSync } = require('node:child_process');

const baseline = process.env.WEBHOOK_BASELINE;
assert.ok(baseline, 'Indica WEBHOOK_BASELINE con los dos archivos originales de la versión 22');
const manifest = require('./baseline.json');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-wa-test-'));
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));
for (const [name, hash] of Object.entries(manifest.files_sha256)) {
  const bytes = fs.readFileSync(path.join(baseline, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `La base de ${name} ha cambiado; revisar antes de aplicar`);
  fs.writeFileSync(path.join(temp, name), bytes);
}
const applied = spawnSync('patch', ['-p1', '--batch', '--forward', '--fuzz=0', '-i', path.join(__dirname, 'whatsapp-webhook.patch')], { cwd: temp, encoding: 'utf8' });
assert.equal(applied.status, 0, applied.stdout + applied.stderr);
const helper = fs.readFileSync(path.join(temp, 'reminder-confirmation.mjs'), 'utf8').replace(/^export /gm, '');
const source = stripTypeScriptTypes(fs.readFileSync(path.join(temp, 'index.ts'), 'utf8').replace(/^import .*;\n/gm, ''));
// Compilar el archivo entero detecta errores de sintaxis además de ejercitar los manejadores.
new vm.Script(source);

function setup({ state = 'awaiting_rebook', expired = false } = {}) {
  const iso = offset => new Date(Date.now() + offset).toISOString();
  const clinic = 'test-clinic', patientId = 'test-patient', phone = '34000000000';
  const appt = { id: 'test-appointment', clinic_id: clinic, patient_id: patientId, starts_at: iso(86400000), status: 'scheduled', deleted_at: null, metadata: {} };
  const tables = {
    patients: [{ id: patientId, clinic_id: clinic, phone, first_name: 'Prueba', deleted_at: null }],
    appointments: [appt],
    appointment_reminder_jobs: [{ id: 'test-job', clinic_id: clinic, patient_id: patientId, phone, status: 'sent', sent_at: iso(-60000), appointment_id: appt.id, appointment_starts_at: appt.starts_at, provider_message_id: 'test-reminder', appointment: appt }],
    whatsapp_appointment_options: [], leads: [{ id: 'test-lead', clinic_id: clinic, organization_id: 'test-org', deleted_at: null }],
    patient_communications: [], atlas_internal_tasks: [], whatsapp_conversations: []
  };
  const writes = [], sent = [], booking = [];
  const db = { from(table) {
    assert.ok(tables[table], `Tabla inesperada: ${table}`);
    const filters = []; let patch, inserted, max = Infinity, sort, single = false;
    const q = {
      select() { return this; },
      eq(k,v) { filters.push(r => r[k] === v); return this; },
      is(k,v) { filters.push(r => (r[k] ?? null) === v); return this; },
      in(k,v) { filters.push(r => v.includes(r[k])); return this; },
      gt(k,v) { filters.push(r => r[k] > v); return this; },
      gte(k,v) { filters.push(r => r[k] >= v); return this; },
      not(k,op,v) { assert.equal(op,'in'); const excluded = v.slice(1,-1).split(','); filters.push(r => !excluded.includes(r[k])); return this; },
      contains(k,v) { filters.push(r => Object.entries(v).every(([a,b]) => r[k]?.[a] === b)); return this; },
      order(k,o) { sort = [k,o.ascending]; return this; },
      limit(n) { max = n; return this; },
      update(v) { patch = v; return this; }, insert(v) { inserted = v; return this; },
      maybeSingle() { single = true; return this; }, single() { single = true; return this; },
      then(resolve,reject) { return Promise.resolve().then(() => {
        let rows = tables[table].filter(r => filters.every(f => f(r)));
        if (sort) rows.sort((a,b) => (a[sort[0]] < b[sort[0]] ? -1 : a[sort[0]] > b[sort[0]] ? 1 : 0) * (sort[1] ? 1 : -1));
        rows = rows.slice(0,max);
        if (patch) for (const row of rows) { writes.push({ table, id: row.id, patch }); Object.assign(row, patch); }
        if (inserted) { const row = { id: 'test-created', ...inserted }; tables[table].push(row); writes.push({table, patch: inserted}); rows = [row]; }
        return { data: single ? rows[0] || null : rows, error: null };
      }).then(resolve,reject); }
    }; return q;
  }};
  const sandbox = vm.createContext({ createClient: () => db, Deno: { env: { get: () => '' }, serve() {} }, console, Date, Intl, sent, booking });
  vm.runInContext(helper + '\n' + source + '\n' + `
    sendText = async (_c,_v,text) => sent.push(text);
    sendInteractiveSlots = async () => sent.push('TEST_SLOTS');
    rebookSlots = async () => [];
    bookSelectedOption = async () => booking.push('booked');
    globalThis.api = { handleInboundAutomations, reminderJobsDuringRebook, reminderResponseKind, isActiveRebook };
  `, sandbox);
  const conversation = { id: 'test-conversation', patient_id: patientId, contact_phone: phone, metadata: state ? { rebook: { state, leadId: 'test-lead', appointmentId: 'test-old-cancelled', expiresAt: iso(expired ? -60000 : 86400000) } } : {} };
  const connection = { clinic_id: clinic, organization_id: 'test-org' };
  const inbound = (body, contextId, buttonId) => ({ id: 'test-inbound', body, payload: { text: { body }, ...(contextId ? { context: { id: contextId } } : {}), ...(buttonId ? { interactive: { button_reply: { title: body, id: buttonId } } } : {}) } });
  return { api: sandbox.api, tables, sent, writes, booking, appt, conversation, connection, inbound, iso, run(body, ctx, button) { const m = inbound(body,ctx,button); return sandbox.api.handleInboundAutomations(connection, conversation, m, m.payload); } };
}

for (const text of ['Confirmar', 'He confirmado', 'Confirmo']) test(`${text}: confirma pese a reagendación pendiente`, async () => {
  const f = setup(); await f.run(text);
  assert.equal(f.appt.metadata.whatsappConfirmationStatus, 'confirmed');
  assert.equal(f.sent.length,1); assert.match(f.sent[0], /Gracias por confirmar/);
  assert.equal(f.conversation.metadata.rebook.state,'awaiting_rebook');
  assert.ok(!f.writes.some(w => w.patch.status === 'cancelled' || w.patch.starts_at));
});
test('botón del recordatorio prevalece y no confirma otra cita del mismo día', async () => {
  const f = setup(); const other = { ...f.appt, id: 'test-other', starts_at: new Date(Date.parse(f.appt.starts_at)+3600000).toISOString(), metadata: {} }; f.tables.appointments.push(other);
  await f.run('Confirmar', 'test-reminder', 'confirmar-cita');
  assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed'); assert.equal(other.metadata.whatsappConfirmationStatus,undefined);
});
test('No confirmar vinculado al recordatorio informa a recepción sin cancelar', async () => {
  const f = setup(); await f.run('No confirmar','test-reminder','no-confirmar-cita');
  assert.equal(f.appt.metadata.whatsappConfirmationStatus,'not_confirmed'); assert.equal(f.appt.status,'scheduled');
  assert.equal(f.tables.atlas_internal_tasks.length,1); assert.equal(f.sent.length,1); assert.match(f.sent[0],/informado a recepción/);
});
for (const text of ['NO', 'Cancelar', 'Reagendar', 'Quiero cambiar', 'No confirmo']) test(`${text}: no confirma por error`, async () => {
  const f = setup(); await f.run(text);
  assert.equal(f.appt.metadata.whatsappConfirmationStatus,undefined);
});
for (const text of ['OK', 'Sí', 'Vale']) test(`${text} sin contexto conserva la reagendación`, async () => {
  const f = setup(); f.tables.appointments.push({ id: 'test-old-cancelled', clinic_id: f.connection.clinic_id, status: 'cancelled' }); await f.run(text);
  assert.deepEqual(f.sent,['TEST_SLOTS']); assert.equal(f.appt.metadata.whatsappConfirmationStatus,undefined);
});
test('NO continúa pidiendo el motivo, no confirma', async () => {
  const f = setup(); await f.run('NO'); assert.equal(f.sent.length,1); assert.match(f.sent[0],/motivo/);
});
test('OK con contexto exacto del recordatorio sí confirma', async () => {
  const f = setup(); await f.run('OK','test-reminder'); assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed');
});
for (const kind of ['cancelled','completed','deleted','past','foreign-patient','foreign-phone','foreign-clinic','old-reminder','unknown-context']) test(`No atraviesa reagendación con ${kind}`, async () => {
  const f = setup(); const job=f.tables.appointment_reminder_jobs[0];
  if (['cancelled','completed'].includes(kind)) f.appt.status=kind;
  if (kind==='deleted') f.appt.deleted_at=f.iso(-1000);
  if (kind==='past') f.appt.starts_at=job.appointment_starts_at=f.iso(-1000);
  if (kind==='foreign-patient') job.patient_id=f.appt.patient_id='test-other-patient';
  if (kind==='foreign-phone') job.phone='34000000001';
  if (kind==='foreign-clinic') job.clinic_id='test-other-clinic';
  if (kind==='old-reminder') job.sent_at=f.iso(-49*3600000);
  await f.run('Confirmar',kind==='unknown-context' ? 'test-unknown' : undefined);
  assert.equal(f.appt.metadata.whatsappConfirmationStatus,undefined);
});
test('una reserva seleccionada conserva CONFIRMO para la reserva', async () => {
  const f=setup(); f.tables.whatsapp_appointment_options.push({ id:'test-option',clinic_id:f.connection.clinic_id,conversation_id:f.conversation.id,status:'selected',expires_at:f.iso(3600000),contact_phone:f.conversation.contact_phone,lead_id:'test-lead' });
  Object.assign(f.tables.leads[0], { first_name:'Prueba',last_name:'Sintetica',notes:'Consulta de prueba' });
  await f.run('CONFIRMO'); assert.deepEqual(f.booking,['booked']); assert.equal(f.appt.metadata.whatsappConfirmationStatus,undefined);
});
test('contexto de un recordatorio permite confirmar aunque haya una opción seleccionada', async () => {
  const f=setup(); f.tables.whatsapp_appointment_options.push({ id:'test-option',clinic_id:f.connection.clinic_id,conversation_id:f.conversation.id,status:'selected',expires_at:f.iso(3600000) });
  await f.run('Confirmar','test-reminder','confirmar-cita'); assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed'); assert.equal(f.booking.length,0);
});
for (const state of [null,'closed']) test(`confirmación sin reagendación activa (${state})`, async () => {
  const f=setup({state}); await f.run('Confirmar'); assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed'); assert.equal(f.sent.length,1);
});
test('una reagendación caducada ya no bloquea la confirmación', async () => {
  const f=setup({expired:true}); await f.run('He confirmado'); assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed'); assert.equal(f.sent.length,1);
});
test('teléfono sin paciente vinculado: exige coincidencia única', async () => {
  const f=setup(); delete f.conversation.patient_id; await f.run('Confirmar'); assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed');
  const g=setup(); delete g.conversation.patient_id; g.tables.patients.push({...g.tables.patients[0],id:'test-duplicate'}); await g.run('Confirmar'); assert.equal(g.appt.metadata.whatsappConfirmationStatus,undefined);
});
test('un error de lectura impide enviar respuestas o marcar la cita', async () => {
  const f=setup(); f.tables.whatsapp_appointment_options=null;
  await assert.rejects(f.run('Confirmar'),/Tabla inesperada/); assert.equal(f.sent.length,0); assert.equal(f.writes.length,0);
});
for (const state of ['awaiting_slot','awaiting_reason']) test(`confirmación explícita durante ${state}`, async () => {
  const f=setup({state}); await f.run('He confirmado'); assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed'); assert.equal(f.sent.length,1); assert.equal(f.conversation.metadata.rebook.state,state);
});
test('REAGENDAR sigue ofreciendo horarios', async () => {
  const f=setup(); await f.run('REAGENDAR'); assert.deepEqual(f.sent,['TEST_SLOTS']); assert.equal(f.appt.metadata.whatsappConfirmationStatus,undefined);
});
test('una pregunta con la palabra confirmar no se convierte en confirmación', async () => {
  const f=setup(); await f.run('¿Me puedes confirmar otra hora?'); assert.equal(f.appt.metadata.whatsappConfirmationStatus,undefined);
});
test('contexto exacto sin reagendación tampoco confirma otra cita del mismo día', async () => {
  const f=setup({state:null}); const other={...f.appt,id:'test-other',metadata:{}};f.tables.appointments.push(other);
  await f.run('Confirmar','test-reminder','confirmar-cita');assert.equal(f.appt.metadata.whatsappConfirmationStatus,'confirmed');assert.equal(other.metadata.whatsappConfirmationStatus,undefined);
});
