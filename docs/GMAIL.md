# Correo con Gmail

La integración utiliza un Gmail remitente para los códigos de Supabase Auth y los avisos de reserva. La contraseña de EMUSS y el acceso a GitHub no autorizan a enviar desde Gmail.

## Dato necesario del propietario

En `.env.smtp` (excluido de Git), comprobar `SMTP_USER` y completar `SMTP_PASS` con una [contraseña de aplicación de Google](https://myaccount.google.com/apppasswords). Requiere verificación en dos pasos. No usar la contraseña habitual de Google ni la de `.env.owner`. No enviar esa contraseña por el chat.

## Activación preparada

Desde la raíz del proyecto:

```sh
node scripts/configure-gmail.mjs --verify-only
node scripts/configure-gmail.mjs
```

La primera orden comprueba TLS y autenticación SMTP sin enviar mensajes. La segunda configura los secretos de la función, despliega el dispatcher y comprueba SMTP desde Supabase antes de cambiar Auth. Después aplica las plantillas de código y programa las notificaciones cada minuto, guardando el secreto del scheduler en Vault. Las credenciales y SQL privado permanecen dentro de `.supabase/`, excluido de Git. El script no imprime contraseñas.

La activación queda pendiente mientras `SMTP_PASS` esté vacío. Todavía no se ha verificado la recepción de códigos ni de avisos en el buzón.

SMTP utiliza una cola con reintentos. Un corte después de que Gmail acepte el mensaje puede causar un duplicado al reintentar: SMTP no ofrece la deduplicación del adaptador Resend. `messageId` permanece estable, pero no garantiza deduplicación. Los avisos se marcan enviados cuando el servidor SMTP acepta el mensaje; eso no acredita llegada a la bandeja de entrada.

Gmail sirve para la demostración y tiene cuotas y controles propios; para uso público sostenido se deberá migrar a un proveedor transaccional con dominio. Referencias: [Google: contraseñas de aplicación](https://support.google.com/accounts/answer/185833), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Gmail con Nodemailer](https://nodemailer.com/guides/using-gmail).
