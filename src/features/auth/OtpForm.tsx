import { useState, type FormEvent } from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import { supabase, isConfigured } from '../../lib/supabase';
import { Button, ErrorState, Field, Input } from '../../components/ui';
import { appUrl } from '../../utils/appUrl';

export function OtpForm({ onVerified }: { onVerified?: () => void }) {
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [resendAt, setResendAt] = useState(0);
  async function send(event?: FormEvent) {
    event?.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try { if (!isConfigured) throw new Error('NOT_CONFIGURED'); const { error: authError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: appUrl('mis-reservas/') } }); if (authError) throw authError; setSent(true); setResendAt(Date.now() + 60_000); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try { const { error: authError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }); if (authError) throw authError; onVerified?.(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <div className="stack"><div className="auth-icon"><Mail size={25} /></div><p className="muted">{sent ? `Revisa ${email} y abre el enlace de acceso. Si el correo incluye un código, también puedes ingresarlo aquí. Revisa tu carpeta de correo no deseado.` : 'Verifica tu correo para reservar y consultar tus comprobantes. No necesitas una contraseña.'}</p>{error != null && <ErrorState error={error} />}
    <form className="stack" onSubmit={sent ? verify : send}>{sent ? <Field label="Código de verificación"><Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="one-time-code" autoFocus required minLength={6} maxLength={8} pattern="[0-9]{6,8}" placeholder="Código recibido" /></Field> : <Field label="Correo electrónico"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus required placeholder="tu@correo.com" /></Field>}
      <Button type="submit" loading={busy}>{sent ? 'Verificar código' : 'Enviar acceso por correo'}<ShieldCheck size={17} /></Button>
    </form>{sent && <div className="row wrap"><Button variant="ghost" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(null); }}>Cambiar correo</Button><Button variant="ghost" disabled={busy} onClick={() => { if (Date.now() < resendAt) { setError(new Error('rate limit')); return; } void send(); }}>Reenviar código</Button></div>}<p className="privacy-note"><ShieldCheck size={15} />Tus reservas quedan vinculadas a este correo.</p>
  </div>;
}
