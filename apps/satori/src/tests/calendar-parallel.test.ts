import ical from 'node-ical';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getEventsInWindow, fetchAllCalendarEventsForDay } from '../server/services/calendar.js';

describe('Parallel Feed Fetching (R166)', () => {
  let fromUrlMock: any;

  beforeAll(async () => {
    // Mock the actual fromURL function
    vi.mock('node-ical', async (importOriginal) => {
      const actual = await importOriginal<{ default: typeof import('node-ical') }>();
      return {
        default: {
          ...actual.default,
          async: { ...actual.default.async, fromURL: vi.fn() }
        }
      };
    });
    // @ts-ignore
    const icalMock = await import('node-ical');
    fromUrlMock = vi.mocked(icalMock.default.async.fromURL);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const setupDelays = (delays: Record<string, number>, fails: Record<string, boolean>, duplicateStr: string = '') => {
    fromUrlMock.mockImplementation(async (url: string) => {
      const isFamily = url.includes('family');
      const key = isFamily ? 'family' : 'personal';
      const delay = delays[key] || 0;
      
      await new Promise(r => setTimeout(r, delay));
      
      if (fails[key]) {
        throw new Error(`Simulated crash for ${key}`);
      }

      let ics = `BEGIN:VCALENDAR\nVERSION:2.0\n`;
      if (duplicateStr) {
        // Both get the same event, but with different SUMMARIES to identify winner
        ics += `BEGIN:VEVENT\nUID:${duplicateStr}\nDTSTART;TZID=UTC:20240304T100000\nSUMMARY:${key.toUpperCase()} Event\nEND:VEVENT\n`;
      } else {
        ics += `BEGIN:VEVENT\nUID:${key}-event\nDTSTART;TZID=UTC:20240304T100000\nSUMMARY:${key} specific\nEND:VEVENT\n`;
      }
      ics += `END:VCALENDAR`;
      return ical.async.parseICS(ics);
    });
  };

  const sources = [
    { key: 'personal', name: 'Personal', url: 'http://cal.me/personal', prefix: 'P', color: 'blue' },
    { key: 'family', name: 'Family', url: 'http://cal.me/family', prefix: 'F', color: 'red' }
  ];
  const start = new Date('2024-03-04T00:00:00Z');
  const end = new Date('2024-03-04T23:59:59Z');

  it('1. both sources succeed: same stats order as sequential', async () => {
    // Make personal slow and family fast
    setupDelays({ personal: 50, family: 5 }, {});
    const res = await getEventsInWindow(sources, start, end, true);
    
    // Check stats array order
    expect(res.stats.length).toBe(2);
    expect(res.stats[0].sourceKey).toBe('personal');
    expect(res.stats[1].sourceKey).toBe('family');
    
    // Check events array order (all personal events, then all family events)
    expect(res.events.length).toBe(2);
    expect(res.events[0].sourceKey).toBe('personal');
    expect(res.events[1].sourceKey).toBe('family');
  });

  it('2. one source fails: other still imports, FAILED stat in the right slot', async () => {
    // Personal fails, family succeeds
    setupDelays({ personal: 10, family: 10 }, { personal: true });
    
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await getEventsInWindow(sources, start, end, true);
    
    expect(res.stats.length).toBe(2);
    expect(res.stats[0].sourceKey).toBe('personal');
    expect(res.stats[0].status).toBe('FAILED');
    expect(res.stats[1].sourceKey).toBe('family');
    expect(res.stats[1].status).toBe('OK');
    
    expect(res.events.length).toBe(1);
    expect(res.events[0].sourceKey).toBe('family');
    errorSpy.mockRestore();
  });

  it('3. both fail: two FAILED stats, no crash', async () => {
    setupDelays({ personal: 10, family: 10 }, { personal: true, family: true });
    
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await getEventsInWindow(sources, start, end, true);
    
    expect(res.stats.length).toBe(2);
    expect(res.stats[0].status).toBe('FAILED');
    expect(res.stats[1].status).toBe('FAILED');
    expect(res.events.length).toBe(0);
    errorSpy.mockRestore();
  });

  it('4. duplicate event in both feeds: the same source wins every time across repeated runs', async () => {
    // If family is MUCH faster than personal, we want to ensure personal still wins in the dedupe logic
    setupDelays({ personal: 50, family: 5 }, {}, 'dup-123');
    
    const res = await fetchAllCalendarEventsForDay(sources, '2024-03-04');
    
    expect(res.events.length).toBe(1);
    expect(res.events[0].sourceKey).toBe('personal');
    expect(res.events[0].title).toBe('PERSONAL Event');
    
    // Reverse delays
    setupDelays({ personal: 5, family: 50 }, {}, 'dup-123');
    const res2 = await fetchAllCalendarEventsForDay(sources, '2024-03-04');
    expect(res2.events.length).toBe(1);
    expect(res2.events[0].sourceKey).toBe('personal');
    expect(res2.events[0].title).toBe('PERSONAL Event');
  });
});

