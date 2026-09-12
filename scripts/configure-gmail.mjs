import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import nodemailer from 'nodemailer';

const project = 'vaduqtdiecmmxhmlycay';
const values = {};
for (const file of ['.env.deploy', '.env.functions', '.env.smtp']) {
  for (const line of (await readFile(file, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trimStart().startsWith('#')) values[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
values.SMTP_PASS = (values.SMTP_PASS || '').replace(/\s/g, '');
if (values.SMTP_HOST !== 'smtp.gmail.com' || values.SMTP_PORT !== '465') throw new Error('Para Gmail utiliza SMTP_HOST=smtp.gmail.com y SMTP_PORT=465.');
if (!/^[^\s@<>]+@gmail\.com$/i.test(values.SMTP_USER || '')) throw new Error('Completa SMTP_USER en .env.smtp con el Gmail remitente.');
if (!/^[a-z]{16}$/i.test(values.SMTP_PASS)) throw new Error('Completa SMTP_PASS en .env.smtp con la contraseña de aplicación de Google de 16 letras. No uses la contraseña de EMUSS.');
if (values.SUPABASE_URL !== `https://${project}.supabase.co`) throw new Error('Proyecto Supabase inesperado.');
if (!values.NOTIFICATION_CRON_SECRET) throw new Error('Falta NOTIFICATION_CRON_SECRET.');
const privateValues = ['SMTP_PASS', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'NOTIFICATION_CRON_SECRET'].map(key => values[key]).filter(Boolean);
function redact(output) { for (const secret of privateValues) output = output.split(secret).join('[REDACTED]'); return output; }
function cli(args) {
  const result = spawnSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), ...args], {
    cwd: process.cwd(), env: { ...process.env, ...values }, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    console.error(redact((result.stdout || '') + (result.stderr || '')));
    throw new Error(`Supabase no pudo completar: ${args.slice(0, 2).join(' ')}`);
  }
}

// Verify TLS and authentication before modifying the working Auth configuration.
const transport = nodemailer.createTransport({ host: values.SMTP_HOST, port: 465, secure: true,
  auth: { user: values.SMTP_USER, pass: values.SMTP_PASS },
  connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000, logger: false, debug: false });
try { await transport.verify(); }
catch { throw new Error('Gmail rechazó la conexión. Revisa la contraseña de aplicación y la verificación en dos pasos. No se modificó Supabase.'); }
finally { transport.close(); }
console.log('Gmail: conexión TLS y autenticación correctas. No se ha enviado correo.');
if (process.argv.includes('--verify-only')) process.exit(0);

const folder = '.supabase/gmail-setup';
await mkdir(`${folder}/supabase/templates`, { recursive: true });
await writeFile(`${folder}/supabase/templates/magic-link.html`, await readFile('supabase/templates/magic-link.html', 'utf8'));
const template = './supabase/templates/magic-link.html';
let config = await readFile('supabase/hosted/supabase/config.toml', 'utf8');
config += '\n[auth.rate_limit]\nemail_sent = 30\n';
config += `\n[auth.email.smtp]\nenabled = true\nhost = "env(SMTP_HOST)"\nport = 465\nuser = "env(SMTP_USER)"\npass = "env(SMTP_PASS)"\nadmin_email = "env(SMTP_USER)"\nsender_name = "EMUSS"\n`;
for (const kind of ['magic_link', 'confirmation']) config += `\n[auth.email.template.${kind}]\nsubject = "Tu código de acceso a EMUSS"\ncontent_path = ${JSON.stringify(template)}\n`;
await writeFile(`${folder}/supabase/config.toml`, config);
const secretFile = `${folder}/functions.env`;
await writeFile(secretFile, ['EMAIL_PROVIDER=smtp', ...['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SENDER_NAME'].map(key => `${key}=${values[key] || 'EMUSS'}`)].join('\n') + '\n', { mode: 0o600 });
cli(['secrets', 'set', '--env-file', secretFile, '--project-ref', project]);
cli(['functions', 'deploy', 'dispatch-notifications', '--project-ref', project, '--use-api']);
// This protected probe only verifies SMTP connectivity from the deployed runtime.
const probe = await fetch(`${values.SUPABASE_URL}/functions/v1/dispatch-notifications`, { method: 'POST',
  headers: { Authorization: `Bearer ${values.NOTIFICATION_CRON_SECRET}`, 'X-EMUSS-SMTP-Check': 'true' },
  signal: AbortSignal.timeout(30_000) });
if (!probe.ok) throw new Error('SMTP no conectó desde Supabase. Auth todavía conserva su configuración anterior.');
cli(['config', 'push', '--project-ref', project, '--workdir', folder, '--yes']);
console.log('SMTP y plantillas OTP configurados. Dispatcher conectado a Gmail desde Supabase.');

// Store the cron credential in Vault, not in the scheduler command or versioned SQL.
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const sql = `begin;
create extension if not exists pg_net with schema extensions;
do $setup$ declare secret_id uuid; begin
 select id into secret_id from vault.secrets where name='emuss_notification_cron';
 if secret_id is null then perform vault.create_secret(${literal(values.NOTIFICATION_CRON_SECRET)}, 'emuss_notification_cron');
 else perform vault.update_secret(secret_id, ${literal(values.NOTIFICATION_CRON_SECRET)}); end if;
end $setup$;
select cron.schedule('emuss-notifications', '* * * * *', $job$
 select net.http_post(
   url := '${values.SUPABASE_URL}/functions/v1/dispatch-notifications',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='emuss_notification_cron')),
   body := '{}'::jsonb, timeout_milliseconds := 90000
 );
$job$);
commit;`;
await writeFile(`${folder}/schedule.sql`, sql, { mode: 0o600 });
cli(['db', 'query', '--linked', '--file', `${folder}/schedule.sql`]);
console.log('Avisos de reservas programados cada minuto. Falta comprobar recepción en el buzón mediante una prueba de acceso y una reserva.');
