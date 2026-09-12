# Supabase conectado

Estado comprobado el 11 de septiembre de 2026 (America/Lima).

- Proyecto: **emuss-v2**, referencia `vaduqtdiecmmxhmlycay`, región `us-east-1`.
- [Panel de Supabase](https://supabase.com/dashboard/project/vaduqtdiecmmxhmlycay).
- API: `https://vaduqtdiecmmxhmlycay.supabase.co`.
- Web local: http://127.0.0.1:5173, mediante `npm run dev`.

Se creó un proyecto separado; el proyecto preexistente de la cuenta se conservó. Este despliegue usa datos de demostración persistidos en PostgreSQL. El frontend todavía se ejecuta localmente.

## Aplicado y verificado

Las seis migraciones y el seed están aplicados: 3 sedes, 3 piscinas, 24 carriles y 1488 horarios. No volver a ejecutar el seed en este proyecto: no es idempotente. Las 16 tablas tienen RLS y la migración de permisos restringe las funciones internas de servicio frente a los permisos predeterminados de Supabase.

El trabajo `emuss-reservation-jobs` se ejecuta cada minuto; se observaron 10 ejecuciones exitosas. Realtime publica `availability_events` y acepta la suscripción del cliente. El catálogo y la disponibilidad se consultaron por la API real y se mostraron en navegador de escritorio y móvil.

`staff-invite` y `dispatch-notifications` están desplegadas. Sus endpoints respondieron HTTP 405 a GET, como está previsto. Eso no valida todavía una invitación ni la entrega de una notificación.

Comprobación de solo lectura, desde la raíz de la aplicación:

```sh
node scripts/check-supabase.mjs
```

El resultado se guarda en [supabase-health.json](supabase-health.json), sin credenciales ni datos personales. Las cifras de disponibilidad dependen del día y la hora.

## Configuración local privada

`.env.local` contiene únicamente las variables públicas que usa Vite. `.env.deploy` conserva las credenciales de despliegue y `.env.functions` los valores de `APP_URL` y `NOTIFICATION_CRON_SECRET`. Estos archivos están excluidos de Git. No copiar credenciales privilegiadas a variables `VITE_`.

La configuración de Auth alojada está en `supabase/hosted/supabase/config.toml`. Incluye las URLs de retorno de Pages y locales y vencimiento OTP de diez minutos. Para aplicar cambios revisados:

```sh
supabase config push --project-ref vaduqtdiecmmxhmlycay --workdir supabase/hosted --yes
```

Gmail SMTP está activado. El instalador genera la configuración privada en `.supabase/gmail-setup`, aplica la plantilla de código y conserva los retornos públicos/locales. El propietario confirmó la recepción de un código de acceso real. Para volver a configurar SMTP usar `npm run mail:setup`; ver [GMAIL.md](GMAIL.md).

## Superadministrador

Por indicación del usuario se creó `u201916314@upc.edu.pe` con el rol activo `SUPER_ADMIN`. La contraseña inicial está en `.env.owner`, excluido de Git, bajo `EMUSS_ADMIN_PASSWORD`. Acceso: https://magic-tps.github.io/emuss-v2/admin/login/ con ese correo y contraseña. El correo identifica la cuenta de EMUSS; no se configuró inicio de sesión OAuth con GitHub.

## Trabajo pendiente

Se ejecutó `scripts/bootstrap-owner.mjs` para aprovisionar al administrador autorizado. La prueba `scripts/test-supabase.mjs` sigue pendiente de autorización específica para crear cuentas y reservas temporales: verifica Auth con un OTP generado administrativamente, concurrencia por HTTP, eventos Realtime, RLS, cancelación y cola; elimina los datos temporales al finalizar. Esa prueba no envía correo ni valida entrega SMTP.

El dispatcher usa Gmail SMTP y se ejecuta cada minuto mediante pg_cron/pg_net, con su secreto en Vault. Se observaron tres avisos de confirmación aceptados por SMTP y marcados SENT. WhatsApp sigue pendiente de credenciales, consentimiento y plantilla aprobada.
