import { eq, and, asc, desc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { AppDatabase } from '../../db/client.js';
import { tasks, Task, NewTask, taskScope } from '../../db/schema.js';
import { getChicagoDayKey } from '../utils/date.js';

export async function getTodayTasks(db: AppDatabase, dayKey?: string) {
  const targetDayKey = dayKey || getChicagoDayKey();

  const allToday = await db
    .select()
    .from(tasks)
    .where(taskScope(eq(tasks.dayKey, targetDayKey)))
    .orderBy(asc(tasks.sortOrder), asc(tasks.dateAdded));

  const haveTo = allToday.filter((t) => t.type === 'have_to');
  const needTo = allToday.filter((t) => t.type === 'need_to');
  const wantTo = allToday.filter((t) => t.type === 'want_to');

  return {
    dayKey: targetDayKey,
    categories: {
      have_to: haveTo,
      need_to: needTo,
      want_to: wantTo,
    },
    counts: {
      have_to: { total: haveTo.length, remaining: haveTo.filter((t) => t.status !== 'done').length },
      need_to: { total: needTo.length, remaining: needTo.filter((t) => t.status !== 'done').length },
      want_to: { total: wantTo.length, remaining: wantTo.filter((t) => t.status !== 'done').length },
    },
  };
}

export async function getBacklogTasks(db: AppDatabase) {
  const backlog = await db
    .select()
    .from(tasks)
    .where(taskScope(eq(tasks.status, 'backlog')))
    .orderBy(asc(tasks.dateAdded));

  return backlog;
}

export async function addTask(
  db: AppDatabase,
  data: {
    text: string;
    type: 'have_to' | 'need_to' | 'want_to';
    target?: 'today' | 'backlog';
    source?: 'manual' | 'calendar';
  }
) {
  const trimmedText = data.text.trim();
  if (!trimmedText) {
    throw new Error('Task text cannot be empty');
  }

  const target = data.target || 'today';
  const now = Date.now();
  const todayKey = getChicagoDayKey();

  const newTask: NewTask = {
    id: uuidv4(),
    text: trimmedText,
    type: data.type,
    status: target === 'today' ? 'today' : 'backlog',
    dateAdded: now,
    dayKey: target === 'today' ? todayKey : null,
    source: data.source || 'manual',
    sortOrder: now,
  };

  await db.insert(tasks).values(newTask);
  return newTask;
}

export async function updateTask(
  db: AppDatabase,
  id: string,
  data: {
    text?: string;
    type?: 'have_to' | 'need_to' | 'want_to';
    status?: 'backlog' | 'today' | 'done' | 'archived';
  }
) {
  const [existing] = await db.select().from(tasks).where(taskScope(eq(tasks.id, id)));
  if (!existing) {
    throw new Error(`Task with id ${id} not found`);
  }

  const updates: Partial<Task> = {};
  if (data.text !== undefined) updates.text = data.text.trim();
  if (data.type !== undefined) updates.type = data.type;

  const now = Date.now();

  if (data.status !== undefined && data.status !== existing.status) {
    updates.status = data.status;

    if (data.status === 'done') {
      updates.dateDone = now;
    } else if (existing.status === 'done') {
      updates.dateDone = null;
    }

    if (data.status === 'today') {
      const { getChicagoDayKey } = await import('../utils/date.js');
      updates.dayKey = getChicagoDayKey();
      updates.source = 'backlog_pull';
      updates.sortOrder = now;
    } else if (data.status === 'backlog') {
      updates.dayKey = null;
    }

    // Handle check-off sync
    if (existing.status === 'today' && data.status === 'done') {
      // Find first matching undone backlog item and mark done
      const trimmedText = (updates.text || existing.text).trim();
      const undoneBacklog = await db
        .select()
        .from(tasks)
        .where(taskScope(and(eq(tasks.status, 'backlog'), eq(tasks.text, trimmedText))))
        .orderBy(asc(tasks.dateAdded))
        .limit(1);

      if (undoneBacklog.length > 0) {
        await db
          .update(tasks)
          .set({ status: 'done', dateDone: now })
          .where(taskScope(eq(tasks.id, undoneBacklog[0].id)));
      }
    }
  }

  await db.update(tasks).set(updates).where(taskScope(eq(tasks.id, id)));

  const [updated] = await db.select().from(tasks).where(taskScope(eq(tasks.id, id)));
  return updated;
}

export async function deleteTask(db: AppDatabase, id: string) {
  await db.delete(tasks).where(taskScope(eq(tasks.id, id)));
  return { success: true };
}
