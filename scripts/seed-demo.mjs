import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Demo seed is only allowed against local Supabase.');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
if (!key || !password || password.length < 12) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD (12+ characters).');
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: venues, error } = await db.from('venues').select('*').order('name');
if (error || !venues?.length) throw error || new Error('Run supabase db reset first.');
const accounts = [['super', 'SUPER_ADMIN'], ['sede', 'VENUE_ADMIN'], ['recepcion', 'RECEPTIONIST'], ['nadador1', null], ['nadador2', null], ['nadador3', null]];
const users = [];
for (const [index, [name, role]] of accounts.entries()) {
  const email = `${name}@emuss.local`;
  const { data, error: createError } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'Demo', last_name: name } });
  if (createError) throw createError; // Run on a freshly reset local database; never change existing users silently.
  const user = data.user;
  const { error: profileError } = await db.from('profiles').update({ dni: String(90000000 + index), phone: '+51999999999' }).eq('id', user.id);
  if (profileError) throw profileError;
  if (role) {
    const { error: roleError } = await db.from('user_roles').insert({ user_id: user.id, role, venue_id: role === 'SUPER_ADMIN' ? null : venues[0].id });
    if (roleError) throw roleError;
  }
  users.push(user);
  console.log(`Created ${email}${role ? ` (${role})` : ''}`);
}
const { data: pools } = await db.from('pools').select('*').eq('venue_id', venues[0].id);
const pool = pools[0];
const { data: lanes } = await db.from('lanes').select('*').eq('pool_id', pool.id).order('number');
const { data: slots } = await db.from('time_slots').select('*').eq('pool_id', pool.id).gt('starts_at', new Date().toISOString()).order('starts_at').limit(2);
for (let i = 0; i < 2; i++) {
  const { error: reserveError } = await db.from('reservations').insert({ user_id: users[i + 3].id, lane_id: lanes[i].id, time_slot_id: slots[0].id });
  if (reserveError) throw reserveError;
}
const { data: checked, error: checkedError } = await db.from('reservations').insert({ user_id: users[5].id, lane_id: lanes[2].id, time_slot_id: slots[0].id, status: 'CHECKED_IN' }).select().single();
if (checkedError) throw checkedError;
await db.from('check_ins').insert({ reservation_id: checked.id, checked_in_by: users[2].id });
await db.from('maintenance_blocks').insert({ venue_id: venues[0].id, pool_id: pool.id, lane_id: lanes[3].id, starts_at: slots[0].starts_at, ends_at: slots[0].ends_at, reason: 'Mantenimiento de demostración', created_by: users[0].id });
console.log('Demo inventory created in PostgreSQL. Password is the DEMO_PASSWORD you supplied.');
