import 'dotenv/config';
import xlsx from 'xlsx';
import { createDb } from '../src/db/client.js';
import { tasks, dayLog, NewTask, DayLog } from '../src/db/schema.js';
import { randomUUID } from 'crypto';

const isExecute = process.argv.includes('--execute');

export function excelDateToTimestamp(excelDate: number): number {
  if (typeof excelDate !== 'number' || isNaN(excelDate)) return Date.now();
  return Math.round((excelDate - 25569) * 86400 * 1000);
}

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

export function mapType(typeStr: string): 'have_to' | 'need_to' | 'want_to' {
  const t = typeStr?.toLowerCase().trim();
  if (t === 'have to') return 'have_to';
  if (t === 'need to') return 'need_to';
  if (t === 'want to') return 'want_to';
  return 'have_to';
}

export function buildSnapshotTasks(rows: any[], dayKey: string): NewTask[] {
  const snapshotTasks: NewTask[] = [];
  const startRow = 2; // Data rows start at index 2
  
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i] || [];
    
    const extract = (textCol: number, doneCol: number, type: 'have_to' | 'need_to' | 'want_to') => {
      const textVal = row[textCol];
      if (typeof textVal === 'string' && textVal.trim() !== '') {
        const isDone = row[doneCol] === true;
        snapshotTasks.push({
          id: randomUUID(),
          text: textVal.trim(),
          type,
          status: isDone ? 'done' : 'today',
          dateAdded: Date.now(),
          dateDone: isDone ? Date.now() : null,
          dayKey,
          source: 'manual',
          sortOrder: Date.now()
        });
      }
    };

    extract(0, 1, 'have_to');
    extract(2, 3, 'need_to');
    extract(4, 5, 'want_to');
  }
  
  return snapshotTasks;
}

export async function importLegacy() {
  console.log(`Starting legacy import... (${isExecute ? 'EXECUTE' : 'DRY RUN'})`);
  
  const db = createDb();
  let wb: xlsx.WorkBook;
  try {
    wb = xlsx.readFile('.scratch/satori-legacy.xlsx');
  } catch (err) {
    console.error('Could not read .scratch/satori-legacy.xlsx');
    return;
  }

  const toInsertBacklog: NewTask[] = [];
  const toInsertArchived: NewTask[] = [];
  const toInsertDayLogs: typeof dayLog.$inferInsert[] = [];
  
  let skippedDuplicateTasks = 0;
  let skippedExistingDayKeys = 0;

  // Fetch existing tasks to ensure idempotency for backlog/archived
  const existingTasks = await db.select({ text: tasks.text, type: tasks.type }).from(tasks);
  const existingTaskSet = new Set(existingTasks.map(t => `${t.type}:${t.text.trim().toLowerCase()}`));

  // Fetch existing day logs
  const existingLogs = await db.select({ dayKey: dayLog.dayKey }).from(dayLog);
  const existingLogSet = new Set(existingLogs.map(l => l.dayKey));

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    if (sheetName === 'To Do List' || sheetName === 'Completed') {
      let taskIdx = -1, typeIdx = -1, addedIdx = -1, doneIdx = -1, dateDoneIdx = -1;
      let headerRowIdx = -1;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || [];
        if (row.includes('Task') && row.includes('Type')) {
          taskIdx = row.indexOf('Task');
          typeIdx = row.indexOf('Type');
          addedIdx = row.indexOf('Date Added');
          doneIdx = row.indexOf('Done');
          dateDoneIdx = row.indexOf('Date Done');
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx !== -1) {
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const row = rows[i] || [];
          const textVal = row[taskIdx];
          if (typeof textVal === 'string' && textVal.trim() !== '') {
            const textStr = textVal.trim();
            const typeStr = row[typeIdx] || '';
            const mappedType = mapType(typeStr);
            const key = `${mappedType}:${textStr.toLowerCase()}`;
            
            if (existingTaskSet.has(key)) {
              skippedDuplicateTasks++;
              continue;
            }

            const isDone = sheetName === 'Completed' ? true : (row[doneIdx] === true);
            const dateAdded = excelDateToTimestamp(row[addedIdx]);
            const dateDone = isDone ? excelDateToTimestamp(row[dateDoneIdx]) : null;

            const task: NewTask = {
              id: randomUUID(),
              text: textStr,
              type: mappedType,
              status: isDone ? 'archived' : 'backlog',
              dateAdded,
              dateDone,
              source: 'manual'
            };

            if (isDone) {
              toInsertArchived.push(task);
            } else {
              toInsertBacklog.push(task);
            }
            existingTaskSet.add(key);
          }
        }
      }
    } else {
      // Daily sheets
      const dayKey = parseSheetDateToDayKey(sheetName);
      if (dayKey) {
        if (existingLogSet.has(dayKey)) {
          skippedExistingDayKeys++;
          continue;
        }

        const snapshotTasks = buildSnapshotTasks(rows, dayKey);
        if (snapshotTasks.length > 0) {
          const summary = {
            dayKey,
            createdAt: Date.now(),
            tasks: snapshotTasks
          };

          toInsertDayLogs.push({
            dayKey,
            createdAt: Date.now(),
            summaryJson: JSON.stringify(summary)
          });
          existingLogSet.add(dayKey);
        }
      }
    }
  }

  console.log('--- DRY RUN PLAN ---');
  console.log(`Backlog inserts:       ${toInsertBacklog.length}`);
  console.log(`Archived inserts:      ${toInsertArchived.length}`);
  console.log(`Day Log inserts:       ${toInsertDayLogs.length}`);
  console.log(`Skipped (dup tasks):   ${skippedDuplicateTasks} (reason: exact text dedupe)`);
  console.log(`Skipped (dup logs):    ${skippedExistingDayKeys} (reason: day_key already in day_log)`);

  if (isExecute) {
    console.log('Executing...');
    if (toInsertBacklog.length > 0) await db.insert(tasks).values(toInsertBacklog);
    if (toInsertArchived.length > 0) await db.insert(tasks).values(toInsertArchived);
    if (toInsertDayLogs.length > 0) {
      for (let i = 0; i < toInsertDayLogs.length; i += 50) {
        await db.insert(dayLog).values(toInsertDayLogs.slice(i, i + 50));
      }
    }
    console.log('Execution complete.');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importLegacy().catch(console.error).then(() => process.exit(0));
}

