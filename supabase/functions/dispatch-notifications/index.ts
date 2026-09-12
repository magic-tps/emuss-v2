import { createClient } from 'npm:@supabase/supabase-js@2';
import { response } from '../_shared/http.ts';
import { smtpTransport } from '../_shared/smtp.ts';
import { acknowledgeNotification } from '../_shared/acknowledge.ts';
import QRCode from 'npm:qrcode@1.5.4';
import { reservationEmail, qrOptions, smtpAttachments, resendAttachments, type Notification } from '../_shared/reservation-email.ts';

interface Adapter { send(notification: Notification): Promise<void> }
const email: Adapter = { async send(n) {
  const { subject, text, html, qr } = await reservationEmail(n, Deno.env.get('APP_URL') || '', code => QRCode.toDataURL(code, qrOptions));
  if (Deno.env.get('EMAIL_PROVIDER') === 'smtp') {
    const transport = smtpTransport();
    try {
      const result = await transport.sendMail({
        from: { name: Deno.env.get('SMTP_SENDER_NAME') || 'EMUSS', address: Deno.env.get('SMTP_USER')! },
        to: n.reservation.email, subject, text, html, attachments: smtpAttachments(qr),
        messageId: `<${n.id}@${Deno.env.get('SMTP_USER')!.split('@')[1]}>`,
      });
      if (!result.accepted?.length) throw new Error('SMTP_RECIPIENT_REJECTED');
    } catch { throw new Error('SMTP_DELIVERY_FAILED'); }
    finally { transport.close(); }
    return;
  }
  const key = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) throw new Error('EMAIL_NOT_CONFIGURED');
  const result = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': n.id }, body: JSON.stringify({ from, to: [n.reservation.email], subject, text, html, attachments: resendAttachments(qr) }) });
  if (!result.ok) throw new Error(`EMAIL_PROVIDER_${result.status}`);
} };
// WhatsApp template must be approved and opted into before queuing WHATSAPP notifications.
const whatsapp: Adapter = { async send(n) {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN'); const phone = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID'); const template = Deno.env.get('WHATSAPP_TEMPLATE'); const version = Deno.env.get('WHATSAPP_GRAPH_VERSION');
  if (!token || !phone || !template || !version) throw new Error('WHATSAPP_NOT_CONFIGURED');
  const r = n.reservation;
  const result = await fetch(`https://graph.facebook.com/${version}/${phone}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: r.phone.replace(/\D/g, ''), type: 'template', template: { name: template, language: { code: 'es_PE' }, components: [{ type: 'body', parameters: [r.venue_name, r.date, `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`, String(r.lane_number), r.reservation_code].map(value => ({ type: 'text', text: value })) }] } }) });
  if (!result.ok) throw new Error(`WHATSAPP_PROVIDER_${result.status}`);
} };
Deno.serve(async request => {
  const secret = Deno.env.get('NOTIFICATION_CRON_SECRET');
  if (request.method !== 'POST') return response({ error: 'INVALID_INPUT' }, 405);
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return response({ error: 'FORBIDDEN' }, 403);
  if (request.headers.get('X-EMUSS-SMTP-Check') === 'true') {
    try { const transport = smtpTransport(); try { await transport.verify(); } finally { transport.close(); } return response({ smtp: 'connected' }); }
    catch { return response({ error: 'SMTP_CONNECTION_FAILED' }, 503); }
  }
  const smtp = Deno.env.get('EMAIL_PROVIDER') === 'smtp';
  if (smtp ? !Deno.env.get('SMTP_PASS') : !(Deno.env.get('RESEND_API_KEY') && Deno.env.get('EMAIL_FROM'))) return response({ error: 'EMAIL_NOT_CONFIGURED' }, 503);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  if (request.headers.get('X-EMUSS-Queue-Check') === 'true') {
    const check = await db.from('notifications').select('id', { head: true }).limit(1);
    return response(check.error ? { error: 'QUEUE_CONNECTION_FAILED', code: check.error.code, message: check.error.message } : { queue: 'connected' }, check.error ? 503 : 200);
  }
  const { data, error } = await db.rpc('claim_notifications', { p_limit: smtp ? 2 : 25 });
  if (error) return response({ error: 'QUEUE_UNAVAILABLE', code: error.code, message: error.message }, 503);
  let sent = 0;
  for (const n of data as Notification[]) {
    let failure: string | null = null;
    try { await (n.channel === 'EMAIL' ? email : whatsapp).send(n); sent++; }
    catch (e) { failure = e instanceof Error ? e.message : 'DELIVERY_FAILED'; }
    const { error: acknowledgeError } = await acknowledgeNotification(() => db.rpc('finish_notification', { p_id: n.id, p_token: n.claim_token, p_success: failure === null, p_error: failure }));
    if (acknowledgeError) return response({ error: 'QUEUE_ACKNOWLEDGEMENT_FAILED', code: acknowledgeError.code, message: acknowledgeError.message, processed: data.length, sent }, 503);
  }
  return response({ processed: data.length, sent });
});
