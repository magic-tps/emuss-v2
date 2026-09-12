import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const env = {};
for (const file of ['.env.local', '.env.deploy']) for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
  const index = line.indexOf('='); if (index > 0 && !line.startsWith('#')) env[line.slice(0, index)] = line.slice(index + 1);
}
const url = env.SUPABASE_URL;
if (new URL(url).hostname !== 'vaduqtdiecmmxhmlycay.supabase.co') throw new Error('This integration test is scoped to the EMUSS project.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, options);
const anon = createClient(url, env.VITE_SUPABASE_ANON_KEY, options);
const unwrap = async promise => { const { data, error } = await promise; if (error) throw error; return data; };
const report = { date: new Date().toISOString(), project: 'vaduqtdiecmmxhmlycay', passed: [], cleanup: false };
const run = async (name, operation) => { await operation(); report.passed.push(name); console.log(`PASS ${name}`); };
const users = [], clients = [], reservationIds = [];
const fixture = { venue: randomUUID(), pool: randomUUID(), lanes: [randomUUID(), randomUUID()], slot: randomUUID() };
let channel;
try {
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await unwrap(service.from('venues').insert({ id: fixture.venue, name: 'EMUSS integración temporal', address: 'Prueba automática' }));
  await unwrap(service.from('pools').insert({ id: fixture.pool, venue_id: fixture.venue, name: 'Piscina de integración' }));
  await unwrap(service.from('lanes').insert(fixture.lanes.map((id, i) => ({ id, pool_id: fixture.pool, number: i + 1 }))));
  await unwrap(service.from('time_slots').insert({ id: fixture.slot, pool_id: fixture.pool, date: day, start_time: '08:00', end_time: '09:00', starts_at: `${day}T08:00:00-05:00`, ends_at: `${day}T09:00:00-05:00`, price: 15 }));
  await run('Supabase Auth OTP verification', async () => {
    for (let i = 0; i < 2; i++) {
      const email = `emuss-${randomUUID()}@example.com`;
      const generated = await unwrap(service.auth.admin.generateLink({ type: 'magiclink', email }));
      users.push({ id: generated.user.id, email });
      const client = createClient(url, env.VITE_SUPABASE_ANON_KEY, options); clients.push(client);
      const verified = await unwrap(client.auth.verifyOtp({ email, token: generated.properties.email_otp, type: 'email' }));
      assert.equal(verified.user.id, generated.user.id); assert.ok(verified.user.email_confirmed_at);
    }
  });
  await run('Public catalog and real availability', async () => { const data = await unwrap(anon.rpc('get_availability', { p_date: day, p_pool_id: fixture.pool })); assert.equal(data.length, 2); assert.ok(data.every(row => row.status === 'AVAILABLE')); });
  let signal;
  const event = new Promise(resolve => { signal = resolve; });
  channel = anon.channel(`emuss-integration-${randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'availability_events', filter: `pool_id=eq.${fixture.pool}` }, () => signal());
  await run('Realtime subscription accepted', async () => {
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Realtime subscription timeout')), 20000); channel.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timeout); reject(new Error(`Realtime ${status}`)); } }); });
  });
  let hold, winner;
  await run('Concurrent HTTP holds have exactly one winner', async () => { const results = await Promise.all(clients.map(client => client.rpc('acquire_hold', { p_lane_id: fixture.lanes[0], p_time_slot_id: fixture.slot }))); assert.equal(results.filter(result => !result.error).length, 1); winner = results.findIndex(result => !result.error); hold = results[winner].data; });
  await run('Realtime broadcasts actual inventory change', async () => { let timeout; try { await Promise.race([event, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Realtime event not received')), 20000); })]); } finally { clearTimeout(timeout); } });
  const profile = { dni: String(70000000 + Math.floor(Math.random() * 999999)), first_name: 'Prueba', last_name: 'Integración', phone: '999999999', email: users[winner].email };
  let reservation;
  await run('Concurrent HTTP confirmations create one reservation', async () => { const results = await Promise.all([0, 1].map(() => clients[winner].rpc('confirm_reservation', { p_hold_id: hold.id, p_profile: profile }))); assert.equal(results.filter(result => !result.error).length, 1); reservation = results.find(result => !result.error).data; reservationIds.push(reservation.id); });
  await run('RLS protects booking and internal queue through PostgREST', async () => { const other = await unwrap(clients[1 - winner].from('reservations').select('id').eq('id', reservation.id)); assert.equal(other.length, 0); assert.ok((await anon.rpc('claim_notifications', { p_limit: 1 })).error); assert.ok((await clients[winner].rpc('claim_notifications', { p_limit: 1 })).error); });
  await run('Cancellation updates authoritative availability', async () => { await unwrap(clients[winner].rpc('cancel_reservation', { p_reservation_id: reservation.id })); const rows = await unwrap(anon.rpc('get_availability', { p_date: day, p_pool_id: fixture.pool })); assert.equal(rows.find(row => row.lane_id === fixture.lanes[0]).status, 'AVAILABLE'); });
  await run('Outbox persists confirmation and cancellation', async () => { const rows = await unwrap(service.from('notifications').select('kind,status,reservation_snapshot').eq('reservation_id', reservation.id)); assert.equal(rows.length, 2); assert.ok(rows.every(row => row.status === 'PENDING' && row.reservation_snapshot.reservation_code === reservation.reservation_code)); });
  await run('Edge Functions reject unauthenticated requests', async () => { for (const name of ['staff-invite', 'dispatch-notifications']) { const result = await fetch(`${url}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.ok([401,403].includes(result.status), `${name}: ${result.status}`); } });
} finally {
  if (channel) await anon.removeChannel(channel);
  const ids = users.map(user => user.id);
  if (ids.length) {
    const allReservations = await unwrap(service.from('reservations').select('id').in('user_id', ids));
    const allIds = allReservations.map(row => row.id);
    if (allIds.length) await unwrap(service.from('check_ins').delete().in('reservation_id', allIds));
    await unwrap(service.from('notifications').delete().in('user_id', ids));
    await unwrap(service.from('reservation_holds').delete().in('user_id', ids));
    await unwrap(service.from('audit_logs').delete().in('admin_id', ids));
    await unwrap(service.from('reservations').delete().in('user_id', ids));
    await unwrap(service.from('user_roles').delete().in('user_id', ids));
    for (const user of users) await unwrap(service.auth.admin.deleteUser(user.id));
  }
  await unwrap(service.from('availability_events').delete().eq('pool_id', fixture.pool));
  await unwrap(service.from('time_slots').delete().eq('pool_id', fixture.pool));
  await unwrap(service.from('lanes').delete().eq('pool_id', fixture.pool));
  await unwrap(service.from('pools').delete().eq('id', fixture.pool));
  await unwrap(service.from('venues').delete().eq('id', fixture.venue));
  for (const client of clients) await client.auth.signOut();
  report.cleanup = true;
  await mkdir('docs', { recursive: true });
  await writeFile('docs/supabase-integration.json', JSON.stringify(report, null, 2));
  console.log(`Removed temporary test data. ${report.passed.length} hosted checks passed.`);
}
