import { useEffect, useState, type FormEvent } from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase, isConfigured } from '../../lib/supabase';
import { Button, ErrorState, Field, Input } from '../../components/ui';
import { appUrl } from '../../utils/appUrl';

export function OtpForm({ onVerified }: { onVerified?: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordMode, setPasswordMode] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) setRetryAt(0);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function pauseSending() {
    const current = Date.now();
    setNow(current);
    setRetryAt(current + 60_000);
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy || Date.now() < retryAt) return;
    setBusy(true); setError(null);
    try {
      if (!isConfigured) throw new Error('NOT_CONFIGURED');
      const { error: authError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: appUrl('mis-reservas/') } });
      if (authError) throw authError;
      setSent(true); pauseSending();
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err && err.status === 429) pauseSending();
      setError(err);
    } finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { error: authError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
      if (authError) throw authError;
      onVerified?.();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (!isConfigured) throw new Error('NOT_CONFIGURED');
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      setPassword(''); onVerified?.();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  function switchMode() {
    setPasswordMode(value => !value); setSent(false); setCode(''); setPassword(''); setError(null);
  }

  return <div className="stack">
    <div className="auth-icon"><Mail size={25} /></div>
    <p className="muted">{passwordMode ? 'Ingresa con el correo y la contraseña de tu cuenta existente.' : sent ? `Revisa ${email} y abre el enlace de acceso. Si el correo incluye un código, también puedes ingresarlo aquí. Revisa tu carpeta de correo no deseado.` : 'Verifica tu correo para reservar y consultar tus comprobantes. Puedes recibir un enlace de acceso o ingresar con tu contraseña si ya tienes una.'}</p>
    {error != null && <ErrorState error={error} />}
    <form className="stack" onSubmit={passwordMode ? login : sent ? verify : send}>
      {!passwordMode && sent ? <Field label="Código de verificación"><Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="one-time-code" autoFocus required minLength={6} maxLength={8} pattern="[0-9]{6,8}" placeholder="Código recibido" /></Field> : <Field label="Correo electrónico"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete={passwordMode ? 'username' : 'email'} autoFocus required placeholder="tu@correo.com" /></Field>}
      {passwordMode && <Field label="Contraseña"><Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></Field>}
      <Button type="submit" loading={busy} disabled={!isConfigured || (!passwordMode && !sent && remaining > 0)}>{passwordMode ? 'Ingresar' : sent ? 'Verificar código' : remaining > 0 ? `Reintentar envío en ${remaining} s` : 'Enviar acceso por correo'}<ShieldCheck size={17} /></Button>
    </form>
    {!passwordMode && sent && <div className="row wrap">
      <Button variant="ghost" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(null); }}>Cambiar correo</Button>
      <Button variant="ghost" disabled={busy || remaining > 0} onClick={() => void send()}>{remaining > 0 ? `Reenviar en ${remaining} s` : 'Reenviar acceso'}</Button>
    </div>}
    <Button variant="ghost" disabled={busy} onClick={switchMode}>{passwordMode ? 'Recibir enlace por correo' : 'Ingresar con contraseña'}</Button>
    {passwordMode && <Link to="/admin/recover">Olvidé mi contraseña</Link>}
    <p className="privacy-note"><ShieldCheck size={15} />Tus reservas quedan vinculadas a este correo.</p>
  </div>;
}
