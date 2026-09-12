const messages: Record<string, string> = {
  PASSWORD_MISMATCH: 'Las contraseñas deben coincidir y tener al menos 12 caracteres.',
  INVITE_FAILED: 'No se pudo enviar la invitación. Revisa el correo y si la cuenta ya existe.',
  INVITE_ROLE_FAILED: 'La invitación se creó, pero falta asignar el rol. Revisa la cuenta del trabajador.',
  NOT_CONFIGURED: 'El servicio de reservas todavía no está conectado. Inténtalo más tarde.',
  AUTH_REQUIRED: 'Verifica tu correo para continuar con la reserva.', FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  LANE_UNAVAILABLE: 'Este carril acaba de ser reservado por otra persona.', HOLD_TAKEN: 'No disponible. Otro usuario está completando la reserva.',
  HOLD_EXPIRED: 'El bloqueo temporal ha vencido. Selecciona nuevamente un carril.', HOLD_NOT_OWNED: 'Este bloqueo temporal no pertenece a tu sesión.',
  USER_OVERLAP: 'Ya tienes una reserva o un carril temporal en ese horario.', MAINTENANCE: 'Este carril está en mantenimiento. Elige otra opción.',
  INVALID_SLOT: 'Este horario ya no está disponible.', INVALID_PROFILE: 'Revisa tus datos personales antes de continuar.',
  DNI_IN_USE: 'Este documento ya está asociado a una cuenta. Ingresa con su correo.', DNI_IMMUTABLE: 'El documento ya está registrado. Contacta con recepción para corregirlo.',
  TOO_LATE: 'El plazo permitido para cancelar o reprogramar ya terminó.', RESCHEDULE_DISABLED: 'La reprogramación no está habilitada.',
  NOT_FOUND: 'No encontramos la reserva solicitada.', INVALID_STATUS: 'El estado de esta reserva no permite realizar la acción.',
  CHECKIN_WINDOW: 'El check-in solo está disponible cerca del horario de la reserva.', MAINTENANCE_CONFLICT: 'Hay reservas o bloqueos temporales en ese periodo. Reprograma o cancela primero.',
  LAST_SUPER_ADMIN: 'Debe permanecer al menos un superadministrador activo.', INVALID_INPUT: 'Revisa los datos ingresados.',
};
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  for (const [code, text] of Object.entries(messages)) if (message.includes(code)) return text;
  if (/Invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/expired|invalid.*otp/i.test(message)) return 'El código venció o es incorrecto. Solicita uno nuevo.';
  if (/rate limit|too many/i.test(message)) return 'Espera un momento antes de volver a intentarlo.';
  return 'No pudimos completar la operación. Comprueba tu conexión e inténtalo nuevamente.';
}
