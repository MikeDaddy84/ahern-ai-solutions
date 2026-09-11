import { eq, and, asc, desc, lte, inArray } from 'drizzle-orm';
import { AppDatabase } from '../../db/client.js';
import { tasks, appMeta, dayLog, taskScope, metaScope, logScope, dayLogConflictTarget } from '../../db/schema.js';
import { getChicagoDayKey } from '../utils/date.js';
import { fetchAllCalendarEventsForDay, getConfiguredCalendars, getAllCalendars } from './calendar.js';
import { CONFIG } from '../../shared/config.js';

let cachedRolloverDay: string | null = null;

export function __setCachedRolloverDayForTest(day: string | null) {
  cachedRolloverDay = day;
}

export type RolloverResult =
  | { executed: false; reason: string; todayKey: string }
  | {
      executed: true;
      todayKey: string;
      calendarImportCount: number;
      calendarImportDetails: Record<string, number>;
      pulledCount: number;
      overflowTrimmedCount: number;
      archivedCount: number;
      purgedLogsCount: number;
    };

export async function runRollover(
  db: AppDatabase,
  options: { force?: boolean; dateKey?: string } = {}
): Promise<RolloverResult> {
  const todayKey = options.dateKey || getChicagoDayKey();
  const now = Date.now();

  // Short-circuit cache check (bypassed by force)
  if (!options.force && cachedRolloverDay === todayKey) {
    return { executed: false as const, reason: 'Already rolled over today (cached)', todayKey };
  }

  // Single transaction for atomic rollover
  return await db.transaction(async (tx) => {
    // 1. Claim / check last_rollover_day
    const [meta] = await tx.select().from(appMeta).where(metaScope(eq(appMeta.key, 'last_rollover_day')));
    const lastRolloverDay = meta?.value;

    if (lastRolloverDay === todayKey && !options.force) {
      cachedRolloverDay = todayKey;
      return { executed: false as const, reason: 'Already rolled over today', todayKey };
    }

    // 2. Snapshot outgoing day
    if (lastRolloverDay && lastRolloverDay !== todayKey) {
      const outgoingTasks = await tx
        .select()
        .from(tasks)
        .where(taskScope(eq(tasks.dayKey, lastRolloverDay)));

      if (outgoingTasks.length > 0) {
        const summary = {
          dayKey: lastRolloverDay,
          createdAt: now,
          tasks: outgoingTasks,
        };

        await tx
          .insert(dayLog)
          .values({
            dayKey: lastRolloverDay,
            createdAt: now,
            summaryJson: JSON.stringify(summary),
          })
          .onConflictDoUpdate({
            target: dayLogConflictTarget,
            set: {
              summaryJson: JSON.stringify(summary),
              createdAt: now,
            },
          });
      }
    }

    // Update app_meta last_rollover_day
    if (meta) {
      await tx
        .update(appMeta)
        .set({ value: todayKey })
        .where(metaScope(eq(appMeta.key, 'last_rollover_day')));
    } else {
      await tx.insert(appMeta).values({ key: 'last_rollover_day', value: todayKey });
    }

    // 3. Carry over: uncompleted tasks with status='today' get new day_key, source='carryover'
    const todayTasksBefore = await tx
      .select()
      .from(tasks)
      .where(taskScope(eq(tasks.status, 'today')));

    const uncompletedToday = todayTasksBefore.filter((t) => t.status === 'today');

    for (const task of uncompletedToday) {
      await tx
        .update(tasks)
        .set({
          dayKey: todayKey,
          source: 'carryover',
        })
        .where(taskScope(eq(tasks.id, task.id)));
    }

    // 4. Completed 'today' tasks -> status='done' with date_done
    const doneToday = todayTasksBefore.filter((t) => t.status === 'done');
    for (const task of doneToday) {
      await tx
        .update(tasks)
        .set({
          status: 'done',
          dateDone: task.dateDone || now,
        })
        .where(taskScope(eq(tasks.id, task.id)));
    }

    // 5. Calendar import: fetch configured calendars
    const calendars = getConfiguredCalendars();
    let calendarImportCount = 0;
    const calendarImportDetails: Record<string, number> = {};
    for (const cal of calendars) {
      calendarImportDetails[cal.key] = 0;
    }

    const allCals = getAllCalendars();
    for (const cal of allCals) {
      if (!cal.configured) {
        console.log(`[Rollover] Calendar [${cal.key}] SKIPPED (not configured)`);
      }
    }

    if (calendars.length > 0) {
      try {
        const { events, stats } = await fetchAllCalendarEventsForDay(calendars, todayKey);
        const activeTasks = await tx
          .select()
          .from(tasks)
          .where(taskScope(inArray(tasks.status, ['today', 'backlog'])));

        const existingUids = new Set(
          activeTasks
            .filter((t) => t.calendarUid != null)
            .map((t) => t.calendarUid as string)
        );
        const existingTexts = new Set(activeTasks.map((t) => t.text.trim()));

        // Keep track of how many we inserted per source
        const insertedPerSource: Record<string, number> = {};
        for (const cal of calendars) {
          insertedPerSource[cal.key] = 0;
        }

        for (const evt of events) {
          const evtText = evt.formattedEntry.trim();
          if (!existingUids.has(evt.id) && !existingTexts.has(evtText)) {
            const { v4: uuidv4 } = await import('uuid');
            await tx.insert(tasks).values({
              id: uuidv4(),
              text: evtText,
              type: 'have_to',
              status: 'today',
              dateAdded: now,
              dayKey: todayKey,
              source: 'calendar',
              calendarUid: evt.id,
              sortOrder: now,
            });
            existingUids.add(evt.id);
            existingTexts.add(evtText);
            calendarImportCount++;
            calendarImportDetails[evt.sourceKey]++;
            insertedPerSource[evt.sourceKey]++;
          }
        }

        // Log successes and failures
        for (const stat of stats) {
          if (stat.status === 'FAILED') {
            console.error(`[Rollover] Calendar [${stat.sourceKey}] FAILED`);
          } else {
            console.log(`[Rollover] Calendar [${stat.sourceKey}] OK: HTTP ${stat.httpStatus}, parsed: ${stat.totalParsed}, match: ${stat.matchingToday}, inserted: ${insertedPerSource[stat.sourceKey]}`);
          }
        }
      } catch (err) {
        console.error('Calendar import during rollover failed (skipping):', err);
      }
    }

    // Helper to get current today tasks by category
    const getTodayCategoryTasks = async (cat: 'have_to' | 'need_to' | 'want_to') => {
      return await tx
        .select()
        .from(tasks)
        .where(
          taskScope(and(
            eq(tasks.status, 'today'),
            eq(tasks.dayKey, todayKey),
            eq(tasks.type, cat)
          ))
        );
    };

    // Helper to get existing text set for today
    const getTodayTextSet = async () => {
      const allToday = await tx
        .select()
        .from(tasks)
        .where(taskScope(and(eq(tasks.status, 'today'), eq(tasks.dayKey, todayKey))));
      return new Set(allToday.map((t) => t.text.trim()));
    };

    // 6. Backlog pull
    let pulledCount = 0;
    let todayTextSet = await getTodayTextSet();

    // Have To: ALL undone backlog items, oldest date_added first, until category hits DAILY_CAP
    const haveToToday = await getTodayCategoryTasks('have_to');
    if (haveToToday.length < CONFIG.DAILY_CAP) {
      const neededHaveTo = CONFIG.DAILY_CAP - haveToToday.length;
      const undoneHaveToBacklog = await tx
        .select()
        .from(tasks)
        .where(taskScope(and(eq(tasks.status, 'backlog'), eq(tasks.type, 'have_to'))))
        .orderBy(asc(tasks.dateAdded));

      for (const item of undoneHaveToBacklog) {
        if (pulledCount >= neededHaveTo) break;
        if (!todayTextSet.has(item.text.trim())) {
          await tx
            .update(tasks)
            .set({
              status: 'today',
              dayKey: todayKey,
              source: 'backlog_pull',
            })
            .where(taskScope(eq(tasks.id, item.id)));
          todayTextSet.add(item.text.trim());
          pulledCount++;
        }
      }
    }

    // Need To: ONE oldest undone backlog item if category under cap
    const needToToday = await getTodayCategoryTasks('need_to');
    if (needToToday.length < CONFIG.DAILY_CAP) {
      const undoneNeedToBacklog = await tx
        .select()
        .from(tasks)
        .where(taskScope(and(eq(tasks.status, 'backlog'), eq(tasks.type, 'need_to'))))
        .orderBy(asc(tasks.dateAdded));

      for (const item of undoneNeedToBacklog) {
        if (!todayTextSet.has(item.text.trim())) {
          await tx
            .update(tasks)
            .set({
              status: 'today',
              dayKey: todayKey,
              source: 'backlog_pull',
            })
            .where(taskScope(eq(tasks.id, item.id)));
          todayTextSet.add(item.text.trim());
          pulledCount++;
          break; // Pull only ONE
        }
      }
    }

    // Want To: ONE oldest undone backlog item if category under cap
    const wantToToday = await getTodayCategoryTasks('want_to');
    if (wantToToday.length < CONFIG.DAILY_CAP) {
      const undoneWantToBacklog = await tx
        .select()
        .from(tasks)
        .where(taskScope(and(eq(tasks.status, 'backlog'), eq(tasks.type, 'want_to'))))
        .orderBy(asc(tasks.dateAdded));

      for (const item of undoneWantToBacklog) {
        if (!todayTextSet.has(item.text.trim())) {
          await tx
            .update(tasks)
            .set({
              status: 'today',
              dayKey: todayKey,
              source: 'backlog_pull',
            })
            .where(taskScope(eq(tasks.id, item.id)));
          todayTextSet.add(item.text.trim());
          pulledCount++;
          break; // Pull only ONE
        }
      }
    }

    // 7. Overflow safety net: any category over DAILY_OVERFLOW (13) -> trim newest back down to DAILY_CAP (10)
    let overflowTrimmedCount = 0;
    const categories: Array<'have_to' | 'need_to' | 'want_to'> = ['have_to', 'need_to', 'want_to'];

    for (const cat of categories) {
      const catTasks = await getTodayCategoryTasks(cat);
      if (catTasks.length > CONFIG.DAILY_OVERFLOW) {
        // Exempt calendar tasks from being trimmed
        const trimmableTasks = catTasks.filter(t => t.source !== 'calendar');
        
        // Sort newest first to trim newest
        trimmableTasks.sort((a, b) => b.dateAdded - a.dateAdded);
        const trimCount = catTasks.length - CONFIG.DAILY_CAP;
        const toTrim = trimmableTasks.slice(0, trimCount);

        for (const item of toTrim) {
          await tx
            .update(tasks)
            .set({
              status: 'backlog',
              dayKey: null,
            })
            .where(taskScope(eq(tasks.id, item.id)));
          overflowTrimmedCount++;
        }
      }
    }

    // 8. Archive: backlog/done items with dateDone >= 7 days ago -> status='archived'
    const archiveCutoff = now - CONFIG.ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    const allDone = await tx
      .select()
      .from(tasks)
      .where(taskScope(eq(tasks.status, 'done')));

    let archivedCount = 0;
    for (const item of allDone) {
      if (item.dateDone && item.dateDone <= archiveCutoff) {
        await tx
          .update(tasks)
          .set({ status: 'archived' })
          .where(taskScope(eq(tasks.id, item.id)));
        archivedCount++;
      }
    }

    // Also archive done backlog items older than 7 days
    const backlogDone = await tx
      .select()
      .from(tasks)
      .where(taskScope(and(eq(tasks.status, 'backlog'), eq(tasks.status, 'done'))));
    for (const item of backlogDone) {
      if (item.dateDone && item.dateDone <= archiveCutoff) {
        await tx
          .update(tasks)
          .set({ status: 'archived' })
          .where(taskScope(eq(tasks.id, item.id)));
        archivedCount++;
      }
    }

    // 9. Purge: day_log entries older than MAX_AGE_DAYS (90 days) deleted
    const purgeCutoff = now - CONFIG.MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const logsToPurge = await tx
      .select()
      .from(dayLog)
      .where(logScope(lte(dayLog.createdAt, purgeCutoff)));

    for (const logItem of logsToPurge) {
      await tx.delete(dayLog).where(logScope(eq(dayLog.dayKey, logItem.dayKey)));
    }

    const stats = {
      executed: true as const,
      todayKey,
      calendarImportCount,
      calendarImportDetails,
      pulledCount,
      overflowTrimmedCount,
      archivedCount,
      purgedLogsCount: logsToPurge.length,
    };

    console.log(`[Rollover] Successfully executed for ${todayKey}: ${JSON.stringify(stats)}`);
    cachedRolloverDay = todayKey;
    return stats;
  });
}
