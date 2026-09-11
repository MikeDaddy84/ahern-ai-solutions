import ical from 'node-ical';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getEventsInWindow } from '../server/services/calendar.js';

describe('RRULE occurrences across DST and Timezones (R135)', () => {
  
  vi.mock('node-ical', async (importOriginal) => {
    const actual = await importOriginal<{ default: typeof import('node-ical') }>();
    return {
      default: {
        ...actual.default,
        async: { ...actual.default.async, fromURL: vi.fn() }
      }
    };
  });
  
  afterAll(() => {
    vi.restoreAllMocks();
  });

  const setupFeed = async (icalData: string) => {
        vi.mocked(ical.async.fromURL).mockResolvedValue(await ical.async.parseICS(icalData));
  };

  const getDay = async (dateStr: string) => {
    const start = new Date(`${dateStr}T00:00:00Z`);
    const end = new Date(`${dateStr}T23:59:59Z`);
    const res = await getEventsInWindow([{ key: 'test', url: 'http://test', prefix: '' }], start, end, true);
    return res.events.filter(e => e.dayKey === dateStr);
  };

  it('1. weekly 10:00 AM Chicago across spring-forward (CDT)', async () => {
    // Spring forward in 2024 is Mar 10.
    // Mar 4 is CST (UTC-6), Mar 11 is CDT (UTC-5).
    // If it is 10am CST, that's 16:00 UTC. If it is 10am CDT, that's 15:00 UTC.
    // Satori currently sets UTC hours by overwriting with local hours. 
    await setupFeed(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/Chicago
END:VTIMEZONE
BEGIN:VEVENT
UID:t1
DTSTART;TZID=America/Chicago:20240304T100000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Spring Forward
END:VEVENT
END:VCALENDAR`);
    // Check Mar 4 (CST)
    const ev1 = await getDay('2024-03-04');
    expect(ev1[0]?.timeStr).toBe('10:00 AM');
    // Check Mar 11 (CDT)
    const ev2 = await getDay('2024-03-11');
    expect(ev2[0]?.timeStr).toBe('10:00 AM');
  });

  it('2. same across fall-back (CST)', async () => {
    // Fall back in 2024 is Nov 3.
    // Oct 28 is CDT (UTC-5), Nov 4 is CST (UTC-6).
    await setupFeed(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/Chicago
END:VTIMEZONE
BEGIN:VEVENT
UID:t2
DTSTART;TZID=America/Chicago:20241028T100000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Fall Back
END:VEVENT
END:VCALENDAR`);
    const ev1 = await getDay('2024-10-28');
    expect(ev1[0]?.timeStr).toBe('10:00 AM');
    const ev2 = await getDay('2024-11-04');
    expect(ev2[0]?.timeStr).toBe('10:00 AM');
  });

  it('3. 11:30 PM recurrence across a DST change staying on its own day', async () => {
    // 11:30 PM CST is 05:30 UTC next day.
    await setupFeed(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/Chicago
END:VTIMEZONE
BEGIN:VEVENT
UID:t3
DTSTART;TZID=America/Chicago:20240304T233000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Late Night
END:VEVENT
END:VCALENDAR`);
    const ev1 = await getDay('2024-03-04');
    expect(ev1[0]?.timeStr).toBe('11:30 PM');
    const ev2 = await getDay('2024-03-11');
    expect(ev2[0]?.timeStr).toBe('11:30 PM');
    expect(ev2[0]?.dayKey).toBe('2024-03-11');
  });

  it('4. all-day weekly recurrence landing on the right dayKey', async () => {
    await setupFeed(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:t4
DTSTART;VALUE=DATE:20240304
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:All Day
END:VEVENT
END:VCALENDAR`);
    const ev1 = await getDay('2024-03-04');
    expect(ev1[0]?.isAllDay).toBe(true);
    expect(ev1[0]?.dayKey).toBe('2024-03-04');
    const ev2 = await getDay('2024-03-11');
    expect(ev2[0]?.isAllDay).toBe(true);
    expect(ev2[0]?.dayKey).toBe('2024-03-11');
  });

  it('5. a non-Chicago VTIMEZONE rendering at correct Chicago wall-clock', async () => {
    // 10:00 AM in America/New_York is 9:00 AM in Chicago
    await setupFeed(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/New_York
END:VTIMEZONE
BEGIN:VEVENT
UID:t5
DTSTART;TZID=America/New_York:20240304T100000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:NY Meeting
END:VEVENT
END:VCALENDAR`);
    const ev1 = await getDay('2024-03-04');
    expect(ev1[0]?.timeStr).toBe('9:00 AM');
    const ev2 = await getDay('2024-03-11');
    expect(ev2[0]?.timeStr).toBe('9:00 AM');
  });

  it('6. EXDATE exclusion still working', async () => {
    await setupFeed(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:t6
DTSTART;TZID=America/Chicago:20240304T100000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=America/Chicago:20240311T100000
SUMMARY:Exdate test
END:VEVENT
END:VCALENDAR`);
    const ev1 = await getDay('2024-03-04');
    expect(ev1.length).toBe(1);
    const ev2 = await getDay('2024-03-11');
    expect(ev2.length).toBe(0);
  });

  it('7. RECURRENCE-ID modified occurrence still overriding', async () => {
    await setupFeed(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:t7
DTSTART;TZID=America/Chicago:20240304T100000
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Original
END:VEVENT
BEGIN:VEVENT
UID:t7
RECURRENCE-ID;TZID=America/Chicago:20240311T100000
DTSTART;TZID=America/Chicago:20240311T120000
SUMMARY:Modified
END:VEVENT
END:VCALENDAR`);
    const ev1 = await getDay('2024-03-04');
    expect(ev1[0]?.title).toBe('Original');
    expect(ev1[0]?.timeStr).toBe('10:00 AM');
    const ev2 = await getDay('2024-03-11');
    expect(ev2[0]?.title).toBe('Modified');
    expect(ev2[0]?.timeStr).toBe('12:00 PM');
  });

  it('8. expansion throwing produces a FAILED stat, not a silent zero', async () => {
    // Mock the raw fetch to throw
    vi.mocked(ical.async.fromURL).mockRejectedValueOnce(new Error('Simulated crash'));
    const start = new Date('2024-03-04T00:00:00Z');
    const end = new Date('2024-03-04T23:59:59Z');
    
    // We spy on console.error to ensure it is logged
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await getEventsInWindow([{ key: 'test-fail', url: 'http://crash.me', prefix: '' }], start, end, true);
    
    expect(res.events.length).toBe(0);
    expect(res.errors['test-fail']).toBe('Failed to fetch calendar test-fail');
    
    expect(res.stats.length).toBe(1);
    expect(res.stats[0]).toEqual(expect.objectContaining({
      sourceKey: 'test-fail',
      status: 'FAILED',
      httpStatus: 'ERR',
      totalParsed: 0
    }));

    // Verify it logged the error exactly
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Calendar ICS fetch failed'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Calendar expansion failed'));
    
    errorSpy.mockRestore();
  });
});

