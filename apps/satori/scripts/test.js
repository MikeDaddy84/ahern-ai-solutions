import { spawnSync } from 'node:child_process';
const chicago = process.argv[2] === 'chicago';
const files = chicago ? 'src/tests/rrule-dst.test.ts' : 'src/tests/*.test.ts';
const result = spawnSync(process.execPath, ['--import=tsx', '--experimental-test-module-mocks', '--test', files], {
  stdio:'inherit', env:{...process.env, TZ:chicago ? 'America/Chicago' : 'UTC'}
});
process.exitCode = result.status ?? 1;
