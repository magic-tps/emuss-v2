import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
const env = {};
for (const line of (await readFile('.env.local', 'utf8')).split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const report = { checked_at: new Date().toISOString(), url: env.VITE_SUPABASE_URL };
const catalog = await db.rpc('get_catalog');
if (catalog.error) throw catalog.error;
report.venues = catalog.data.venues.length; report.pools = catalog.data.pools.length; report.lanes = catalog.data.lanes.length;
const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const inventory = await db.rpc('get_availability', { p_date: day });
if (inventory.error) throw inventory.error;
report.available_lane_slots = inventory.data.filter(row => row.status === 'AVAILABLE').length;
const channel = db.channel('emuss-readonly-health').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'availability_events' }, () => {});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 20000);
    channel.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(new Error(status)); } });
  });
  report.realtime_subscription = 'SUBSCRIBED';
} finally { await db.removeChannel(channel); }
report.edge_functions = {};
for (const name of ['staff-invite', 'dispatch-notifications']) {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${name}`);
  if (response.status !== 405) throw new Error(`${name} returned ${response.status}, expected method rejection.`);
  report.edge_functions[name] = 'deployed, GET rejected';
}
await writeFile('docs/supabase-health.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
