import { describe, expect, it } from 'vitest';
import {
  ageOn,
  daysInMonth,
  exceedsYears,
  formatAge,
  isLeapYear,
  meetsMinimumYears,
  resolveRelaxation,
} from './age.js';

describe('ageOn', () => {
  it('computes a straightforward age', () => {
    expect(ageOn('2000-01-01', '2026-01-01')).toEqual({ years: 26, months: 0, days: 0 });
  });

  it('computes years, months and days with borrowing', () => {
    // 15 Mar 2000 → 10 Jan 2026 = 25y 9m 26d
    expect(ageOn('2000-03-15', '2026-01-10')).toEqual({ years: 25, months: 9, days: 26 });
  });

  it('borrows days from the correct preceding month', () => {
    // Borrowing across March means taking February's length (28 in 2026).
    expect(ageOn('2000-02-20', '2026-03-10')).toEqual({ years: 26, months: 0, days: 18 });
  });

  it('borrows across a year boundary', () => {
    expect(ageOn('2000-12-20', '2026-01-10')).toEqual({ years: 25, months: 0, days: 21 });
  });

  it('returns null when the reference date precedes the date of birth', () => {
    expect(ageOn('2026-01-01', '2000-01-01')).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(ageOn('', '2026-01-01')).toBeNull();
    expect(ageOn('not-a-date', '2026-01-01')).toBeNull();
    expect(ageOn('2000-01-01', 'nonsense')).toBeNull();
  });

  it('rejects impossible calendar dates rather than silently rolling over', () => {
    // 30 Feb does not exist; Date would roll it to 1/2 March.
    expect(ageOn('2026-02-30', '2026-03-01')).toBeNull();
  });

  it('is not affected by a time component on the reference date', () => {
    expect(ageOn('2000-01-01', '2026-01-01T23:59:59.999Z')).toEqual({
      years: 26,
      months: 0,
      days: 0,
    });
  });

  describe('leap-year birthdays', () => {
    // A 29 Feb birthday attains its next age on 1 March in a non-leap year.
    it('has NOT yet completed the year on 28 Feb of a non-leap year', () => {
      const age = ageOn('2000-02-29', '2026-02-28');
      expect(age).not.toBeNull();
      expect(age!.years).toBe(25);
      expect(age!.months).toBe(11);
    });

    it('is exactly 26 with no remainder on 1 March of a non-leap year', () => {
      expect(ageOn('2000-02-29', '2026-03-01')).toEqual({ years: 26, months: 0, days: 0 });
    });

    it('keeps a 29-Feb candidate under an upper age bar for one extra day', () => {
      // Max age 26 as on 28 Feb 2026 → still within the limit.
      // Same bar as on 1 Mar 2026 → exactly at the limit, still within it.
      expect(exceedsYears(ageOn('2000-02-29', '2026-02-28')!, 26)).toBe(false);
      expect(exceedsYears(ageOn('2000-02-29', '2026-03-01')!, 26)).toBe(false);
      // One day later they are over.
      expect(exceedsYears(ageOn('2000-02-29', '2026-03-02')!, 26)).toBe(true);
    });

    it('is exactly 24 on the 29 Feb anniversary in a leap year', () => {
      expect(ageOn('2000-02-29', '2024-02-29')).toEqual({ years: 24, months: 0, days: 0 });
    });
  });
});

describe('daysInMonth / isLeapYear', () => {
  it('knows February in leap and non-leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400
  });

  it('identifies leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });
});

describe('exceedsYears — the upper-bound boundary', () => {
  it('does not exceed on the exact anniversary', () => {
    expect(exceedsYears({ years: 27, months: 0, days: 0 }, 27)).toBe(false);
  });

  it('exceeds by a single day past the anniversary', () => {
    expect(exceedsYears({ years: 27, months: 0, days: 1 }, 27)).toBe(true);
  });

  it('exceeds by a single month past the anniversary', () => {
    expect(exceedsYears({ years: 27, months: 1, days: 0 }, 27)).toBe(true);
  });

  it('does not exceed when comfortably under', () => {
    expect(exceedsYears({ years: 24, months: 11, days: 30 }, 27)).toBe(false);
  });

  it('exceeds when over by whole years', () => {
    expect(exceedsYears({ years: 30, months: 0, days: 0 }, 27)).toBe(true);
  });
});

