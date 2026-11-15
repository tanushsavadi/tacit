import { defineConfig } from '../../server/node_modules/vitest/dist/config.js';
export default defineConfig({ test: { include: ['docs/qa/*.test.ts'], testTimeout: 10000 } });
