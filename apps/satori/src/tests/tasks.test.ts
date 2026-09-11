import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, initTables, AppDatabase } from '../db/client.js';
import { addTask, updateTask, getTodayTasks, getBacklogTasks } from '../server/services/tasks.js';

describe('Tasks & Check-Off Sync', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = createDb('file::memory:');
    await initTables(db);
  });

  it('adds tasks to today and backlog', async () => {
    const todayTask = await addTask(db, { text: 'Pay Bills', type: 'have_to', target: 'today' });
    const backlogTask = await addTask(db, { text: 'Read Book', type: 'want_to', target: 'backlog' });

    expect(todayTask.status).toBe('today');
    expect(backlogTask.status).toBe('backlog');

    const todayList = await getTodayTasks(db);
    expect(todayList.categories.have_to.length).toBe(1);
    expect(todayList.categories.have_to[0].text).toBe('Pay Bills');

    const backlogList = await getBacklogTasks(db);
    expect(backlogList.length).toBe(1);
    expect(backlogList[0].text).toBe('Read Book');
  });

  it('syncs completion of today task to matching undone backlog item', async () => {
    const backlogItem = await addTask(db, { text: 'Grocery Shopping', type: 'need_to', target: 'backlog' });
    const todayItem = await addTask(db, { text: 'Grocery Shopping', type: 'need_to', target: 'today' });

    const updatedToday = await updateTask(db, todayItem.id, { status: 'done' });
    expect(updatedToday.status).toBe('done');
    expect(updatedToday.dateDone).toBeDefined();

    const backlogList = await getBacklogTasks(db);
    expect(backlogList.length).toBe(0);
  });

  it('unchecking a today task affects today copy only', async () => {
    const backlogItem = await addTask(db, { text: 'Clean Desk', type: 'have_to', target: 'backlog' });
    const todayItem = await addTask(db, { text: 'Clean Desk', type: 'have_to', target: 'today' });

    await updateTask(db, todayItem.id, { status: 'done' });

    const uncheckedToday = await updateTask(db, todayItem.id, { status: 'today' });
    expect(uncheckedToday.status).toBe('today');
    expect(uncheckedToday.dateDone).toBeNull();
  });

  it('sending a today task to backlog moves it and preserves date_added and type', async () => {
    const todayTask = await addTask(db, { text: 'Draft email', type: 'need_to', target: 'today' });
    const originalDateAdded = todayTask.dateAdded;

    const updated = await updateTask(db, todayTask.id, { status: 'backlog' });
    expect(updated.status).toBe('backlog');
    expect(updated.dayKey).toBeNull();
    expect(updated.type).toBe('need_to');
    expect(updated.dateAdded).toBe(originalDateAdded);

    const todayList = await getTodayTasks(db);
    expect(todayList.categories.need_to.length).toBe(0);

    const backlogList = await getBacklogTasks(db);
    expect(backlogList.some(t => t.id === todayTask.id)).toBe(true);
  });

  it('sending a done task to backlog marks it undone', async () => {
    const todayTask = await addTask(db, { text: 'Done Task', type: 'have_to', target: 'today' });
    await updateTask(db, todayTask.id, { status: 'done' });
    
    const updated = await updateTask(db, todayTask.id, { status: 'backlog' });
    expect(updated.status).toBe('backlog');
    expect(updated.dateDone).toBeNull();
    
    const backlogList = await getBacklogTasks(db);
    const item = backlogList.find(t => t.id === todayTask.id);
    expect(item).toBeDefined();
    expect(item!.dateDone).toBeNull();
  });

  it('sent to backlog does not orphan by mutating shape vs a raw backlog task', async () => {
    const originalBacklogTask = await addTask(db, { text: 'Never Pulled', type: 'want_to', target: 'backlog' });
    
    const pulledToTodayTask = await updateTask(db, originalBacklogTask.id, { status: 'today' });
    const sentBackToBacklog = await updateTask(db, pulledToTodayTask.id, { status: 'backlog' });
    
    expect(sentBackToBacklog.dayKey).toBeNull();
    expect(sentBackToBacklog.dateAdded).toBe(originalBacklogTask.dateAdded);
    expect(sentBackToBacklog.source).toBe('backlog_pull'); // preserved
    expect(sentBackToBacklog.status).toBe('backlog');
  });

  it('editing a task text preserves date_added, status, day_key, source and sort_order', async () => {
    const todayTask = await addTask(db, { text: 'Initial text', type: 'need_to', target: 'today' });
    const originalDateAdded = todayTask.dateAdded;
    const originalSortOrder = todayTask.sortOrder;
    const originalDayKey = todayTask.dayKey;
    const originalSource = todayTask.source;
    
    const updated = await updateTask(db, todayTask.id, { text: 'Edited text' });
    expect(updated.text).toBe('Edited text');
    expect(updated.type).toBe('need_to');
    expect(updated.status).toBe('today');
    expect(updated.dateAdded).toBe(originalDateAdded);
    expect(updated.sortOrder).toBe(originalSortOrder);
    expect(updated.dayKey).toBe(originalDayKey);
    expect(updated.source).toBe(originalSource);
  });

  it('changing type on a today task moves columns', async () => {
    const todayTask = await addTask(db, { text: 'Wrong column', type: 'want_to', target: 'today' });
    let todayList = await getTodayTasks(db);
    expect(todayList.categories.want_to.some(t => t.id === todayTask.id)).toBe(true);
    
    await updateTask(db, todayTask.id, { type: 'have_to' });
    
    todayList = await getTodayTasks(db);
    expect(todayList.categories.want_to.some(t => t.id === todayTask.id)).toBe(false);
    expect(todayList.categories.have_to.some(t => t.id === todayTask.id)).toBe(true);
  });
});

