import * as spies from '@vitest/spy';
import { describe, it, mock, before as beforeAll, after as afterAll } from 'node:test';
import { expect } from './expect.js';
import { createDb, initTables, AppDatabase } from '../db/client.js';
import { tasks, appMeta } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const fetchEvents = spies.fn();
const calendars = {
  getConfiguredCalendars: spies.fn(),
  getAllCalendars: spies.fn(),
  fetchAllCalendarEventsForDay: fetchEvents
};
mock.module(new URL('../server/services/calendar.ts', import.meta.url).href, { namedExports: calendars });
const { runRollover } = await import('../server/services/rollover.js');

describe('Rollover Dedupe with calendar_uid (R168)', () => {
  let db: AppDatabase;

  beforeAll(async () => {
    db = createDb('file::memory:?cache=shared');
    await initTables(db);

    // Mock calendar config to return a dummy calendar
    calendars.getConfiguredCalendars.mockReturnValue([
      { key: 'test', url: 'http://test', prefix: '📅' }
    ]);
    calendars.getAllCalendars.mockReturnValue([
      { key: 'test', url: 'http://test', prefix: '📅', configured: true }
    ]);
  });

  afterAll(async () => {
    spies.restoreAllMocks();
    db.$client.close();
  });

  it('1. Legacy string match fallback (today): incoming event matches null-uid task by text, does not duplicate', async () => {
    const today = '2024-05-01';
    
    // Insert a legacy task (null calendarUid)
    await db.insert(tasks).values({
      id: uuidv4(),
      text: '📅 10:00 AM - Legacy Sync',
      type: 'have_to',
      status: 'today',
      dateAdded: Date.now(),
      dayKey: today,
      source: 'calendar',
      calendarUid: null
    });

    // Mock calendar to return the exact same event string
    fetchEvents.mockResolvedValueOnce({
      events: [{
        id: 'uid1-2024-05-01',
        title: 'Legacy Sync',
        formattedEntry: '📅 10:00 AM - Legacy Sync',
        isAllDay: false,
        sourceKey: 'test',
        sourcePrefix: '📅',
        dayKey: today
      }],
      stats: [{ sourceKey: 'test', httpStatus: 200, totalParsed: 1, matchingToday: 1, status: 'OK' }]
    });

    // Run rollover for the same day (forced)
    await runRollover(db, { force: true, dateKey: today });

    // Should still only be 1 task today with that text
    const todayTasks = await db.select().from(tasks).where(eq(tasks.dayKey, today));
    expect(todayTasks.length).toBe(1);
    expect(todayTasks[0].calendarUid).toBeNull(); // Legacy task kept
  });

  it('2. Legacy string match fallback (backlog): legacy task sent to backlog prevents duplication', async () => {
    const today = '2024-05-02';
    
    // Insert a legacy task in backlog
    await db.insert(tasks).values({
      id: uuidv4(),
      text: '📅 All Day - Backlog Legacy',
      type: 'have_to',
      status: 'backlog',
      dateAdded: Date.now(),
      dayKey: '2024-05-01', // Imported yesterday
      source: 'calendar',
      calendarUid: null
    });

    fetchEvents.mockResolvedValueOnce({
      events: [{
        id: 'uid2-2024-05-02', // RRule expanded to today
        title: 'Backlog Legacy',
        formattedEntry: '📅 All Day - Backlog Legacy',
        isAllDay: true,
        sourceKey: 'test',
        sourcePrefix: '📅',
        dayKey: today
      }],
      stats: [{ sourceKey: 'test', httpStatus: 200, totalParsed: 1, matchingToday: 1, status: 'OK' }]
    });

    await runRollover(db, { force: true, dateKey: today });

    // Ensure it was NOT duplicated into today
    const currentTasks = await db.select().from(tasks).where(inArray(tasks.status, ['today', 'backlog']));
    
    // There should still only be the 1 from test 1, plus this 1 pulled into today (2 total active)
    expect(currentTasks.filter(t => t.text === '📅 All Day - Backlog Legacy').length).toBe(1);
    expect(currentTasks.find(t => t.text === '📅 All Day - Backlog Legacy')?.status).toBe('today');
  });

  it('3. UID-backed task can be heavily edited and still dedupe correctly', async () => {
    const today = '2024-05-03';
    const eventId = 'uid3-2024-05-03';
    
    // Insert a UID-backed task representing a prior import that the user manually edited
    await db.insert(tasks).values({
      id: uuidv4(),
      text: 'Totally different text I typed manually',
      type: 'want_to', // User changed the type
      status: 'today',
      dateAdded: Date.now(),
      dayKey: today,
      source: 'calendar',
      calendarUid: eventId
    });

    // Mock calendar to return the unedited event string, but with the same UID
    fetchEvents.mockResolvedValueOnce({
      events: [{
        id: eventId,
        title: 'Original Event Name',
        formattedEntry: '📅 02:00 PM - Original Event Name',
        isAllDay: false,
        sourceKey: 'test',
        sourcePrefix: '📅',
        dayKey: today
      }],
      stats: [{ sourceKey: 'test', httpStatus: 200, totalParsed: 1, matchingToday: 1, status: 'OK' }]
    });

    await runRollover(db, { force: true, dateKey: today });

    // Should NOT duplicate. We should just see the edited one.
    const todayTasks = await db.select().from(tasks).where(eq(tasks.dayKey, today));
    const editedTask = todayTasks.find(t => t.calendarUid === eventId);
    
    expect(editedTask).toBeDefined();
    expect(editedTask?.text).toBe('Totally different text I typed manually');
    
    // Ensure no duplication occurred (no row with "Original Event Name")
    const originalAdded = todayTasks.find(t => t.text.includes('Original Event Name'));
    expect(originalAdded).toBeUndefined();
  });
});

