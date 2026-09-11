import { FastifyInstance } from 'fastify';
import { getConfiguredCalendars, getEventsInWindow } from '../services/calendar.js';

export async function calendarRoutes(fastify: FastifyInstance) {
  fastify.get('/api/calendar', async (req, reply) => {
    const query = req.query as { force?: string };
    const forceRefresh = query.force === 'true';

    const { getChicagoDayKey } = await import('../utils/date.js');
    const todayKey = getChicagoDayKey();
    
    // Window: Today to Today + 6 days
    const startWindow = new Date(`${todayKey}T00:00:00Z`);
    // Adjust by -24h for start to be safe with timezones
    startWindow.setHours(startWindow.getHours() - 24);
    
    // Determine the end day key
    const endWindow = new Date(`${todayKey}T00:00:00Z`);
    endWindow.setUTCDate(endWindow.getUTCDate() + 6);
    endWindow.setUTCHours(47, 59, 59); // +24 hours for safety padding
    
    // We strictly filter for the 7 actual day keys we want
    const validDayKeys = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(`${todayKey}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().substring(0, 10);
    });

    const sources = getConfiguredCalendars();
    const { events, errors } = await getEventsInWindow(sources, startWindow, endWindow, forceRefresh);
    
    // Filter to only the 7 requested dayKeys and sort
    const validEvents = events
      .filter(e => validDayKeys.includes(e.dayKey))
      .sort((a, b) => {
        // Sort chronologically within the day. If timeStr is absent, it's all-day (put first).
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        if (a.timeStr && b.timeStr) return a.timeStr.localeCompare(b.timeStr);
        return a.title.localeCompare(b.title);
      });

    // Group by dayKey
    const grouped: Record<string, typeof validEvents> = {};
    for (const key of validDayKeys) {
      const dayEvents = validEvents.filter(e => e.dayKey === key);
      if (dayEvents.length > 0) {
        grouped[key] = dayEvents;
      }
    }

    return reply.send({
      days: grouped,
      errors,
      sources: sources.map(s => s.key)
    });
  });
}

