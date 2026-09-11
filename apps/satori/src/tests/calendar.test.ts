import { describe, it, expect } from 'vitest';
import { shortenTitle } from '../server/services/calendar.js';

describe('shortenTitle', () => {
  it('removes URLs from event titles', () => {
    const input = 'Project Kickoff https://zoom.us/j/123456789';
    expect(shortenTitle(input)).toBe('Project Kickoff');
  });

  it('strips common meeting filler phrases', () => {
    expect(shortenTitle('Quick Sync regarding Q3 Goals')).toBe('Q3 Goals');
    expect(shortenTitle('Meeting to discuss Product Roadmap')).toBe('Product Roadmap');
    expect(shortenTitle('Appointment with Dr. Smith')).toBe('Dr. Smith');
  });

  it('truncates long titles to 40 chars with ellipsis at word boundary', () => {
    const longTitle = 'This is a very long title that exceeds forty characters by a significant margin';
    const result = shortenTitle(longTitle);
    expect(result.length).toBeLessThanOrEqual(41);
    expect(result.endsWith('…')).toBe(true);
  });
});

