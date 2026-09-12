# Validación de EMUSS V2

Fecha: 11 de septiembre de 2026.

## Verificado

- `npm run lint`: sin errores.
- `npm run build`: TypeScript estricto y compilación Vite correctos. Advertencias no bloqueantes de comentarios de Zod y tamaño del bundle principal (694 kB, 207 kB gzip). El panel administrativo y el lector de cámara se cargan por separado.
- `npm test`: 4 pruebas unitarias y 27 comprobaciones de integración PostgreSQL aprobadas.
- Todas las migraciones y el seed se aplicaron desde cero en PostgreSQL 18 temporal. Se emuló únicamente `auth.users`/`auth.uid()` y los roles de conexión para ejecutar RLS; las tablas, RPC, bloqueos, transacciones e índices fueron reales.
- Sintaxis TypeScript de las tres unidades de Edge Functions comprobada; no equivale a ejecución ni chequeo completo con Deno.
- Navegador a 1440, 768 y 375 píxeles: reserva pública sin conexión, acceso a Mis reservas por OTP, login administrativo, redirección de rutas protegidas. Sin excepciones de página ni desbordamiento horizontal en las vistas inspeccionadas. Evaluación independiente con el mismo modelo; no se disponía de un proveedor distinto.
- Después de corregir los textos y enlaces: ocho comprobaciones adicionales de navegador aprobadas (reserva, login, recuperación y activación, a 1440 y 375 píxeles). Capturas finales en [screenshots/](screenshots/), incluyendo [escritorio](screenshots/booking-1440.png) y [móvil](screenshots/login-375.png).
- Proyecto alojado `emuss-v2` creado y conectado: seis migraciones aplicadas a PostgreSQL 17, seed con 3 sedes, 3 piscinas, 24 carriles y 1488 horarios. Las 16 tablas tienen RLS. Los roles anónimo y autenticado no pueden ejecutar las funciones internas comprobadas de cola/trabajos.
- Inicio de sesión real con correo/contraseña de `u201916314@upc.edu.pe` aprobado. Se verificó su rol `SUPER_ADMIN` activo y la RPC `get_my_roles` con su sesión; las credenciales no se imprimieron.
- Cron de reservas activo cada minuto, con 10 ejecuciones exitosas observadas. Las dos Edge Functions están desplegadas; sus endpoints respondieron y rechazaron GET con HTTP 405.
- Catálogo y disponibilidad consultados mediante PostgREST real; suscripción Realtime aceptada (`SUBSCRIBED`). Resultado reproducible de solo lectura en [supabase-health.json](supabase-health.json), generado con `node scripts/check-supabase.mjs`.
- Navegador conectado al proyecto alojado a 1440 y 375 píxeles: ocho carriles disponibles en la piscina seleccionada, selección de carril y apertura del formulario de acceso sin enviar correo. Sin excepciones de página ni desbordamiento horizontal. Capturas: [escritorio conectado](screenshots/hosted-booking-1440.png) y [móvil conectado](screenshots/hosted-booking-375.png).

## Casos PostgreSQL

1. Dos usuarios compiten por un carril: un solo hold.
2. Dos confirmaciones concurrentes: una sola reserva.
3. Un carril confirmado rechaza otro usuario.
4. Un usuario compite por dos carriles: un solo hold.
5. Otro usuario no puede consumir un hold ajeno.
6. Hold expirado rechaza confirmación.
7. Hold expirado aparece disponible sin depender del cron.
8. Cancelación libera el carril para otra reserva.
9. Mantenimiento rechaza hold.
10. Mantenimiento no puede reemplazar reservas.
11. RLS oculta reservas de otros clientes.
12. Escrituras directas a reservas denegadas.
13. Helpers privados inaccesibles desde el cliente.
14. Recepción no puede modificar configuración.
15. Administrador de sede no puede mantener otra sede.
16. Último superadministrador no puede desactivarse.
17. Catálogo anónimo sin datos personales.
18. Catálogo administrativo/filtros limitados por sede.
19. Dashboard calcula ocupación desde registros reales.
20. Historial del cliente admite el rango completo.
21. Guardado de configuración con id único.
22. Regeneración conserva slots comprometidos.
23. Cola de notificaciones privada con reclamación temporal.
24. Usuario no puede reservar simultáneamente en otra sede.
25. Mantenimiento y hold concurrentes: solo uno gana.
26. Reprogramación libera origen y ocupa destino atómicamente.
27. Check-in idempotente y trabajo automático de NO_SHOW/COMPLETED.

## Pendiente de entorno integrado

`.env.local` ya está configurado y las migraciones están aplicadas al proyecto alojado. La aceptación de una suscripción Realtime comprueba la conexión; todavía no demuestra la recepción de un evento tras reservar.

Tras la indicación del usuario se ejecutó `scripts/bootstrap-owner.mjs` y se creó `u201916314@upc.edu.pe` como SUPER_ADMIN, con contraseña inicial guardada en `.env.owner` excluido de Git. `scripts/test-supabase.mjs` sigue pendiente de autorización específica para crear cuentas y reservas temporales, tras el rechazo de la revisión automática de permisos.

Falta comprobar entrega real del correo de acceso, invitaciones/recuperación, sesión y reserva autenticadas, eventos de cambios y reconexión Realtime, cámara QR y entrega de notificaciones. El proveedor predeterminado no permitió personalizar la plantilla para mostrar OTP: queda el enlace de acceso. No hay SMTP propio ni credenciales de Resend/WhatsApp configurados; el dispatcher está desplegado, pero no tiene proveedor ni programación de envíos.

Las pantallas autenticadas están implementadas; su apariencia y comportamiento con sesión Supabase real no quedaron validados en el navegador durante esta ejecución. Las pruebas PostgreSQL locales no sustituyen la validación de GoTrue/Auth ni la entrega de correo. Ver [SUPABASE.md](SUPABASE.md) para el estado del despliegue.
