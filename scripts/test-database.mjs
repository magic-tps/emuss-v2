import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const directory = await mkdtemp(join(tmpdir(), 'emuss-postgres-'));
const port = 55432;
const database = new EmbeddedPostgres({ databaseDir: join(directory, 'db'), port, user: 'postgres', password: randomUUID(), persistent: false, onLog: () => {}, onError: message => { if (/error|fatal/i.test(String(message))) console.error(message); } });
let root;
let passed = 0;
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const users = Array.from({ length: 9 }, () => randomUUID());
async function asUser(id, sql, args = [], role = 'authenticated') {
  const client = new pg.Client(root.connectionParameters);
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [id || '']);
    const result = await client.query(sql, args);
    await client.query('commit');
    return result.rows[0]?.result;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { await client.end(); }
}
const call = (user, name, args = []) => asUser(user, `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args);
const profile = i => ({ dni: String(10000000 + i), first_name: 'Cliente', last_name: `Prueba ${i}`, phone: '999999999', email: `client${i}@example.test` });
try {
  await database.initialise(); await database.start();
  root = database.getPgClient(); await root.connect();
  await root.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema extensions; grant usage on schema auth,extensions to anon,authenticated,service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create publication supabase_realtime; set search_path=public,extensions;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await root.query(await readFile(join('supabase/migrations', file), 'utf8'));
    console.log(`Migrated ${file}`);
  }
  await root.query(await readFile('supabase/seed.sql', 'utf8'));
  for (const [i, id] of users.entries()) await root.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, profile(i).email]);
  const venues = (await root.query('select * from public.venues order by id')).rows;
  const pools = (await root.query('select * from public.pools order by id')).rows;
  const lanes = (await root.query('select * from public.lanes where pool_id=$1 order by number', [pools[0].id])).rows;
  const slots = (await root.query("select * from public.time_slots where pool_id=$1 and date=(now() at time zone 'America/Lima')::date+1 order by start_time", [pools[0].id])).rows;
  await root.query("insert into public.user_roles(user_id,role,venue_id) values($1,'SUPER_ADMIN',null),($2,'VENUE_ADMIN',$4),($3,'RECEPTIONIST',$4)", [users[6], users[7], users[8], venues[0].id]);
  const holds = await Promise.allSettled([call(users[0], 'acquire_hold', [lanes[0].id, slots[0].id]), call(users[1], 'acquire_hold', [lanes[0].id, slots[0].id])]);
  await check('two concurrent users: exactly one hold', () => assert.equal(holds.filter(r => r.status === 'fulfilled').length, 1));
  const winner = holds.findIndex(r => r.status === 'fulfilled'); const hold = holds[winner].value;
  const confirmations = await Promise.allSettled([call(users[winner], 'confirm_reservation', [hold.id, profile(winner)]), call(users[winner], 'confirm_reservation', [hold.id, profile(winner)])]);
  await check('simultaneous confirmation: exactly one reservation', () => assert.equal(confirmations.filter(r => r.status === 'fulfilled').length, 1));
  const reservation = confirmations.find(r => r.status === 'fulfilled').value;
  await check('another user cannot reserve confirmed lane', () => assert.rejects(call(users[2], 'acquire_hold', [lanes[0].id, slots[0].id]), /LANE_UNAVAILABLE/));
  const sameUser = await Promise.allSettled([call(users[2], 'acquire_hold', [lanes[1].id, slots[1].id]), call(users[2], 'acquire_hold', [lanes[2].id, slots[1].id])]);
  await check('same user concurrent lanes: one hold only', () => assert.equal(sameUser.filter(r => r.status === 'fulfilled').length, 1));
  const h2 = sameUser.find(r => r.status === 'fulfilled').value;
  await check('hold is bound to authenticated owner', () => assert.rejects(call(users[3], 'confirm_reservation', [h2.id, profile(3)]), /HOLD_NOT_OWNED/));
  await root.query("update public.reservation_holds set expires_at=now()-interval '1 second' where id=$1", [h2.id]);
  await check('expired hold cannot confirm', () => assert.rejects(call(users[2], 'confirm_reservation', [h2.id, profile(2)]), /HOLD_EXPIRED/));
  await check('expired hold appears available immediately', async () => {
    const inventory = await call(null, 'get_availability', [slots[1].date, pools[0].id]);
    assert.equal(inventory.find(x => x.lane_id === h2.lane_id && x.time_slot_id === h2.time_slot_id).status, 'AVAILABLE');
  });
  await check('cancellation releases lane for new reservation', async () => { await call(users[winner], 'cancel_reservation', [reservation.id]); const h = await call(users[3], 'acquire_hold', [lanes[0].id, slots[0].id]); await call(users[3], 'confirm_reservation', [h.id, profile(3)]); });
  const maint = await call(users[7], 'create_maintenance', [pools[0].id, [lanes[3].id], slots[2].starts_at, slots[2].ends_at, 'Limpieza preventiva']);
  await check('maintenance rejects hold', () => assert.rejects(call(users[4], 'acquire_hold', [lanes[3].id, slots[2].id]), /MAINTENANCE/));
  await check('maintenance cannot replace existing reservation', () => assert.rejects(call(users[7], 'create_maintenance', [pools[0].id, null, slots[0].starts_at, slots[0].ends_at, 'Limpieza preventiva']), /MAINTENANCE_CONFLICT/));
  await call(users[7], 'remove_maintenance', [maint[0].id]);
  await check('RLS hides other customers reservations', async () => assert.equal(await asUser(users[4], 'select count(*)::int result from public.reservations'), 0));
  await check('direct table writes are denied', () => assert.rejects(asUser(users[4], "update public.reservations set status='CANCELLED' returning id result"), /permission denied/));
  await check('private reservation helpers cannot be executed by customer', () => assert.rejects(asUser(users[4], 'select private.reservation_json($1) result', [reservation.id]), /permission denied/));
  await check('reception cannot mutate configuration', () => assert.rejects(call(users[8], 'admin_save', ['venues', { name: 'Forbidden' }]), /FORBIDDEN/));
  await check('venue admin cannot manage another venue', () => assert.rejects(call(users[7], 'create_maintenance', [pools[1].id, null, slots[2].starts_at, slots[2].ends_at, 'Fuera de sede']), /FORBIDDEN/));
  await check('last super admin cannot be disabled', () => assert.rejects(call(users[6], 'set_staff_role', [users[6], 'SUPER_ADMIN', null, false]), /LAST_SUPER_ADMIN/));
  await check('catalog accessible anonymously without PII', async () => { const catalog = await asUser(null, 'select public.get_catalog() result', [], 'anon'); assert.equal(catalog.venues.length, 3); assert.ok(!JSON.stringify(catalog).includes('client')); });
  await check('admin list and filters honor venue', async () => { const list = await call(users[7], 'admin_list', ['venues']); assert.equal(list.length, 1); const page = await call(users[7], 'admin_reservations', [slots[0].date, slots[0].date]); assert.ok(page.rows.every(r => r.venue_id === venues[0].id)); });
  await check('dashboard computes data', async () => { const report = await call(users[6], 'admin_dashboard', [slots[0].date, slots[0].date]); assert.ok(report.kpis.occupancy > 0); assert.equal(report.venues.length, 3); });
  await check('customer history supports full date span', async () => { const page = await call(users[7], 'admin_reservations', ['2000-01-01', '2100-12-31', null, null, null, null, '', 25, 0, users[3]]); assert.ok(page.total > 0); assert.ok(page.rows.every(r => r.user_id === users[3])); });
  await check('settings save accepts singleton id', async () => { const s = await call(users[6], 'admin_save', ['settings', { id: 1, cancellation_hours: 3 }]); assert.equal(s.cancellation_hours, 3); });
  await check('slot regeneration preserves reservations', async () => { await call(users[7], 'generate_time_slots', [pools[0].id, slots[0].date, slots[0].date]); assert.equal((await root.query('select active from public.time_slots where id=$1', [slots[0].id])).rows[0].active, true); });
  await check('notification claims are private and leased', async () => { await assert.rejects(call(users[0], 'claim_notifications', [10]), /permission denied/); const a = await asUser(null, 'select public.claim_notifications(10) result', [], 'service_role'); assert.ok(a.length > 0); const b = await asUser(null, 'select public.claim_notifications(10) result', [], 'service_role'); assert.equal(b.length, 0); });
  await check('cross-venue overlap is rejected for same user', async () => {
    const otherLane = (await root.query('select id from public.lanes where pool_id=$1 limit 1', [pools[1].id])).rows[0].id;
    const otherSlot = (await root.query('select id from public.time_slots where pool_id=$1 and starts_at=$2', [pools[1].id, slots[0].starts_at])).rows[0].id;
    await assert.rejects(call(users[3], 'acquire_hold', [otherLane, otherSlot]), /USER_OVERLAP/);
  });
  await check('concurrent maintenance vs hold has exactly one winner', async () => {
    const attempts = await Promise.allSettled([call(users[4], 'acquire_hold', [lanes[5].id, slots[4].id]), call(users[7], 'create_maintenance', [pools[0].id, [lanes[5].id], slots[4].starts_at, slots[4].ends_at, 'Carrera concurrente'])]);
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
  });
  await check('reschedule moves inventory atomically', async () => {
    const current = (await call(users[3], 'my_reservations')).find(r => r.status === 'CONFIRMED');
    const updated = await call(users[3], 'reschedule_reservation', [current.id, lanes[4].id, slots[3].id]);
    assert.equal(updated.time_slot_id, slots[3].id);
    const inventory = await call(null, 'get_availability', [slots[0].date, pools[0].id]);
    assert.equal(inventory.find(x => x.lane_id === lanes[0].id && x.time_slot_id === slots[0].id).status, 'AVAILABLE');
  });
  await check('check-in idempotency and scheduled no-show completion', async () => {
    const day = (await root.query("select (now() at time zone 'America/Lima')::date d")).rows[0].d;
    // Use an isolated pool with sub-minute slots to avoid wall-clock hour boundary flakes.
    const p = randomUUID(), l = randomUUID();
    await root.query("insert into public.pools(id,venue_id,name) values($1,$2,'Test jobs pool')", [p, venues[0].id]);
    await root.query('insert into public.lanes(id,pool_id,number) values($1,$2,1)', [l, p]);
    const s = (await root.query("insert into public.time_slots(pool_id,date,start_time,end_time,starts_at,ends_at,price) select $1,(a at time zone 'America/Lima')::date,(a at time zone 'America/Lima')::time,(b at time zone 'America/Lima')::time,a,b,0 from (select date_trunc('second',now())-interval '1 second' a,date_trunc('second',now())+interval '30 seconds' b) x returning id", [p])).rows[0];
    const r = (await root.query('insert into public.reservations(user_id,lane_id,time_slot_id) values($1,$2,$3) returning reservation_code', [users[5], l, s.id])).rows[0];
    const checked = await call(users[8], 'check_in_reservation', [r.reservation_code]);
    assert.equal(checked.status, 'CHECKED_IN');
    await call(users[8], 'check_in_reservation', [r.reservation_code]);
    assert.equal((await root.query('select count(*)::int n from public.check_ins where reservation_id=$1', [checked.id])).rows[0].n, 1);
    const oldSlots = (await root.query("insert into public.time_slots(pool_id,date,start_time,end_time,starts_at,ends_at,price) select $1,$2::date-1,make_time(h,0,0),make_time(h+1,0,0),($2::date-1+make_time(h,0,0)) at time zone 'America/Lima',($2::date-1+make_time(h+1,0,0)) at time zone 'America/Lima',0 from generate_series(8,9) h returning id", [p, day])).rows;
    await root.query("insert into public.reservations(user_id,lane_id,time_slot_id,status) values($1,$2,$3,'CONFIRMED'),($1,$2,$4,'CHECKED_IN')", [users[5], l, oldSlots[0].id, oldSlots[1].id]);
    await asUser(null, 'select public.process_reservation_jobs() result', [], 'service_role');
    const states = (await root.query('select status from public.reservations where time_slot_id=any($1::uuid[]) order by starts_at', [oldSlots.map(x => x.id)])).rows.map(x => x.status);
    assert.deepEqual(states, ['NO_SHOW', 'COMPLETED']);
  });
  console.log(`\n${passed} PostgreSQL integration checks passed.`);
} finally { if (root) await root.end(); await database.stop(); }
