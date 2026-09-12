import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Input, Loading } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { isConfigured, supabase } from '../../lib/supabase';
import { Notice } from './common';
import { appUrl } from '../../utils/appUrl';

export function PasswordPage({ recovery = false }: { recovery?: boolean }) {
  const auth = useAuth(); const navigate = useNavigate();
  const [pending, setPending] = useState(false); const [error, setError] = useState<unknown>(); const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setError(undefined); setPending(true);
    try {
      if (!isConfigured) throw new Error('NOT_CONFIGURED');
      if (recovery) {
        const { error: failure } = await supabase.auth.resetPasswordForEmail(String(values.get('email')).trim(), { redirectTo: appUrl('admin/set-password/') });
        if (failure) throw failure;
        setSent(true);
      } else {
        const password = String(values.get('password'));
        if (password.length < 12 || password !== values.get('confirmation')) throw new Error('PASSWORD_MISMATCH');
        const { error: failure } = await supabase.auth.updateUser({ password });
        if (failure) throw failure;
        navigate('/admin/dashboard', { replace: true });
      }
    } catch (failure) { setError(failure); } finally { setPending(false); }
  }
  if (auth.loading) return <Loading />;
  return <main className="admin-login"><section className="admin-login-brand"><Link to="/" className="admin-brand">EMUSS</Link><div><p className="kicker">ACCESO DEL PERSONAL</p><h1>Tu cuenta,<br />lista para trabajar.</h1></div></section><section className="admin-login-form"><div className="admin-login-inner"><h2>{recovery ? 'Recuperar contraseña' : 'Establecer contraseña'}</h2><Notice error={error} success={sent ? 'Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.' : undefined} />{!recovery && !auth.user ? <p>Abre el enlace de invitación o recuperación enviado a tu correo. Si venció, solicita uno nuevo.</p> : <form className="stack" onSubmit={event => void submit(event)}>{recovery ? <Field label="Correo de trabajo"><Input name="email" type="email" autoComplete="email" required /></Field> : <><Field label="Nueva contraseña" hint="Utiliza al menos 12 caracteres."><Input name="password" type="password" minLength={12} autoComplete="new-password" required /></Field><Field label="Repetir contraseña"><Input name="confirmation" type="password" minLength={12} autoComplete="new-password" required /></Field></>}<Button type="submit" loading={pending} disabled={!isConfigured}>{recovery ? 'Enviar enlace' : 'Guardar contraseña'}</Button></form>}<p><Link to="/admin/login">Volver al ingreso</Link></p>{!recovery && !auth.user && <Link to="/admin/recover">Solicitar enlace de recuperación</Link>}</div></section></main>;
}
