// Launch from Terminal without putting credentials in command-line arguments, URLs, logs or the app bundle.
// This also avoids making an ad-hoc-signed GUI app ask for access to the whole Documents folder.
import { readFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const companion = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(companion, '../..');
const executable = join(companion, '.build/TACIT.app/Contents/MacOS/TacitCompanion');
if (!existsSync(executable)) throw new Error('Build first: macos/TacitCompanion/build-app.sh');
const { userToken } = JSON.parse(readFileSync(join(root, 'server/data/secrets.json'), 'utf8'));
if (typeof userToken !== 'string' || !userToken) throw new Error('Start the TACIT server first.');
const args = process.argv.slice(2);
const launchEnv = { ...process.env, TACIT_USER_TOKEN: userToken, TACIT_REPO_ROOT: root };
if (args.includes('--selftest')) {
  const result = spawnSync(executable, args, { env: launchEnv, cwd: root, stdio: 'inherit', timeout: 45000 });
  process.exit(result.status ?? 1);
}
const child = spawn(executable, args, {
  detached: true, stdio: 'ignore', cwd: root,
  env: launchEnv,
});
child.unref();
console.log('TACIT companion launch requested.');
