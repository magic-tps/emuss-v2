# EMUSS V2

Aplicación React + TypeScript para reservar un carril completo en una red de piscinas. PostgreSQL decide la disponibilidad y confirma las reservas mediante transacciones. El prototipo analizado se conserva en `legacy/`; su runtime y datos simulados no forman parte de la aplicación V2.

## Ejecutar

El entorno de este workspace ya está conectado al proyecto alojado **emuss-v2**. `.env.local` contiene la URL y la clave pública; basta ejecutar `npm run dev` y abrir http://127.0.0.1:5173. Estado, verificaciones y pendientes: [docs/SUPABASE.md](docs/SUPABASE.md).

Requisitos: Node.js 22.12 o superior y npm. Docker Desktop y Supabase CLI son necesarios para la alternativa local descrita a continuación. Sin conexión se muestra un estado de servicio no disponible y nunca disponibilidad inventada.

```sh
npm install
supabase start
supabase db reset
cp .env.example .env.local
# Completar VITE_SUPABASE_ANON_KEY con la clave anon de supabase status.
npm run dev
```

En PowerShell, usar `Copy-Item .env.example .env.local`. Web: http://127.0.0.1:5173. Studio: http://127.0.0.1:54323. Correo local: http://127.0.0.1:54324. `db reset` elimina y recrea **la base local**: no usarlo sobre datos que deban conservarse. El seed crea Chacarilla, San Borja y Surco, una piscina y ocho carriles por sede, y 31 días de horarios; todo son registros reales de PostgreSQL destinados a demostración, con direcciones y tarifas de ejemplo.

Variables públicas: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Nunca poner `service_role`, contraseñas ni claves de correo/WhatsApp en una variable `VITE_`.

## Autenticación y administradores

Clientes verifican su correo mediante enlace de acceso o código OTP antes del hold, que así queda ligado a una identidad confirmada. No existe búsqueda pública por DNI. La plantilla local muestra `{{ .Token }}`. El proyecto alojado usa la plantilla predeterminada con enlace: Supabase rechazó su personalización en el plan gratuito con el proveedor de correo predeterminado. Para mostrar el código en ese correo hace falta configurar SMTP propio y aplicar la plantilla. Las URLs locales de retorno ya están registradas.

Para el primer administrador: crear/confirmar un usuario mediante Supabase Auth, y ejecutar **una sola vez desde SQL Editor como administrador de la base**:

```sql
insert into public.user_roles(user_id,role,venue_id)
select id,'SUPER_ADMIN',null from auth.users where email='tu-correo@tu-dominio.pe';
```

Entrar por `/admin/login` con correo y contraseña. `SUPER_ADMIN` gestiona todas las sedes, configuración, trabajadores y auditoría. `VENUE_ADMIN` gestiona reservas, carriles, horarios, mantenimiento y reportes de su sede. `RECEPTIONIST` consulta reservas de su sede y realiza check-in. Las restricciones se repiten en cada RPC y en RLS; ocultar rutas no es la protección principal. No se puede desactivar el último superadministrador.

Para una demostración **local en base recién reseteada**:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = 'clave service_role local de supabase status'
$env:DEMO_PASSWORD = 'una contraseña local de al menos 12 caracteres'
node scripts/seed-demo.mjs
```

El script rechaza servidores externos y crea `super@emuss.local`, `sede@emuss.local`, `recepcion@emuss.local` y tres nadadores con la contraseña suministrada. Añade reservas, check-in y mantenimiento de demostración sin enviar correos. No hay contraseñas predeterminadas ni secretos en Git.

## Flujos

**Reserva:** fecha → sede/piscina → horario → carril → correo verificado → hold en PostgreSQL por cinco minutos → datos validados con React Hook Form/Zod → confirmación RPC → código/QR y comprobante. El QR contiene únicamente un código aleatorio, sin DNI ni contacto. `/mis-reservas` permite consultar próximas reservas, historial y canceladas, cancelar o reprogramar según la política. Las alternativas usan la disponibilidad consultada.

**Administración:** login → dashboard con filtros → reservas o control de piscina → detalle, check-in, cancelación, reprogramación o reserva manual de cliente registrado. Incluye gestión de sedes/piscinas/carriles, bloqueo de uno o varios carriles o piscina, horarios/tarifas/feriados, clientes e historial, trabajadores, auditoría y reportes CSV. El lector QR necesita HTTPS (o localhost) y permiso de cámara; el código manual funciona sin cámara.

## Arquitectura y tablas

```text
src/
  components/          UI compartida y layout público
  features/            autenticación y reserva
  hooks/               sesión, catálogo, disponibilidad y Realtime
  lib/                 clientes Supabase y TanStack Query
  pages/public/        reserva, comprobante, mis reservas
  pages/admin/         rutas y módulos administrativos
  services/            booking, admin, notifications
  types/               contratos TypeScript
  utils/               fechas Lima y errores amigables
