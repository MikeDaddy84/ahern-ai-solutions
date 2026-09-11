import ical from 'node-ical';
import { formatInTimeZone } from 'date-fns-tz';
import { CHICAGO_TZ } from '../utils/date.js';
import { DateTime } from 'luxon';

export function shortenTitle(title: string): string {
  let cleaned = title.replace(/https?:\/\/\S+/gi, '').trim();

  const fillerWords = [
    /\bmeeting\s+(about|regarding|re|for|to discuss)\b/gi,
    /\b(quick\s+)?(sync|standup|stand-up|check[\s-]?in|catch[\s-]?up|huddle|touchpoint|touch base)\b/gi,
    /\b(regarding|re:|concerning|with respect to)\b/gi,
    /\b(appointment|appt)\s+(for|with)\b/gi,
  ];

  fillerWords.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, '').trim();
  });

  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  if (cleaned.length > 40) {
    cleaned = cleaned.substring(0, 40);
    const lastSpace = cleaned.lastIndexOf(' ');
    if (lastSpace > 20) {
      cleaned = cleaned.substring(0, lastSpace);
    }
    cleaned += '…';
  }

  return cleaned || title.trim();
}

export interface CalendarSource {
  key: string;
  url: string;
  prefix: string;
}

export function getAllCalendars(): (CalendarSource & { configured: boolean })[] {
  return [
    { key: 'personal', url: process.env.CALENDAR_ICS_URL || '', prefix: '📅', configured: !!(process.env.CALENDAR_ICS_URL || '').trim() },
    { key: 'family', url: process.env.FAMILY_CALENDAR_ICS_URL || '', prefix: '🏠', configured: !!(process.env.FAMILY_CALENDAR_ICS_URL || '').trim() }
  ];
}

export function getConfiguredCalendars(): CalendarSource[] {
  return getAllCalendars().filter((s) => s.configured);
}

export interface CalendarEventEntry {
  id: string; // Add a unique ID for React keys
  title: string;
  formattedEntry: string;
  timeStr?: string; // Add timeStr for rendering
  isAllDay: boolean; // Add isAllDay for rendering
  sourceKey: string;
  sourcePrefix: string;
  dayKey: string; // We map it to the day it falls on
}

interface CacheEntry {
  timestamp: number;
  data: any;
}

const calendarCache = new Map<string, CacheEntry>();
export const CALENDAR_CACHE_TTL_MINUTES = 3;
const CACHE_TTL_MS = CALENDAR_CACHE_TTL_MINUTES * 60 * 1000;

