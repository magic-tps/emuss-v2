import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'emuss-v2';
if (!/^[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository name');
const base = repository.endsWith('.github.io') ? '/' : `/${repository}/`;
for (const [entry, args] of [
  ['typescript/bin/tsc', ['-b']],
  ['vite/bin/vite.js', ['build', '--base', base]],
]) {
  const result = spawnSync(process.execPath, [resolve('node_modules', entry), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await import('./prepare-pages.mjs');
