import nodemailer from 'npm:nodemailer@10.0.9';

export function smtpTransport() {
  const host = Deno.env.get('SMTP_HOST');
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const port = Number(Deno.env.get('SMTP_PORT') || 465);
  if (!host || !user || !pass || ![465, 587].includes(port)) throw new Error('SMTP_NOT_CONFIGURED');
  return nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: true,
    auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000,
    socketTimeout: 15_000, disableFileAccess: true, disableUrlAccess: true,
    logger: false, debug: false,
  });
}