export async function fetchCalendarRaw(source: CalendarSource, force: boolean): Promise<any> {
  if (!force) {
    const cached = calendarCache.get(source.key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  try {
    const events = await ical.async.fromURL(source.url);
    calendarCache.set(source.key, { timestamp: Date.now(), data: events });
    return events;
  } catch (err: any) {
    let host = 'unknown';
    try {
      host = new URL(source.url).host;
    } catch (e) { }
    const status = err?.response?.status || err?.status || 'unknown';
    let data = err?.response?.data || err?.message || String(err);
    if (typeof data === 'string') {
      data = data.replace(source.url, `https://${host}/...`);
    }
    console.error(`Calendar ICS fetch failed [${source.key}]: HTTP ${status}`);
    throw new Error(`Failed to fetch calendar ${source.key}`);
  }
}

export interface CalendarFetchStats {
  sourceKey: string;
  httpStatus: string | number;
  totalParsed: number;
  matchingToday: number;
  status?: 'OK' | 'FAILED';
}

export async function getEventsInWindow(
  sources: CalendarSource[],
  startWindow: Date,
  endWindow: Date,
  forceRefresh: boolean = false
): Promise<{ events: CalendarEventEntry[], errors: Record<string, string>, stats: CalendarFetchStats[] }> {
  const results: CalendarEventEntry[] = [];
  const errors: Record<string, string> = {};
  const stats: CalendarFetchStats[] = [];

  const promises = sources.map(async (source) => {
    let sourceEvents = 0;
    const sourceResults: CalendarEventEntry[] = [];
    try {
      const data = await fetchCalendarRaw(source, forceRefresh);
      const eventsObj: any[] = [];
      
      // Flatten node-ical structure
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (v?.type === 'VEVENT') {
          eventsObj.push(v);
          sourceEvents++;
        }
        if (v?.type === 'VCALENDAR') {
           for (const sk of Object.keys(v)) {
             if (v[sk]?.type === 'VEVENT') {
               eventsObj.push(v[sk]);
               sourceEvents++;
             }
           }
        }
      }

      for (const event of eventsObj) {
        if (event.recurrenceid) continue; // Handled as modification in the main loop

        const processOccurrence = (targetDate: Date, evtObj: any) => {
          const summary = evtObj.summary ? String(evtObj.summary) : 'Untitled Event';
          const isAllDay = (evtObj.datetype === 'date') || 
            (targetDate.getHours() === 0 && targetDate.getMinutes() === 0 && targetDate.getSeconds() === 0 && !evtObj.end);
            
          const eventDayKey = formatInTimeZone(targetDate, CHICAGO_TZ, 'yyyy-MM-dd');
          
          // Double check the generated dayKey is within our window bounds
          const dayKeyDate = new Date(`${eventDayKey}T12:00:00Z`);
          if (dayKeyDate < new Date(formatInTimeZone(startWindow, CHICAGO_TZ, 'yyyy-MM-dd') + 'T00:00:00Z') ||
              dayKeyDate > new Date(formatInTimeZone(endWindow, CHICAGO_TZ, 'yyyy-MM-dd') + 'T23:59:59Z')) {
            return;
          }

          const shortTitle = shortenTitle(summary);
          const uid = evtObj.uid ? String(evtObj.uid) : `${shortTitle}-${targetDate.getTime()}`;
          const finalId = `${uid}-${eventDayKey}`;

          let formattedEntry: string;
          let timeStr: string | undefined;
          
          if (isAllDay) {
            formattedEntry = `${source.prefix} ${shortTitle}`;
          } else {
            timeStr = formatInTimeZone(targetDate, CHICAGO_TZ, 'h:mm a');
            formattedEntry = `${source.prefix} ${timeStr} - ${shortTitle}`;
          }

          sourceResults.push({
            id: finalId,
            title: summary,
            formattedEntry,
            timeStr,
            isAllDay,
            sourceKey: source.key,
            sourcePrefix: source.prefix,
            dayKey: eventDayKey,
          });
        };

        if (event.rrule) {
          // rrule expects bounds in its mangled local time representation, so we pad significantly
          const rruleStart = new Date(startWindow.getTime() - 48*60*60*1000);
          const rruleEnd = new Date(endWindow.getTime() + 48*60*60*1000);
          const rawDates = event.rrule.between(rruleStart, rruleEnd);

          for (const rawD of rawDates) {
            // rawD's UTC fields contain the wall-clock time in the server's timezone
            // Convert back to true UTC via luxon, except for all-day events which are timezone-agnostic
            let correctedDate;
            if (event.datetype === 'date') {
                correctedDate = new Date(Date.UTC(rawD.getUTCFullYear(), rawD.getUTCMonth(), rawD.getUTCDate(), 12, 0, 0));
            } else {
                correctedDate = DateTime.fromJSDate(rawD).toUTC().setZone('local', { keepLocalTime: true }).toJSDate();
            }
            
            const dateStr = correctedDate.toISOString().substring(0, 10);
            const exactTime = correctedDate.getTime();

            // Check EXDATEs
            let isExcluded = false;
            if (event.exdate) {
                const exdates = Object.keys(event.exdate).map(k => new Date(event.exdate[k]).getTime());
                if (exdates.includes(exactTime)) {
                    isExcluded = true;
                } else if (event.exdate[dateStr]) {
                    isExcluded = true;
                }
            }
            if (isExcluded) continue;

            // Check RECURRENCES (modifications)
            let modifiedEvt = null;
            if (event.recurrences) {
                for (const rk of Object.keys(event.recurrences)) {
                    if (new Date(event.recurrences[rk].start).getTime() === exactTime) {
                        modifiedEvt = event.recurrences[rk];
                        break;
                    }
                }
                if (!modifiedEvt && event.recurrences[dateStr]) {
                    modifiedEvt = event.recurrences[dateStr];
                }
            }

            if (modifiedEvt) {
              processOccurrence(modifiedEvt.start || correctedDate, modifiedEvt);
            } else {
              processOccurrence(correctedDate, event);
            }
          }
        } else {
          // One-off event
          if (event.start && event.start >= startWindow && event.start <= endWindow) {
            processOccurrence(event.start, event);
          }
        }
      }
      
      return {
        success: true,
        source,
        sourceEvents,
        sourceResults
      };
      
    } catch (err: any) {
      let host = 'unknown';
      try { host = new URL(source.url).host; } catch (e) {}
      console.error(`Calendar expansion failed [${host}]: ${err.name || 'Error'} - ${err.message}`);
      
      return {
        success: false,
        source,
        error: err,
        errorMessage: err.message || 'Unknown error'
      };
    }
  });

  const settled = await Promise.allSettled(promises);

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const val = outcome.value;
      if (val.success) {
        results.push(...val.sourceResults!);
        stats.push({
          sourceKey: val.source.key,
          httpStatus: 200, // success
          totalParsed: val.sourceEvents!,
          matchingToday: 0, // Will be computed in fetchAllCalendarEventsForDay
          status: 'OK'
        });
      } else {
        errors[val.source.key] = val.errorMessage!;
        stats.push({
          sourceKey: val.source.key,
          httpStatus: 'ERR',
          totalParsed: 0,
          matchingToday: 0,
          status: 'FAILED'
        });
      }
    }
  }

  return { events: results, errors, stats };
}

export async function fetchAllCalendarEventsForDay(
  sources: CalendarSource[],
  targetDayKey: string // YYYY-MM-DD
): Promise<{ events: CalendarEventEntry[], stats: CalendarFetchStats[] }> {
  // Pad the window a bit to catch timezone edge cases
  const startWindow = new Date(`${targetDayKey}T00:00:00Z`);
  startWindow.setHours(startWindow.getHours() - 24);
  const endWindow = new Date(`${targetDayKey}T23:59:59Z`);
  endWindow.setHours(endWindow.getHours() + 24);

  const { events, stats } = await getEventsInWindow(sources, startWindow, endWindow, true); // force for rollover to match old behavior
  
  // Filter for just the target day and deduplicate
  const filtered = events.filter(e => e.dayKey === targetDayKey);
  
  const finalResults: CalendarEventEntry[] = [];
  const seenKeys = new Set<string>();

  for (const event of filtered) {
    if (seenKeys.has(event.id) || seenKeys.has(event.formattedEntry)) continue;
    seenKeys.add(event.id);
    seenKeys.add(event.formattedEntry);
    finalResults.push(event);
  }
  
  // Update stats with matchingToday count
  const updatedStats = stats.map(st => {
     return {
        ...st,
        matchingToday: finalResults.filter(r => r.sourceKey === st.sourceKey).length
     };
  });

  return { events: finalResults, stats: updatedStats };
}

