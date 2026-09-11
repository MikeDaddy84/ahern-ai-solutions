import dotenv from 'dotenv';
dotenv.config();

import { createDb } from '../db/client.js';
import { buildApp } from './app.js';

async function start() {
  const port = parseInt(process.env.PORT || '8080', 10);
  const host = process.env.HOST || '0.0.0.0';

  console.log('Initializing database client...');
  const db = createDb();

  const app = buildApp(db);

  try {
    const address = await app.listen({ port, host });
    console.log(`⚡ SATORI server running at ${address}`);
  } catch (err) {
    console.error('Failed to start SATORI server:', err);
    process.exit(1);
  }
}

start();

