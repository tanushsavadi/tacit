/** Prints the private URLs for this install. Treat them like passwords. */
import { secrets } from './secrets.ts';

const base = process.argv[2] ?? process.env.PUBLIC_URL ?? 'http://localhost:5173';
console.log(`TACIT user (keep private):  ${base}/?token=${secrets.userToken}`);
console.log(`Caller invite (share once): ${base}/?invite=${secrets.callerToken}#caller`);
console.log('Rotate: delete server/data/secrets.json (or set TACIT_USER_TOKEN / TACIT_CALLER_TOKEN) and restart.');
