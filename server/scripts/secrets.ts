/** Shared by scripts: load the same tokens the server uses (env or data/secrets.json). */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSecrets } from '../src/auth.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
export const secrets = loadSecrets(join(root, 'data', 'secrets.json'));