describe('meetsMinimumYears', () => {
  it('accepts the exact minimum', () => {
    expect(meetsMinimumYears({ years: 18, months: 0, days: 0 }, 18)).toBe(true);
  });

  it('rejects one day short of the minimum', () => {
    expect(meetsMinimumYears({ years: 17, months: 11, days: 30 }, 18)).toBe(false);
  });
});

describe('formatAge', () => {
  it('formats years and months', () => {
    expect(formatAge({ years: 24, months: 3, days: 12 })).toBe('24 years 3 months');
  });

  it('uses singular units', () => {
    expect(formatAge({ years: 1, months: 1, days: 0 })).toBe('1 year 1 month');
  });

  it('omits a zero month component', () => {
    expect(formatAge({ years: 24, months: 0, days: 5 })).toBe('24 years');
  });

  it('surfaces days only for very young ages', () => {
    expect(formatAge({ years: 0, months: 0, days: 5 })).toBe('0 years 5 days');
  });
});

describe('resolveRelaxation', () => {
  const table = { GENERAL: 0, OBC_NCL: 3, SC: 5, ST: 5, PWBD: 10 };

  it('returns zero with no table', () => {
    expect(resolveRelaxation(undefined, ['SC'])).toEqual({
      years: 0,
      appliedTokens: [],
      ambiguous: false,
    });
  });

  it('returns zero for a category with no relaxation', () => {
    const r = resolveRelaxation(table, ['GENERAL']);
    expect(r.years).toBe(0);
    expect(r.ambiguous).toBe(false);
  });

  it('applies a single category relaxation', () => {
    expect(resolveRelaxation(table, ['SC']).years).toBe(5);
    expect(resolveRelaxation(table, ['OBC_NCL']).years).toBe(3);
  });

  it('normalises hyphen and underscore forms of the same key', () => {
    expect(resolveRelaxation({ 'OBC-NCL': 3 }, ['OBC_NCL']).years).toBe(3);
    expect(resolveRelaxation({ OBC_NCL: 3 }, ['obc-ncl']).years).toBe(3);
  });

  it('takes the largest single relaxation and flags ambiguity when several apply', () => {
    const r = resolveRelaxation(table, ['SC', 'PWBD']);
    // Deliberately NOT 15 — we never blindly sum.
    expect(r.years).toBe(10);
    expect(r.ambiguous).toBe(true);
  });

  it('prefers an explicit combination key over the largest single', () => {
    const r = resolveRelaxation({ ...table, 'SC+PWBD': 15 }, ['SC', 'PWBD']);
    expect(r.years).toBe(15);
    expect(r.ambiguous).toBe(false);
    expect(r.combinationKey).toBe('SC+PWBD');
  });

  it('prefers the most specific combination when several match', () => {
    const r = resolveRelaxation(
      { SC: 5, PWBD: 10, WOMEN: 2, 'SC+PWBD': 15, 'SC+PWBD+WOMEN': 18 },
      ['SC', 'PWBD', 'WOMEN'],
    );
    expect(r.years).toBe(18);
    expect(r.combinationKey).toBe('SC+PWBD+WOMEN');
  });

  it('ignores a combination the candidate does not fully satisfy', () => {
    const r = resolveRelaxation({ SC: 5, PWBD: 10, 'SC+PWBD': 15 }, ['SC']);
    expect(r.years).toBe(5);
    expect(r.combinationKey).toBeUndefined();
  });

  it('does not flag ambiguity when only one relaxation is non-zero', () => {
    const r = resolveRelaxation(table, ['SC', 'GENERAL']);
    expect(r.years).toBe(5);
    expect(r.ambiguous).toBe(false);
  });

  it('ignores non-numeric table values', () => {
    const r = resolveRelaxation({ SC: 'five' as unknown as number, ST: 5 }, ['SC']);
    expect(r.years).toBe(0);
  });
});
