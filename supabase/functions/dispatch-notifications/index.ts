import { createClient } from 'npm:@supabase/supabase-js@2';
import { response } from '../_shared/http.ts';

interface Reservation { reservation_code: string; venue_name: string; date: string; start_time: string; end_time: string; lane_number: number; email: string; phone: string }
interface Notification { id: string; claim_token: string; channel: 'EMAIL' | 'WHATSAPP'; kind: string; reservation: Reservation }
interface Adapter { send(notification: Notification): Promise<void> }
function text(n: Notification) { const r = n.reservation; const action = n.kind === 'CONFIRMED' ? 'confirmada' : n.kind === 'CANCELLED' ? 'cancelada' : 'reprogramada'; return `Tu reserva EMUSS fue ${action}.\n${r.venue_name}\n${r.date} · ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}\nCarril ${r.lane_number}\nCódigo: ${r.reservation_code}`; }
const email: Adapter = { async send(n) {
  const key = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) throw new Error('EMAIL_NOT_CONFIGURED');
  const result = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': n.id }, body: JSON.stringify({ from, to: [n.reservation.email], subject: 'Actualización de tu reserva EMUSS', text: text(n) }) });
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
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('claim_notifications', { p_limit: 25 });
  if (error) return response({ error: 'QUEUE_UNAVAILABLE' }, 503);
  let sent = 0;
  for (const n of data as Notification[]) {
    let failure: string | null = null;
    try { await (n.channel === 'EMAIL' ? email : whatsapp).send(n); sent++; }
    catch (e) { failure = e instanceof Error ? e.message : 'DELIVERY_FAILED'; }
    await db.rpc('finish_notification', { p_id: n.id, p_token: n.claim_token, p_success: failure === null, p_error: failure });
  }
  return response({ processed: data.length, sent });
});
