import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';
import { readFileSync } from 'node:fs';

export type AppDatabase = ReturnType<typeof createDb>;

export function createDb(url?: string, authToken?: string) {
  let dbUrl = url || process.env.TURSO_DATABASE_URL;
  if (!dbUrl && process.env.USE_LOCAL_DB === 'true') {
    dbUrl = 'file:satori.db';
  }
  if (!dbUrl && !url?.startsWith('file::memory:')) {
    throw new Error('No database URL provided and USE_LOCAL_DB is not true.');
  }
  dbUrl = dbUrl || 'file::memory:'; // Fallback for memory usage in tests

  const client = createClient({
    url: dbUrl,
    authToken: authToken || process.env.TURSO_AUTH_TOKEN,
  });

  return drizzle(client, { schema });
}

export async function initTables(db: AppDatabase) {
  if (schema.portalMode) {
    const source = readFileSync(new URL('../../../../lib/portal-schema.sql', import.meta.url), 'utf8');
    const statements = source.replace(/^--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
    for (const statement of statements) await db.run(sql.raw(statement));
    return;
  }
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      date_added INTEGER NOT NULL,
      date_done INTEGER,
      day_key TEXT,
      calendar_uid TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual'
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS day_log (
      day_key TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      summary_json TEXT NOT NULL
    );
  `));
}
