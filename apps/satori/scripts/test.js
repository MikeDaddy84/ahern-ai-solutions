import { spawnSync } from 'node:child_process';
const chicago=process.argv[2]==='chicago';
const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...(chicago?['src/tests/rrule-dst.test.ts']:[])],{stdio:'inherit',env:{...process.env,TZ:chicago?'America/Chicago':'UTC'}});
process.exit(result.status ?? 1);
