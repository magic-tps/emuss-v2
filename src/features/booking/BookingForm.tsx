import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ShieldCheck } from 'lucide-react';
import { Button, ErrorState, Field, Input } from '../../components/ui';
import type { BookingProfile, Profile } from '../../types/domain';

const profileSchema = z.object({
  dni: z.string().regex(/^\d{8}$/, 'Ingresa un DNI de 8 dígitos.'),
  first_name: z.string().trim().min(2, 'Ingresa tus nombres.').max(80, 'Usa como máximo 80 caracteres.'),
  last_name: z.string().trim().min(2, 'Ingresa tus apellidos.').max(100),
  phone: z.string().regex(/^\+?[0-9 ()-]{9,20}$/, 'Ingresa un teléfono válido, de 9 a 20 caracteres.'),
  email: z.email('Ingresa un correo válido.'),
});

export function BookingForm({ profile, email, busy, expired, error, onConfirm }: { profile: Profile | null; email: string; busy: boolean; expired: boolean; error: unknown; onConfirm: (data: BookingProfile) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<BookingProfile>({ resolver: zodResolver(profileSchema), defaultValues: { dni: profile?.dni || '', first_name: profile?.first_name || '', last_name: profile?.last_name || '', phone: profile?.phone || '', email } });
  return <form className="stack booking-form" onSubmit={handleSubmit(onConfirm)}><div><h3>Tus datos</h3><p className="muted">Los usaremos para identificarte en recepción.</p></div><Field label="DNI" error={errors.dni?.message} hint={profile?.dni ? 'Para corregir tu documento, contacta con recepción.' : undefined}><Input {...register('dni')} inputMode="numeric" maxLength={8} readOnly={!!profile?.dni} autoComplete="off" /></Field><div className="grid-2"><Field label="Nombres" error={errors.first_name?.message}><Input {...register('first_name')} autoComplete="given-name" /></Field><Field label="Apellidos" error={errors.last_name?.message}><Input {...register('last_name')} autoComplete="family-name" /></Field></div><Field label="Teléfono" error={errors.phone?.message}><Input {...register('phone')} type="tel" autoComplete="tel" /></Field><Field label="Correo verificado" error={errors.email?.message}><Input {...register('email')} readOnly type="email" /></Field>{error != null && <ErrorState error={error} />}<Button type="submit" loading={busy} disabled={expired}>Confirmar reserva <ShieldCheck size={18} /></Button><p className="privacy-note">Al confirmar, este carril se asignará únicamente a tu reserva.</p></form>;
}
