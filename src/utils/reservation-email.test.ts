import { describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { reservationEmail, qrOptions, smtpAttachments, resendAttachments, type Notification } from '../../supabase/functions/_shared/reservation-email';

const notification: Notification = {
  id: '11111111-1111-4111-8111-111111111111', claim_token: 'test', channel: 'EMAIL', kind: 'CONFIRMED',
  reservation: { reservation_code: 'EMUSS-0123456789ABCDEF0123456789ABCDEF', venue_name: 'Chacarilla', date: '2026-09-15', start_time: '06:00:00', end_time: '07:00:00', lane_number: 2, email: 'test@example.com', phone: '' },
};
const appUrl = 'https://magic-tps.github.io/emuss-v2/';
const generateQr = (code: string) => QRCode.toDataURL(code, qrOptions);

describe('reservation email', () => {
  it('embeds a scannable QR with the exact reception code and supplies a downloadable PNG', async () => {
    const email = await reservationEmail(notification, appUrl, generateQr);
    const png = PNG.sync.read(Buffer.from(email.qr!.content, 'base64'));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(notification.reservation.reservation_code);
    expect(email.html).toContain(`src="cid:${email.qr!.cid}"`);
    expect(email.text).toContain(notification.reservation.reservation_code);
    expect(email.html).toContain(`${appUrl}reserva/${notification.reservation.reservation_code}`);
    expect(smtpAttachments(email.qr).map(a => a.contentDisposition)).toEqual(['inline', 'attachment']);
    expect(smtpAttachments(email.qr)[0]).toMatchObject({ content: email.qr!.content, cid: email.qr!.cid, encoding: 'base64', contentType: 'image/png' });
    expect(resendAttachments(email.qr)[0].content_id).toBe(email.qr!.cid);
  });

  it('omits the QR and entry instruction when cancelled', async () => {
    const generator = vi.fn(generateQr);
    const email = await reservationEmail({ ...notification, kind: 'CANCELLED' }, appUrl, generator);
    expect(generator).not.toHaveBeenCalled();
    expect(email.qr).toBeUndefined();
    expect(email.html).not.toContain('cid:');
    expect(email.text).not.toContain('Presenta');
    expect(email.subject).toContain('cancelada');
    expect(smtpAttachments(email.qr)).toEqual([]);
    expect(resendAttachments(email.qr)).toEqual([]);
  });

  it('handles the database reschedule event suffix and updated schedule', async () => {
    const email = await reservationEmail({ ...notification, kind: 'RESCHEDULED-11111111-1111-4111-8111-111111111111', reservation: { ...notification.reservation, start_time: '09:00:00', end_time: '10:00:00', lane_number: 4 } }, appUrl, generateQr);
    expect(email.subject).toContain('reprogramada');
    expect(email.text).toContain('09:00–10:00\nCarril 4');
    expect(email.qr).toBeDefined();
  });

  it('escapes reservation data in HTML and rejects unsafe receipt URLs', async () => {
    const email = await reservationEmail({ ...notification, reservation: { ...notification.reservation, venue_name: '<img src=x> & "Sede"' } }, appUrl, generateQr);
    expect(email.html).toContain('&lt;img src=x&gt; &amp; &quot;Sede&quot;');
    expect(email.html).not.toContain('<img src=x>');
    await expect(reservationEmail(notification, 'javascript:alert(1)', generateQr)).rejects.toThrow('INVALID_APP_URL');
  });
});