supabase/
  migrations/          esquema, reservas, admin, configuración, trabajos
  functions/           invitación de personal y notificaciones
  templates/           correo OTP
  config.toml
  seed.sql
scripts/               pruebas PostgreSQL y demo local
legacy/                referencia original conservada
```

Relaciones principales:

```text
auth.users → profiles → user_roles → venues
venues → pools → lanes
pools → schedule_templates / time_slots
profiles + lanes + time_slots → reservation_holds / reservations
reservations → check_ins / notifications
venues + pools + lanes(opcional) → maintenance_blocks
venues → holidays
profiles(actor) + venues → audit_logs
pools → availability_events
settings: política única del sistema
```

Las 16 tablas de `public` son `profiles`, `venues`, `pools`, `lanes`, `schedule_templates`, `time_slots`, `reservations`, `reservation_holds`, `check_ins`, `maintenance_blocks`, `user_roles`, `audit_logs`, `notifications`, `holidays`, `settings` y `availability_events`. Todas tienen RLS y ninguna permite escritura directa a `anon`/`authenticated`.

RLS: catálogo activo y eventos de disponibilidad legibles públicamente; perfil/reservas/holds/check-ins/notificaciones propios; personal accede a reservas y clientes relacionados con su sede; horarios y mantenimiento limitados por sede/rol; roles propios o superadministrador; auditoría/configuración solo superadministrador. Los eventos públicos contienen únicamente piscina, fecha y marcas técnicas, nunca clientes ni IDs de reserva.

RPC públicas: `get_catalog`, `get_availability`. RPC autenticadas de reserva: `get_my_roles`, `my_profile`, `my_holds`, `acquire_hold`, `release_hold`, `confirm_reservation`, `my_reservations`, `cancel_reservation`, `reschedule_reservation`. RPC administrativas: `admin_list`, `admin_save`, `admin_delete`, `admin_reservations`, `admin_dashboard`, `admin_create_reservation`, `lookup_reservation`, `check_in_reservation`, `create_maintenance`, `remove_maintenance`, `generate_time_slots`, `set_staff_role`. RPC exclusivas de servicio: `process_reservation_jobs`, `claim_notifications`, `finish_notification`.

## Concurrencia y horarios

Cada reserva es un carril. Índices únicos parciales impiden duplicar carril/slot y usuario/slot mientras la reserva no esté cancelada. Restricciones GiST sobre intervalos impiden solapamientos de un usuario incluso entre piscinas/sedes. Claves foráneas compuestas impiden mezclar piscina, carril y horario. Las RPC adquieren bloqueos transaccionales en orden estable y comprueban identidad, slot futuro, mantenimiento, reservas y propiedad/vencimiento del hold. Confirmación, perfil, consumo de hold, notificación y auditoría se confirman juntos o se revierten juntos.

Se serializa por piscina y usuario, con bloqueo global compartido para reservas y exclusivo para cambios de configuración/mantenimiento. Es deliberadamente conservador para evitar carreras; una red con mucho tráfico podría dividir los bloqueos tras medir la carga. Reprogramación libera el origen y ocupa el destino en una transacción. Cancelar vuelve a permitir una nueva reserva.

La vigencia del hold se calcula en cada lectura/operación de la base, por lo que vence aunque el cron esté detenido. `process_reservation_jobs` limpia holds y marca `NO_SHOW` o `COMPLETED` al finalizar el horario. La migración instala un trabajo cada minuto si existe `pg_cron`. Comprobar `select * from cron.job` y `cron.job_run_details` en el despliegue. Realtime publica eventos de invalidación; el cliente además consulta periódicamente como recuperación de conexiones perdidas.

Los horarios vienen de plantillas PostgreSQL por día de semana. Después de editarlas, generar el rango desde Configuración. La regeneración conserva horarios comprometidos y reemplaza inventario futuro libre; reservas existentes mantienen su precio. Feriados, desactivaciones y mantenimiento rechazan periodos con reservas/holds que primero deben resolverse. Hora civil: `America/Lima`; persistencia: `timestamptz`.

## Notificaciones y servicios externos

La confirmación encola correo en la misma transacción; una reserva confirmada no significa que el correo haya sido entregado. `dispatch-notifications` reclama mensajes con `SKIP LOCKED`, token y lease, reintenta hasta cinco veces y usa clave de idempotencia para correo. La cola WhatsApp está preparada como adaptador; activarla requiere consentimiento, teléfono internacional y plantilla aprobada. No se encola WhatsApp automáticamente.

Secretos de Edge Functions: `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFICATION_CRON_SECRET`; opcionales `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_GRAPH_VERSION`. Supabase proporciona sus variables de URL/anon/service role en Edge. Configurarlos con `supabase secrets set --env-file <archivo privado>` y desplegar:

```sh
supabase functions deploy staff-invite
supabase functions deploy dispatch-notifications
```

Programar un POST periódico a `/functions/v1/dispatch-notifications` con `Authorization: Bearer <NOTIFICATION_CRON_SECRET>` mediante scheduler protegido. El secreto debe guardarse en Vault o en el proveedor del scheduler, nunca en SQL versionado ni en el frontend. `verify_jwt=false` es intencional: invitación valida la identidad con Auth y el rol real; el dispatcher valida su secreto exclusivo.

La invitación envía un correo real al trabajador y asigna su rol mediante la sesión del superadministrador. Si falla la asignación, la cuenta queda sin privilegios y se informa el fallo. El trabajador establece contraseña desde el flujo de invitación/recuperación. Los proveedores y entregas reales requieren configuración externa.

Agregar `/admin/set-password` a las URLs de retorno permitidas. La invitación lleva a esa ruta; `/admin/recover` permite solicitar recuperación desde el login. Los administradores de sede ven sus horarios y feriados en Configuración, mientras las políticas generales quedan reservadas al superadministrador.

## Pruebas y despliegue

```sh
npm run build
npm run lint
npm test
```

`test:unit` ejecuta Vitest. `test:db` crea un PostgreSQL real temporal y aislado, aplica todas las migraciones/seed, emula únicamente el contexto Auth (`auth.uid`) y prueba concurrencia, restricciones, holds vencidos, mantenimiento, cancelación, RLS, permisos, filtros, métricas y cola. No prueba el servidor Auth, entrega SMTP, cámara ni transporte Realtime; esos requieren Supabase integrado. En Windows el inicio de PostgreSQL puede necesitar ejecutar fuera del sandbox del editor. El clúster temporal se detiene al terminar.

En Supabase alojado: `supabase link --project-ref <ref>` y `supabase db push`, sin seed demo en producción. Aplicar configuración Auth/SMTP/redirects, publicar eventos Realtime y verificar cron. Ejecutar build y desplegar `dist/` en hosting estático con fallback de rutas a `/index.html`, HTTPS y variables públicas del proyecto correcto. No subir `legacy/` como parte de `dist/`.

Definiciones de métricas: ocupación = reservas no canceladas / carriles-horarios habilitados en el rango, excluyendo mantenimiento/feriados; incluye no-show porque consumió inventario. Asistencias = check-ins y completadas. Clientes recurrentes = más de una reserva no cancelada en el rango. Usuarios nuevos = perfiles creados en el rango con reserva dentro del ámbito filtrado. Disponibles hoy cuenta oportunidades carril-horario futuras, no carriles físicos únicos. Los KPIs de hoy/futuras usan la fecha actual y los otros indicadores el rango seleccionado.

Referencias: [funciones y permisos Supabase](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Cron](https://supabase.com/docs/guides/cron), [restricciones de rangos PostgreSQL](https://www.postgresql.org/docs/17/rangetypes.html).

Resultado de las verificaciones y límites del entorno: [docs/VALIDACION.md](docs/VALIDACION.md). Las notificaciones guardan una instantánea al encolarse para mantener estable el contenido durante reintentos; la deduplicación de correo del proveedor tiene una ventana de [24 horas](https://resend.com/docs/dashboard/emails/idempotency-keys).
