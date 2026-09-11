import 'dotenv/config';
import xlsx from 'xlsx';
import { createDb } from '../src/db/client.js';
import { tasks, NewTask } from '../src/db/schema.js';
import { randomUUID } from 'crypto';

const isExecute = process.argv.includes('--execute');

export function parseSheetDateToDayKey(sheetName: string): string | null {
  const match = sheetName.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (!match) return null;
  const m = parseInt(match[1], 10);
  const d = parseInt(match[2], 10);
  let y = parseInt(match[3], 10);
  if (y < 100) {
    y += 2000;
  }
  return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

export function excelDateToTimestamp(excelDate: number): number {
  if (typeof excelDate !== 'number' || isNaN(excelDate)) return Date.now();
  return Math.round((excelDate - 25569) * 86400 * 1000);
}

export async function importWorkingSet() {
  console.log(`Starting working set import... (${isExecute ? 'EXECUTE' : 'DRY RUN'})`);

  const db = createDb();
  let wb: xlsx.WorkBook;
  try {
    wb = xlsx.readFile('.scratch/satori-legacy.xlsx');
  } catch (err) {
    console.error('Could not read .scratch/satori-legacy.xlsx');
    return;
  }

  // Find the latest daily sheet
  let latestDayKey = '';
  let latestSheetName = '';

  for (const sheetName of wb.SheetNames) {
    const dayKey = parseSheetDateToDayKey(sheetName);
    if (dayKey) {
      if (dayKey > latestDayKey) {
        latestDayKey = dayKey;
        latestSheetName = sheetName;
      }
    }
  }

  if (!latestSheetName) {
    console.error('No daily sheets found.');
    return;
  }

  console.log(`Found latest sheet: ${latestSheetName} (${latestDayKey})`);

  // Fetch all existing tasks to ensure idempotency across all statuses
  const existingTasks = await db.select({ text: tasks.text }).from(tasks);
  const existingTaskSet = new Set(existingTasks.map(t => t.text.trim().toLowerCase()));

  const sheet = wb.Sheets[latestSheetName];
  const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  const startRow = 2; // Data rows start at index 2
  const toInsert: NewTask[] = [];

  let skippedCalendarEvents = 0;
  let skippedDone = 0;
  let skippedDuplicates = 0;
  let totalProcessed = 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i] || [];

    const extract = (textCol: number, doneCol: number, type: 'have_to' | 'need_to' | 'want_to') => {
      const textVal = row[textCol];
      if (typeof textVal === 'string' && textVal.trim() !== '') {
        totalProcessed++;
        const textStr = textVal.trim();
        const isDone = row[doneCol] === true;

        if (isDone) {
          skippedDone++;
          return;
        }

        if (textStr.startsWith('📅')) {
          skippedCalendarEvents++;
          return;
        }

        if (existingTaskSet.has(textStr.toLowerCase())) {
          skippedDuplicates++;
          return;
        }

        const dateAdded = new Date(`${latestDayKey}T12:00:00Z`).getTime(); // Approximate sheet date

        toInsert.push({
          id: randomUUID(),
          text: textStr,
          type,
          status: 'backlog',
          dateAdded,
          source: 'manual'
        });
      }
    };

    extract(0, 1, 'have_to');
    extract(2, 3, 'need_to');
    extract(4, 5, 'want_to');
  }

  console.log('--- DRY RUN RESULTS ---');
  console.log(`Total non-empty tasks checked: ${totalProcessed}`);
  console.log(`Skipped (already done on sheet): ${skippedDone}`);
  console.log(`Skipped (calendar events 📅): ${skippedCalendarEvents}`);
  console.log(`Skipped (duplicates in DB): ${skippedDuplicates}`);
  console.log(`To insert (backlog): ${toInsert.length}`);

  if (toInsert.length > 0) {
    console.log('\nTasks to insert:');
    toInsert.forEach(t => console.log(`  [${t.type}] ${t.text}`));
  }

  if (isExecute) {
    if (toInsert.length > 0) {
      await db.insert(tasks).values(toInsert);
      console.log(`\nEXECUTE: Successfully inserted ${toInsert.length} tasks into backlog.`);
    } else {
      console.log('\nEXECUTE: No tasks to insert.');
    }
  } else {
    console.log('\nRun with --execute to perform the import.');
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1] === new URL(import.meta.url).pathname) {
  importWorkingSet().catch(console.error);
}

