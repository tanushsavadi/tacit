// Opens the private TACIT workspace in the default browser without printing the access token.
import { execFile } from 'node:child_process';
import { secrets } from './secrets.ts';

const base = process.argv[2] ?? `http://127.0.0.1:${process.env.PORT ?? 8790}`;
execFile('open', [`${base}/?token=${encodeURIComponent(secrets.userToken)}`], (e) => {
  if (e) { console.error('could not open the browser'); process.exit(1); }
  console.log(`opened the TACIT workspace (${base}, token not shown)`);
});
