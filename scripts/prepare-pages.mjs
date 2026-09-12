import { copyFile, mkdir, writeFile } from 'node:fs/promises';

// Pages serves known routes directly; the fallback also preserves dynamic receipt URLs.
const routes = ['mis-reservas', 'admin', ...[
  'login', 'recover', 'set-password', 'dashboard', 'reservations', 'check-in',
  'reports', 'control', 'maintenance', 'pools', 'lanes', 'users', 'settings',
  'venues', 'staff', 'audit',
].map(route => `admin/${route}`)];
await copyFile('dist/index.html', 'dist/404.html');
await writeFile('dist/.nojekyll', '');
for (const route of routes) {
  await mkdir(`dist/${route}`, { recursive: true });
  await copyFile('dist/index.html', `dist/${route}/index.html`);
}
console.log(`GitHub Pages: ${routes.length} direct routes and SPA fallback prepared.`);
