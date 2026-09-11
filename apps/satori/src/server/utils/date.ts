import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { parse } from 'date-fns';

export const CHICAGO_TZ = 'America/Chicago';

/**
 * Returns YYYY-MM-DD in America/Chicago timezone for a given Date or current time.
 */
export function getChicagoDayKey(date: Date = new Date()): string {
  return formatInTimeZone(date, CHICAGO_TZ, 'yyyy-MM-dd');
}

/**
 * Returns ordinal suffix for a number (1 -> st, 2 -> nd, 3 -> rd, 4 -> th, 11-13 -> th).
 */
export function getOrdinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

/**
 * Returns pretty date string like "Friday, February 19th 2026" in Chicago timezone.
 */
export function getPrettyDate(input?: Date | string): string {
  let date: Date;
  if (!input) {
    date = new Date();
  } else if (typeof input === 'string') {
    // If input is YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      date = parse(input, 'yyyy-MM-dd', new Date());
    } else {
      date = new Date(input);
    }
  } else {
    date = input;
  }

  const dayName = formatInTimeZone(date, CHICAGO_TZ, 'EEEE');
  const monthName = formatInTimeZone(date, CHICAGO_TZ, 'MMMM');
  const dayNum = parseInt(formatInTimeZone(date, CHICAGO_TZ, 'd'), 10);
  const year = formatInTimeZone(date, CHICAGO_TZ, 'yyyy');

  return `${dayName}, ${monthName} ${dayNum}${getOrdinal(dayNum)} ${year}`;
}

