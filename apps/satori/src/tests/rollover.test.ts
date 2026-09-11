import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, initTables, AppDatabase } from '../db/client.js';
import { addTask, updateTask, getTodayTasks } from '../server/services/tasks.js';
import { runRollover, __setCachedRolloverDayForTest } from '../server/services/rollover.js';
import { vi } from 'vitest';
import { dayLog, tasks } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Rollover Engine Coverage', () => {
  let db: AppDatabase;
  let dbFile: string;

  beforeEach(async () => {
    dbFile = path.join(os.tmpdir(), `test_rollover_${Math.random().toString(36).substring(7)}.db`);
    db = createDb(`file:${dbFile}`);
    await initTables(db);
  });

  afterEach(() => {
    __setCachedRolloverDayForTest(null);
    [dbFile, `${dbFile}-journal`, `${dbFile}-wal`].forEach((file) => {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) {}
      }
    });
  });

  it('carryover: undone today tasks survive', async () => {
    const t = await addTask(db, { text: 'Unfinished Task', type: 'have_to', target: 'today' });
    await runRollover(db, { dateKey: '2026-08-02' });
    const todayList = await getTodayTasks(db, '2026-08-02');
    const carried = todayList.categories.have_to.find((x) => x.id === t.id);
    expect(carried).toBeDefined();
    expect(carried?.dayKey).toBe('2026-08-02');
    expect(carried?.source).toBe('carryover');
  });

  it('carryover: done tasks do not carry', async () => {
    const t = await addTask(db, { text: 'Done Task', type: 'have_to', target: 'today' });
    // set to done on day 1
    await db.update(tasks).set({ dayKey: '2026-08-01', status: 'done', dateDone: Date.now() }).where(eq(tasks.id, t.id));
    
    await runRollover(db, { dateKey: '2026-08-02' });
    
    const todayList = await getTodayTasks(db, '2026-08-02');
    const carried = todayList.categories.have_to.find((x) => x.id === t.id);
    expect(carried).toBeUndefined(); // Did not carry over to day 2

    const [after] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(after.dayKey).toBe('2026-08-01'); // Day key untouched
  });

  it('Have To pull stops at exactly DAILY_CAP=10', async () => {
    for (let i = 1; i <= 12; i++) {
      await addTask(db, { text: `Backlog Have To ${i}`, type: 'have_to', target: 'backlog' });
    }
    await runRollover(db, { dateKey: '2026-08-03' });
    const todayList = await getTodayTasks(db, '2026-08-03');
    expect(todayList.categories.have_to.length).toBe(10);
  });

  it('Need To pulls exactly 1', async () => {
    for (let i = 1; i <= 3; i++) {
      await addTask(db, { text: `Backlog Need To ${i}`, type: 'need_to', target: 'backlog' });
    }
    await runRollover(db, { dateKey: '2026-08-04' });
    const todayList = await getTodayTasks(db, '2026-08-04');
    expect(todayList.categories.need_to.length).toBe(1);
  });

  it('Want To pulls exactly 1', async () => {
    for (let i = 1; i <= 3; i++) {
      await addTask(db, { text: `Backlog Want To ${i}`, type: 'want_to', target: 'backlog' });
    }
    await runRollover(db, { dateKey: '2026-08-05' });
    const todayList = await getTodayTasks(db, '2026-08-05');
    expect(todayList.categories.want_to.length).toBe(1);
  });

  it('14 items in a category trims newest to 10, trimmed -> backlog', async () => {
    for (let i = 1; i <= 14; i++) {
      await addTask(db, { text: `Overflown Task ${i}`, type: 'have_to', target: 'today' });
      // Add a slight delay to ensure sortOrder / dateAdded uniqueness for 'newest' trimming
      await new Promise(r => setTimeout(r, 1));
    }
    const res = await runRollover(db, { dateKey: '2026-08-06' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.overflowTrimmedCount).toBe(4);
    const todayList = await getTodayTasks(db, '2026-08-06');
    expect(todayList.categories.have_to.length).toBe(10);
  });

  it('exactly 13 items does NOT trim (boundary)', async () => {
    for (let i = 1; i <= 13; i++) {
      await addTask(db, { text: `Boundary Task ${i}`, type: 'have_to', target: 'today' });
    }
    const res = await runRollover(db, { dateKey: '2026-08-07' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.overflowTrimmedCount).toBe(0);
    const todayList = await getTodayTasks(db, '2026-08-07');
    expect(todayList.categories.have_to.length).toBe(13);
  });

  it('dedupe: identical trimmed text never pulled twice', async () => {
    await addTask(db, { text: 'Feed Dog', type: 'have_to', target: 'today' });
    await addTask(db, { text: 'Feed Dog', type: 'have_to', target: 'backlog' });
    const res = await runRollover(db, { dateKey: '2026-08-08' });
    if (!res.executed) throw new Error('Expected execution');
    const todayList = await getTodayTasks(db, '2026-08-08');
    expect(todayList.categories.have_to.length).toBe(1);
    const backlogTasks = await db.select().from(tasks).where(eq(tasks.status, 'backlog'));
    expect(backlogTasks.length).toBe(1);
  });

  it('archive boundary: 6 days stays, 7 days archives', async () => {
    const t6 = await addTask(db, { text: '6 Days Old', type: 'have_to', target: 'today' });
    const t7 = await addTask(db, { text: '7 Days Old', type: 'have_to', target: 'today' });
    
    const now = Date.now();
    const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000 + 1000; // slightly less than 6
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000 - 1000; // slightly more than 7
    
    await db.update(tasks).set({ status: 'done', dateDone: sixDaysAgo }).where(eq(tasks.id, t6.id));
    await db.update(tasks).set({ status: 'done', dateDone: sevenDaysAgo }).where(eq(tasks.id, t7.id));
    
    await runRollover(db, { dateKey: '2026-08-09' });
    
    const [after6] = await db.select().from(tasks).where(eq(tasks.id, t6.id));
    const [after7] = await db.select().from(tasks).where(eq(tasks.id, t7.id));
    
    expect(after6.status).toBe('done'); // Stays
    expect(after7.status).toBe('archived'); // Archives
  });

  it('day_log purge at 90 days', async () => {
    const ninetyFiveDaysAgo = Date.now() - 95 * 24 * 60 * 60 * 1000;
    await db.insert(dayLog).values({
      dayKey: '2026-05-01',
      createdAt: ninetyFiveDaysAgo,
      summaryJson: '{}',
    });
    const res = await runRollover(db, { dateKey: '2026-08-10' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.purgedLogsCount).toBe(1);
  });

  it('concurrent rollover fires exactly once (idempotency)', async () => {
    const res1 = await runRollover(db, { dateKey: '2026-08-11' });
    if (!res1.executed) throw new Error('Expected execution');
    expect(res1.executed).toBe(true);
    const res2 = await runRollover(db, { dateKey: '2026-08-11' });
    if (res2.executed) throw new Error('Expected NOT execution');
    expect(res2.executed).toBe(false);
  });

  describe('Caching', () => {
    afterEach(() => {
      __setCachedRolloverDayForTest(null);
    });

    it('two successive requests on same day hit DB exactly once', async () => {
      const dbSpy = vi.spyOn(db, 'transaction');
      // first call - executes full rollover and populates cache
      await runRollover(db, { dateKey: '2026-08-20' });
      expect(dbSpy).toHaveBeenCalledTimes(1);
      
      // second call - cache short circuits
      const res = await runRollover(db, { dateKey: '2026-08-20' });
    if (res.executed) throw new Error('Expected NOT execution');
      expect(dbSpy).toHaveBeenCalledTimes(1); // STILL 1
      expect(res.reason).toBe('Already rolled over today (cached)');
    });

    it('request after cached day is manually advanced falls through to real rollover', async () => {
      await runRollover(db, { dateKey: '2026-08-20' });
      const dbSpy = vi.spyOn(db, 'transaction');
      // next day
      const res = await runRollover(db, { dateKey: '2026-08-21' });
    if (!res.executed) throw new Error('Expected execution');
      expect(dbSpy).toHaveBeenCalledTimes(1); 
      expect(res.executed).toBe(true);
    if (!res.executed) throw new Error('Expected execution');
    });

    it('force:true bypasses the cache', async () => {
      await runRollover(db, { dateKey: '2026-08-20' }); // populates cache
      const dbSpy = vi.spyOn(db, 'transaction');
      
      const res = await runRollover(db, { dateKey: '2026-08-20', force: true });
    if (!res.executed) throw new Error('Expected execution');
      expect(dbSpy).toHaveBeenCalledTimes(1); 
      expect(res.executed).toBe(true);
    if (!res.executed) throw new Error('Expected execution');
    });
  });

  it('DST: day_key correct across US spring-forward and fall-back', async () => {
    const { getChicagoDayKey } = await import('../server/utils/date.js');
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    // Spring Forward
    vi.setSystemTime(new Date('2026-03-08T07:00:00Z')); // 1am CST
    expect(getChicagoDayKey()).toBe('2026-03-08');
    vi.setSystemTime(new Date('2026-03-08T09:00:00Z')); // 4am CDT
    expect(getChicagoDayKey()).toBe('2026-03-08');
    // Fall Back
    vi.setSystemTime(new Date('2026-11-01T06:00:00Z')); // 1am CDT
    expect(getChicagoDayKey()).toBe('2026-11-01');
    vi.setSystemTime(new Date('2026-11-01T08:00:00Z')); // 2am CST
    expect(getChicagoDayKey()).toBe('2026-11-01');
    vi.useRealTimers();
  });

  it('calendar: recurring events (RRULE, EXDATE, RECURRENCES)', async () => {
    const { vi } = await import('vitest');
    const ical = await import('node-ical');
    
    const parsed = await ical.default.async.parseICS(`
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recur-1
SUMMARY:Weekly Meeting
DTSTART:20260805T100000Z
RRULE:FREQ=WEEKLY
EXDATE:20260812T100000Z
END:VEVENT
BEGIN:VEVENT
UID:recur-1
RECURRENCE-ID:20260819T100000Z
SUMMARY:Weekly Meeting (Moved)
DTSTART:20260819T110000Z
END:VEVENT
END:VCALENDAR
`);

    vi.spyOn(ical.default.async, 'fromURL').mockResolvedValue(parsed as any);

    process.env.CALENDAR_ICS_URL = 'http://valid.local/cal.ics';

    const res1 = await runRollover(db, { dateKey: '2026-08-05' });
    if (!res1.executed) throw new Error('Expected execution');
    expect(res1.calendarImportCount).toBe(1);
    let todayTasks = await db.select().from(tasks).where(eq(tasks.dayKey, '2026-08-05'));
    expect(todayTasks.map(t => t.text)).toContain('📅 5:00 AM - Weekly Meeting');

    // clear DB so carry-over doesn't confuse the test
    await db.delete(tasks);

    const res2 = await runRollover(db, { dateKey: '2026-08-12' });
    if (!res2.executed) throw new Error('Expected execution');
    expect(res2.calendarImportCount).toBe(0); // EXDATE excludes it

    await db.delete(tasks);

    const res3 = await runRollover(db, { dateKey: '2026-08-19' });
    if (!res3.executed) throw new Error('Expected execution');
    expect(res3.calendarImportCount).toBe(1);
    todayTasks = await db.select().from(tasks).where(eq(tasks.dayKey, '2026-08-19'));
    expect(todayTasks.map(t => t.text)).toContain('📅 6:00 AM - Weekly Meeting (Moved)');
    
    delete process.env.CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('calendar: all-day event', async () => {
    process.env.CALENDAR_ICS_URL = 'http://valid.local/cal.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');
    const mockEvents = {
      'event1': {
        type: 'VEVENT',
        summary: 'Vacation',
        start: new Date('2026-08-12T05:00:00Z'), // Midnight chicago time = all-day
        datetype: 'date',
      }
    };
    vi.spyOn(ical.default.async, 'fromURL').mockResolvedValue(mockEvents as any);
    const res = await runRollover(db, { dateKey: '2026-08-12' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.calendarImportCount).toBe(1);
    const todayList = await getTodayTasks(db, '2026-08-12');
    const calTask = todayList.categories.have_to.find(t => t.source === 'calendar');
    expect(calTask?.text).toBe('📅 Vacation');
    delete process.env.CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('calendar: timed event', async () => {
    process.env.CALENDAR_ICS_URL = 'http://valid.local/cal.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');
    const mockEvents = {
      'event1': {
        type: 'VEVENT',
        summary: 'Dentist Appointment',
        start: new Date('2026-08-13T20:00:00Z'), // 3:00 PM CDT
      }
    };
    vi.spyOn(ical.default.async, 'fromURL').mockResolvedValue(mockEvents as any);
    const res = await runRollover(db, { dateKey: '2026-08-13' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.calendarImportCount).toBe(1);
    const todayList = await getTodayTasks(db, '2026-08-13');
    const calTask = todayList.categories.have_to.find(t => t.source === 'calendar');
    expect(calTask?.text).toBe('📅 3:00 PM - Dentist Appointment');
    delete process.env.CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('calendar: malformed ICS body (logs, does not throw)', async () => {
    process.env.CALENDAR_ICS_URL = 'http://valid.local/cal.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');
    // Return empty or malformed
    vi.spyOn(ical.default.async, 'fromURL').mockResolvedValue({} as any);
    const res = await runRollover(db, { dateKey: '2026-08-14' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.calendarImportCount).toBe(0);
    expect(res.executed).toBe(true);
    if (!res.executed) throw new Error('Expected execution');
    delete process.env.CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('calendar: unreachable URL (logs, rollover continues)', async () => {
    process.env.CALENDAR_ICS_URL = 'http://invalid-url.local/cal.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');
    vi.spyOn(ical.default.async, 'fromURL').mockRejectedValue(new Error('Network error'));
    const res = await runRollover(db, { dateKey: '2026-08-15' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.calendarImportCount).toBe(0);
    expect(res.executed).toBe(true);
    if (!res.executed) throw new Error('Expected execution');
    delete process.env.CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('calendar: overflow exemption (15 calendar events stay)', async () => {
    process.env.CALENDAR_ICS_URL = 'http://valid.local/cal.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');
    const mockEvents: any = {};
    for (let i = 1; i <= 15; i++) {
      mockEvents[`event${i}`] = {
        type: 'VEVENT',
        summary: `Event ${i}`,
        start: new Date('2026-08-16T15:00:00Z'), // 10:00 AM CDT
      };
    }
    vi.spyOn(ical.default.async, 'fromURL').mockResolvedValue(mockEvents);

    const res = await runRollover(db, { dateKey: '2026-08-16' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.overflowTrimmedCount).toBe(0); // Calendar events are exempt
    const todayList = await getTodayTasks(db, '2026-08-16');
    expect(todayList.categories.have_to.length).toBe(15);

    delete process.env.CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('calendar: overflow mixed (10 regular + 5 calendar trims 5 regular)', async () => {
    process.env.CALENDAR_ICS_URL = 'http://valid.local/cal.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');
    
    // Add 10 regular tasks that will carry over
    for (let i = 1; i <= 10; i++) {
      await addTask(db, { text: `Regular ${i}`, type: 'have_to', target: 'today' });
      await new Promise(r => setTimeout(r, 1)); // sorting
    }

    // Mock 5 calendar events
    const mockEvents: any = {};
    for (let i = 1; i <= 5; i++) {
      mockEvents[`event${i}`] = {
        type: 'VEVENT',
        summary: `Event ${i}`,
        start: new Date('2026-08-17T15:00:00Z'),
      };
    }
    vi.spyOn(ical.default.async, 'fromURL').mockResolvedValue(mockEvents);

    const res = await runRollover(db, { dateKey: '2026-08-17' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.overflowTrimmedCount).toBe(5); // Only regular tasks trimmed
    const todayList = await getTodayTasks(db, '2026-08-17');
    expect(todayList.categories.have_to.length).toBe(10);
    const calendarCount = todayList.categories.have_to.filter((t: any) => t.source === 'calendar').length;
    expect(calendarCount).toBe(5);

    delete process.env.CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('empty DB: rollover with zero tasks does not throw', async () => {
    // Brand new DB has no tasks
    const res = await runRollover(db, { dateKey: '2026-08-16' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.executed).toBe(true);
    if (!res.executed) throw new Error('Expected execution');
    expect(res.pulledCount).toBe(0);
    expect(res.overflowTrimmedCount).toBe(0);
  });

  it('calendar: failure isolation (source A fails, source B succeeds)', async () => {
    process.env.CALENDAR_ICS_URL = 'http://invalid-url.local/cal.ics';
    process.env.FAMILY_CALENDAR_ICS_URL = 'http://valid.local/family.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');

    vi.spyOn(ical.default.async, 'fromURL').mockImplementation(async (url: string) => {
      if (url.includes('invalid-url.local')) {
        throw new Error('Network error');
      }
      return {
        'event1': {
          type: 'VEVENT',
          summary: 'Family Dinner',
          start: new Date('2026-08-18T23:00:00Z'), // 6:00 PM CDT
        }
      } as any;
    });

    const res = await runRollover(db, { dateKey: '2026-08-18' });
    if (!res.executed) throw new Error('Expected execution');
    expect(res.calendarImportCount).toBe(1);
    expect(res.calendarImportDetails?.personal).toBe(0);
    expect(res.calendarImportDetails?.family).toBe(1);

    const todayList = await getTodayTasks(db, '2026-08-18');
    const calTask = todayList.categories.have_to.find(t => t.source === 'calendar');
    expect(calTask?.text).toBe('🏠 6:00 PM - Family Dinner');

    delete process.env.CALENDAR_ICS_URL;
    delete process.env.FAMILY_CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });

  it('calendar: cross-calendar dedupe (same event in both feeds -> one task)', async () => {
    process.env.CALENDAR_ICS_URL = 'http://valid.local/personal.ics';
    process.env.FAMILY_CALENDAR_ICS_URL = 'http://valid.local/family.ics';
    const { vi } = await import('vitest');
    const ical = await import('node-ical');

    vi.spyOn(ical.default.async, 'fromURL').mockImplementation(async (url: string) => {
      return {
        'event1': {
          type: 'VEVENT',
          summary: 'Shared Event',
          start: new Date('2026-08-19T23:00:00Z'),
          uid: 'shared-uid-1234',
        }
      } as any;
    });

    const res = await runRollover(db, { dateKey: '2026-08-19' });
    if (!res.executed) throw new Error('Expected execution');
    // First source (personal) should win because it is parsed first
    expect(res.calendarImportCount).toBe(1);
    expect(res.calendarImportDetails?.personal).toBe(1);
    expect(res.calendarImportDetails?.family).toBe(0);

    const todayList = await getTodayTasks(db, '2026-08-19');
    expect(todayList.categories.have_to.length).toBe(1);
    const calTask = todayList.categories.have_to[0];
    expect(calTask?.text).toBe('📅 6:00 PM - Shared Event');

    delete process.env.CALENDAR_ICS_URL;
    delete process.env.FAMILY_CALENDAR_ICS_URL;
    vi.restoreAllMocks();
  });
});

