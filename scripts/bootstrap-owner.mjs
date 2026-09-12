import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const env = {};
for (const line of (await readFile('.env.deploy', 'utf8')).split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
if (new URL(env.SUPABASE_URL).hostname !== 'vaduqtdiecmmxhmlycay.supabase.co') throw new Error('Unexpected project.');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = 'u201916314@upc.edu.pe';
const { data: page, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
let user = page.users.find(user => user.email?.toLowerCase() === email);
if (!user) {
  try { await access('.env.owner'); throw new Error('Owner credential file already exists; inspect previous setup before creating another account.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const password = randomBytes(32).toString('base64url');
  // Explicitly provisioned owner account, not a public signup or a claim of mailbox verification.
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
  await writeFile('.env.owner', `EMUSS_ADMIN_EMAIL=${email}\nEMUSS_ADMIN_PASSWORD=${password}\n`, { flag: 'wx', mode: 0o600 });
}
const { error: roleError } = await db.from('user_roles').upsert({ user_id: user.id, role: 'SUPER_ADMIN', venue_id: null, active: true }, { onConflict: 'user_id' });
if (roleError) throw roleError;
console.log(`Owner access configured for ${email}. Credentials are stored locally in .env.owner and are not printed.`);
