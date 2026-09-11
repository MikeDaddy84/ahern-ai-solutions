import { describe, it, expect } from 'vitest';
import { parseSheetDateToDayKey, mapType, buildSnapshotTasks } from '../../scripts/importLegacy.js';

describe('Legacy Import Utilities', () => {
  describe('parseSheetDateToDayKey', () => {
    it('parses valid M.d.yy dates', () => {
      expect(parseSheetDateToDayKey('8.4.26')).toBe('2026-08-04');
      expect(parseSheetDateToDayKey('12.25.26')).toBe('2026-12-25');
      expect(parseSheetDateToDayKey('1.1.27')).toBe('2027-01-01');
    });

    it('returns null for invalid sheet names', () => {
      expect(parseSheetDateToDayKey('To Do List')).toBeNull();
      expect(parseSheetDateToDayKey('Completed')).toBeNull();
      expect(parseSheetDateToDayKey('random')).toBeNull();
    });
  });

  describe('mapType', () => {
    it('maps valid types', () => {
      expect(mapType('Have To')).toBe('have_to');
      expect(mapType('Need To')).toBe('need_to');
      expect(mapType('Want To')).toBe('want_to');
      expect(mapType('HAVE TO')).toBe('have_to');
    });

    it('defaults to have_to for unknown types', () => {
      expect(mapType('')).toBe('have_to');
      expect(mapType('something else')).toBe('have_to');
    });
  });

  describe('buildSnapshotTasks', () => {
    it('builds a snapshot identically to the rollover shape', () => {
      const fixtureRows = [
        ['Agenda for Today ~ Friday, August 7th 2026'],
        ['Have To: 1', null, 'Need To: 1', null, 'Want To: 1'],
        [
          'Do laundry', false,
          'Pay bills', true,
          'Play video games', false
        ]
      ];

      const tasks = buildSnapshotTasks(fixtureRows, '2026-08-07');
      expect(tasks).toHaveLength(3);

      const haveTo = tasks.find(t => t.type === 'have_to');
      expect(haveTo).toBeDefined();
      expect(haveTo!.text).toBe('Do laundry');
      expect(haveTo!.status).toBe('today');
      expect(haveTo!.dayKey).toBe('2026-08-07');
      expect(haveTo!.source).toBe('manual');
      expect(haveTo!.id).toBeDefined();

      const needTo = tasks.find(t => t.type === 'need_to');
      expect(needTo).toBeDefined();
      expect(needTo!.text).toBe('Pay bills');
      expect(needTo!.status).toBe('done'); // since checkbox was true
      expect(needTo!.dayKey).toBe('2026-08-07');
      expect(needTo!.source).toBe('manual');
      expect(needTo!.dateDone).not.toBeNull();

      const wantTo = tasks.find(t => t.type === 'want_to');
      expect(wantTo).toBeDefined();
      expect(wantTo!.text).toBe('Play video games');
      expect(wantTo!.status).toBe('today');
      expect(wantTo!.dayKey).toBe('2026-08-07');
      expect(wantTo!.source).toBe('manual');
    });

    it('ignores empty rows or columns without text', () => {
      const fixtureRows = [
        ['Agenda for Today ~ Friday, August 7th 2026'],
        ['Have To: 1', null, 'Need To: 1', null, 'Want To: 1'],
        [
          'Only have to', false,
          null, false,
          '  ', false
        ],
        []
      ];

      const tasks = buildSnapshotTasks(fixtureRows, '2026-08-07');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].type).toBe('have_to');
      expect(tasks[0].text).toBe('Only have to');
    });
  });
});

