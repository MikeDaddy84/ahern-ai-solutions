// Private configuration and backup data must live outside this public repository.
// Usage: node scripts/backup-repo.js <run|verify|status> <private-config.json>
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function command(exe, args, cwd, env = process.env) {
  const result = spawnSync(exe, args, { cwd, env, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    // Tool output may contain paths or service details. Keep detailed output local.
    throw new Error(`${path.basename(exe)} ${args[0]} failed (exit ${result.status ?? 'unavailable'}). ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout;
}
function inside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function loadConfig(filename) {
  const config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  for (const key of ['workspace', 'stateDir', 'restic', 'passwordFile', 'repository', 'repositoryId']) {
    if (typeof config[key] !== 'string' || !config[key]) throw new Error(`Missing ${key}`);
  }
  for (const key of ['workspace', 'stateDir', 'restic', 'passwordFile', 'repository']) {
    if (!path.isAbsolute(config[key])) throw new Error(`${key} must be absolute`);
  }
  if (inside(config.workspace, config.stateDir) || path.resolve(config.workspace) === path.resolve(config.stateDir)) throw new Error('Backup state must be outside the public workspace');
  if (inside(config.workspace, config.passwordFile) || inside(config.workspace, config.repository)) throw new Error('Backup key and repository must be outside the public workspace');
  if (inside(config.repository, config.passwordFile) || inside(config.repository, config.stateDir) || path.resolve(config.repository) === path.resolve(config.stateDir)) throw new Error('Private state and key must not be inside the encrypted repository');
  config.source = 'https://github.com/MikeDaddy84/ahern-ai-solutions.git';
  return config;
}
function restic(config, args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('RESTIC_')) delete env[key];
  return command(config.restic, ['--repo', config.repository, '--password-file', config.passwordFile, '--cache-dir', path.join(config.stateDir, 'cache'), ...args], config.stateDir, env);
}
function assertRepository(config) {
  const remote = JSON.parse(restic(config, ['cat', 'config']));
  if (remote.id !== config.repositoryId) throw new Error('Backup repository identity mismatch; no backup or retention performed');
}
function verify(config, snapshot) {
  const report = JSON.parse(restic(config, ['dump', snapshot, '/manifest.json']));
  const restoreDir = path.join(config.stateDir, 'restore-checks', `${Date.now()}`);
  fs.mkdirSync(restoreDir, { recursive: true });
  fs.writeFileSync(path.join(restoreDir, '.ahernai-restore'), snapshot);
  restic(config, ['restore', snapshot, '--target', restoreDir]);
  for (const [relative, expected] of Object.entries(report.workspaceHashes || {})) {
    const restored = path.resolve(restoreDir, 'workspace-files', relative);
    if (!inside(path.join(restoreDir, 'workspace-files'), restored)) throw new Error('Unsafe manifest file path');
    const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(restored)).digest('hex');
    if (actual !== expected) throw new Error('Restored workspace file failed checksum validation');
  }
  const mirror = path.join(restoreDir, 'repo.git');
  command('git', ['fsck', '--full'], mirror);
  const head = command('git', ['rev-parse', 'refs/heads/main'], mirror).trim();
  if (head !== report.mainCommit) throw new Error('Restored main does not match the snapshot manifest');
  const refs = command('git', ['for-each-ref', '--format=%(refname) %(objectname)'], mirror).trim();
  if (refs !== report.refs) throw new Error('Restored refs do not match the snapshot manifest');
  const checkout = path.join(restoreDir, 'checkout');
  command('git', ['clone', '--no-hardlinks', '--branch', 'main', mirror, checkout], config.stateDir);
  command('git', ['fsck', '--full'], checkout);
  // Leave the restored checkout for independent build/test verification.
  return { snapshot, restoredCommit: head, checkout };
}
function captureWorkspace(config, stage) {
  const destination = path.join(stage, 'workspace-files');
  // Delete only our exact staging child after verifying its real parent and type.
  if (fs.existsSync(destination)) {
    if (!inside(stage, destination) || fs.realpathSync(path.dirname(destination)) !== fs.realpathSync(stage) || fs.lstatSync(destination).isSymbolicLink()) throw new Error('Unsafe staging cleanup path');
    fs.rmSync(destination, { recursive: true });
  }
  fs.mkdirSync(destination);
  const files = [...new Set(command('git', ['ls-files', '-co', '--exclude-standard', '-z'], config.workspace).split('\0').filter(Boolean))];
  const hashes = {};
  for (const relative of files) {
    if (/(^|\/)\.env($|\.)/.test(relative) && !relative.endsWith('.env.example')) continue;
    const source = path.resolve(config.workspace, relative);
    if (!inside(config.workspace, source) || !fs.existsSync(source)) continue;
    if (fs.lstatSync(source).isSymbolicLink() || !inside(fs.realpathSync(config.workspace), fs.realpathSync(source))) throw new Error('Workspace file escapes project boundary');
    if (!fs.statSync(source).isFile()) continue;
    const target = path.resolve(destination, relative);
    if (!inside(destination, target)) throw new Error('Unsafe workspace destination');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    hashes[relative] = require('node:crypto').createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  }
  return hashes;
}
function cleanupRestores(config) {
  const root = path.join(config.stateDir, 'restore-checks');
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d{13}$/.test(entry.name)).map(entry => path.join(root, entry.name)).filter(dir => fs.existsSync(path.join(dir, '.ahernai-restore'))).sort().reverse();
  for (const dir of dirs.slice(3)) {
    if (!inside(root, dir) || fs.realpathSync(path.dirname(dir)) !== fs.realpathSync(root) || fs.lstatSync(dir).isSymbolicLink()) throw new Error('Unsafe restore cleanup path');
    fs.rmSync(dir, { recursive: true });
  }
}
function run(config) {
  assertRepository(config);
  const stage = path.join(config.stateDir, 'staging');
  const mirror = path.join(stage, 'repo.git');
  fs.mkdirSync(stage, { recursive: true });
  if (fs.existsSync(mirror)) {
    const origin = command('git', ['remote', 'get-url', 'origin'], mirror).trim();
    if (origin !== config.source) throw new Error('Staging mirror has an unexpected origin');
    command('git', ['remote', 'update', '--prune'], mirror);
  } else command('git', ['clone', '--mirror', config.source, mirror], stage);
  command('git', ['fsck', '--full'], mirror);
  // Preserve large-file payloads as well as Git pointer blobs when LFS is used.
  command('git', ['lfs', 'fetch', '--all'], mirror);
  const workspaceHashes = captureWorkspace(config, stage);
  const manifest = {
    createdAt: new Date().toISOString(), source: config.source,
    mainCommit: command('git', ['rev-parse', 'refs/heads/main'], mirror).trim(),
    refs: command('git', ['for-each-ref', '--format=%(refname) %(objectname)'], mirror).trim(),
    workspaceHashes,
    includes: ['GitHub Git history and refs', 'README recovery documentation', 'tracked and non-ignored untracked workspace files'],
    excludes: ['ignored local files and original assets', 'live databases', 'secrets', 'GitHub issue/PR metadata and release attachments']
  };
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // Relative paths keep snapshot paths portable and stable across machines.
  const output = command(config.restic, ['--repo', config.repository, '--password-file', config.passwordFile, '--cache-dir', path.join(config.stateDir, 'cache'), 'backup', '--json', '--tag', 'ahernai-git', '--host', 'ahernai-backup', 'repo.git', 'manifest.json', 'workspace-files'], stage,
    Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RESTIC_'))));
  const summary = output.trim().split(/\r?\n/).map(line => JSON.parse(line)).find(line => line.message_type === 'summary');
  if (!summary?.snapshot_id) throw new Error('Backup did not report a completed snapshot');
  const check = verify(config, summary.snapshot_id);
  restic(config, ['check', '--read-data']);
  // Retention runs only after a successful backup, content check, and restore.
  // The fixed tag/host and repository-ID check limit it to this backup set.
  restic(config, ['forget', '--tag', 'ahernai-git', '--host', 'ahernai-backup', '--group-by', 'host,tags', '--keep-daily', '30', '--keep-monthly', '12', '--prune']);
  restic(config, ['check']);
  cleanupRestores(config);
  const result = { ok: true, completedAt: new Date().toISOString(), mainCommit: manifest.mainCommit, ...check };
  fs.writeFileSync(path.join(config.stateDir, 'last-success.json'), JSON.stringify(result, null, 2));
  return result;
}

function main() {
  const [mode, configPath] = process.argv.slice(2);
  if (!['run', 'verify', 'status'].includes(mode) || !configPath) throw new Error('Usage: backup-repo.js <run|verify|status> <private-config.json>');
  const config = loadConfig(configPath);
  fs.mkdirSync(config.stateDir, { recursive: true });
  const lockPath = path.join(config.stateDir, 'run.lock');
  const lock = fs.openSync(lockPath, 'wx');
  try {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    assertRepository(config);
    let result;
    if (mode === 'run') result = run(config);
    if (mode === 'status') result = JSON.parse(restic(config, ['snapshots', '--json', '--tag', 'ahernai-git', '--host', 'ahernai-backup']));
    if (mode === 'verify') {
      const snapshots = JSON.parse(restic(config, ['snapshots', '--json', '--tag', 'ahernai-git', '--host', 'ahernai-backup']));
      if (!snapshots.length) throw new Error('No snapshots to verify');
      result = verify(config, snapshots.sort((a, b) => a.time.localeCompare(b.time)).at(-1).id);
      restic(config, ['check', '--read-data']);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { loadConfig, inside, command, restic, assertRepository };
