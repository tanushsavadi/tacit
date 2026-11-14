/** Run from your own Mac Terminal. Opens the real app in normal Chrome, not a Playwright profile. */
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const origin = 'http://localhost:5173';
try {
  const tokens = JSON.parse(await readFile(new URL('../../server/data/secrets.json', import.meta.url), 'utf8'));
  if (typeof tokens.userToken !== 'string' || typeof tokens.callerToken !== 'string') throw new Error('Access codes unavailable');
  const response = await fetch(`${origin}/api/health`, { headers: { Authorization: `Bearer ${tokens.userToken}` }, signal: AbortSignal.timeout(4000) });
  const health = await response.json();
  if (!response.ok || !health.services) throw new Error('Authenticated backend connection unavailable');
  console.log(`Frontend: ${origin}/`);
  console.log(`Caller: ${origin}/#caller`);
  console.log(`Authenticated backend: connected · phase ${health.phase}`);
  console.log('Workspace: continuous silent speech · readiness is shown in the app.');
  if (!process.argv.includes('--check')) {
    if (process.platform !== 'darwin') throw new Error('This launcher is for macOS; open the private links from server/npm run links locally instead.');
    const workspace = new URL('/', origin); workspace.searchParams.set('token', tokens.userToken);
    const caller = new URL('/', origin); caller.searchParams.set('invite', tokens.callerToken); caller.hash = 'caller';
    await promisify(execFile)('open', ['-a', 'Google Chrome', workspace.href, caller.href]);
    console.log('Requested two Chrome tabs: TACIT workspace and Caller companion.');
    console.log('Private access codes were not printed. The app removes them from its address bar.');
  }
} catch {
  console.error('Could not open TACIT. Verify frontend :5173 and backend :8790 are running and local access codes match the backend. No credentials were printed.');
  process.exitCode = 1;
}
