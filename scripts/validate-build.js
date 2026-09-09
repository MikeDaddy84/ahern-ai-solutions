// Express serves source directly. Deployment validation checks syntax and assets.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
for (const file of ['server.js', ...walk('lib'), ...walk('public')].filter(file => /\.(m?js)$/.test(file))) execFileSync(process.execPath, ['--check', file]);
for (const file of ['node_modules/three/build/three.module.js', 'node_modules/three/build/three.core.js', 'node_modules/three/examples/jsm/environments/RoomEnvironment.js', 'public/pc-builder.html', 'public/studio.css']) if (!fs.existsSync(file)) throw new Error('Missing required asset: ' + file);
console.log('Build validation passed. Express source and 3D assets are ready.');
