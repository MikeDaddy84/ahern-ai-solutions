import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDb } from './client.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrate() {
  const db = createDb();
  console.log('Running migrations...');
  
  const migrationsFolder = path.join(__dirname, 'migrations');
  
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');
  process.exit(0);
}

runMigrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

