# Correo con Gmail

La integración utiliza un Gmail remitente para los códigos de Supabase Auth y los avisos de reserva. La contraseña de EMUSS y el acceso a GitHub no autorizan a enviar desde Gmail.

## Dato necesario del propietario

En `.env.smtp` (excluido de Git), comprobar `SMTP_USER` y completar `SMTP_PASS` con una [contraseña de aplicación de Google](https://myaccount.google.com/apppasswords). Requiere verificación en dos pasos. No usar la contraseña habitual de Google ni la de `.env.owner`. No enviar esa contraseña por el chat.

## Activación y verificación

Desde la raíz del proyecto:

```sh
node scripts/configure-gmail.mjs --verify-only
node scripts/configure-gmail.mjs
```

La primera orden comprueba TLS y autenticación SMTP sin enviar mensajes. La segunda configura los secretos de la función, despliega el dispatcher y comprueba SMTP desde Supabase antes de cambiar Auth. Después aplica las plantillas de código y programa las notificaciones cada minuto, guardando el secreto del scheduler en Vault. Las credenciales y SQL privado permanecen dentro de `.supabase/`, excluido de Git. El script no imprime contraseñas.

Activado el 12 de septiembre de 2026. Gmail autenticó por TLS desde el equipo y desde Supabase. Supabase Auth aceptó una solicitud real de código y el propietario confirmó su recepción. El cron de avisos está activo cada minuto; se observaron tres notificaciones EMAIL/CONFIRMED marcadas SENT. La recepción de esos tres avisos no se confirmó por separado en el buzón.

SMTP utiliza una cola con reintentos. La actualización en base de datos se reintenta hasta tres veces con el mismo token, sin repetir el envío dentro de esa ejecución. Un corte después de que Gmail acepte el mensaje todavía puede causar un duplicado en otra ejecución: SMTP no ofrece la deduplicación del adaptador Resend. `messageId` permanece estable, pero no garantiza deduplicación. Los avisos se marcan enviados cuando el servidor SMTP acepta el mensaje; eso no acredita llegada a la bandeja de entrada.

Gmail sirve para la demostración y tiene cuotas y controles propios; para uso público sostenido se deberá migrar a un proveedor transaccional con dominio. Referencias: [Google: contraseñas de aplicación](https://support.google.com/accounts/answer/185833), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Gmail con Nodemailer](https://nodemailer.com/guides/using-gmail).
