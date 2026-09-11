const { execFileSync } = require('node:child_process');
const { cpSync } = require('node:fs');
const path = require('node:path');
const cwd = path.join(__dirname, '../apps/satori');
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {cwd,stdio:'inherit'});
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], {cwd,stdio:'inherit'});
cpSync(path.join(cwd,'src/db/migrations'), path.join(cwd,'dist/db/migrations'), {recursive:true});
