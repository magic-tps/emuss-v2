# GitHub Pages

URL pública: https://magic-tps.github.io/emuss-v2/

Acceso administrativo: https://magic-tps.github.io/emuss-v2/admin/login/

Publicación verificada el 12 de septiembre de 2026: [workflow exitoso](https://github.com/magic-tps/emuss-v2/actions/runs/34683580934). Se comprobó disponibilidad en móvil/escritorio y acceso SUPER_ADMIN real, incluyendo recarga del dashboard. Evidencia en [pages-validation.json](pages-validation.json).

La V2 se publica desde la carpeta `v2/` del repositorio `LuisTE1/proyecto-emuss`. El código anterior de la raíz se conserva. El workflow `.github/workflows/deploy.yml` instala con Node 22, valida lint y pruebas unitarias, compila V2 y publica únicamente `dist` mediante GitHub Pages.

`npm run build:pages` configura el nombre del repositorio (`/emuss-v2/` por defecto) como base de recursos y rutas. Genera entradas HTML para las rutas estáticas y `404.html` para los comprobantes con código dinámico. La URL y sus parámetros de autenticación se conservan. Los enlaces de correo y recuperación incluyen el directorio de Pages.

Supabase Auth admite los retornos públicos y locales. `APP_URL` de las Edge Functions apunta al sitio público. Gmail SMTP está activado para Auth y avisos de reserva; ver [GMAIL.md](GMAIL.md).

La copia publicada contiene `.env.production` con **solo** la URL de Supabase y la clave pública `anon`, que también forma parte del JavaScript del navegador. Las credenciales privilegiadas, contraseña del administrador, archivos locales de despliegue y `node_modules` quedan fuera de la publicación.

Referencia: [despliegue estático de Vite](https://vite.dev/guide/static-deploy.html#github-pages).
