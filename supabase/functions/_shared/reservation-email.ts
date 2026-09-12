export interface Reservation {
  reservation_code: string;
  venue_name: string;
  date: string;
  start_time: string;
  end_time: string;
  lane_number: number;
  email: string;
  phone: string;
}

export interface Notification {
  id: string;
  claim_token: string;
  channel: 'EMAIL' | 'WHATSAPP';
  kind: string;
  reservation: Reservation;
}

export const qrOptions = { errorCorrectionLevel: 'M' as const, margin: 4, width: 280, type: 'image/png' as const };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export async function reservationEmail(n: Notification, appUrl: string, generateQr: (code: string) => Promise<string>) {
  const r = n.reservation;
  const kind = n.kind.startsWith('RESCHEDULED-') ? 'RESCHEDULED' : n.kind;
  const action = ({ CONFIRMED: 'confirmada', CANCELLED: 'cancelada', RESCHEDULED: 'reprogramada' } as Record<string, string>)[kind];
  if (!action) throw new Error('UNSUPPORTED_NOTIFICATION_KIND');
  const base = new URL(appUrl);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('INVALID_APP_URL');
  base.search = '';
  base.hash = '';
  base.pathname = `${base.pathname.replace(/\/$/, '')}/reserva/${encodeURIComponent(r.reservation_code)}`;
  const receiptUrl = base.href;
  const subject = `Tu reserva EMUSS fue ${action}`;
  const schedule = `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`;
  const active = n.kind !== 'CANCELLED';
  const qr = active ? {
    content: (await generateQr(r.reservation_code)).replace(/^data:image\/png;base64,/, ''),
    cid: `reserva-${n.id}@emuss`,
    filename: 'reserva-emuss.png',
  } : undefined;
  const text = `${subject}.\n${r.venue_name}\n${r.date} · ${schedule}\nCarril ${r.lane_number}\nCódigo: ${r.reservation_code}\n${active ? 'Presenta el QR adjunto en recepción.\n' : ''}Ver reserva: ${receiptUrl}`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f6fb;font-family:Arial,sans-serif;color:#182033">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e5ef;border-radius:12px"><tr><td style="padding:28px">
<p style="color:#4934c7;font-weight:bold;letter-spacing:2px;margin:0 0 20px">EMUSS</p>
<h1 style="font-size:24px;margin:0 0 20px">Reserva ${action}</h1>
<p style="font-size:16px;line-height:1.7">${escapeHtml(r.venue_name)}<br>${escapeHtml(r.date)} · ${escapeHtml(schedule)}<br><strong>Carril ${r.lane_number}</strong></p>
${qr ? `<div style="text-align:center"><p>Presenta este QR en recepción</p><img src="cid:${escapeHtml(qr.cid)}" alt="Código QR de tu reserva" width="280" height="280" style="display:block;max-width:100%;height:auto;margin:0 auto;border:0"><p style="font-size:13px;color:#525c70">También lo encontrarás adjunto como imagen PNG.</p></div>` : '<p>Esta reserva está cancelada y no permite el ingreso.</p>'}
<p style="font-size:13px;overflow-wrap:anywhere;word-break:break-all">Código: <strong>${escapeHtml(r.reservation_code)}</strong></p>
<p style="margin:24px 0"><a href="${escapeHtml(receiptUrl)}" style="display:inline-block;background:#4934c7;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:6px">Ver mi reserva</a></p>
<p style="font-size:12px;color:#525c70">Para consultar el comprobante, ingresa con el correo de tu reserva.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html, qr };
}

export function smtpAttachments(qr: Awaited<ReturnType<typeof reservationEmail>>['qr']) {
  if (!qr) return [];
  const image = { filename: qr.filename, content: qr.content, encoding: 'base64', contentType: 'image/png' };
  return [
    { ...image, cid: qr.cid, contentDisposition: 'inline' as const },
    { ...image, contentDisposition: 'attachment' as const },
  ];
}

export function resendAttachments(qr: Awaited<ReturnType<typeof reservationEmail>>['qr']) {
  return qr ? [
    { filename: qr.filename, content: qr.content, content_id: qr.cid },
    { filename: qr.filename, content: qr.content },
  ] : [];
}
