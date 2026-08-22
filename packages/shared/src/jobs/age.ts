/**
 * Age arithmetic for statutory eligibility.
 *
 * Age is the single most common reason a candidate is rejected, and it is
 * also the easiest thing to get subtly wrong. Two rules drive this module:
 *
 *  1. Age is ALWAYS reckoned on the recruitment's own cutoff date, never on
 *     "today". A verdict computed against today's date silently changes as
 *     time passes, which is unacceptable for a statutory claim.
 *
 *  2. The boundary is inclusive of the exact anniversary. Indian
 *     notifications phrase the upper limit as "must not have exceeded 27
 *     years as on 01-08-2026", which means a candidate who turns exactly 27
 *     on the cutoff date is still within the limit; one day older is not.
 *
 * Everything here is pure calendar arithmetic on UTC date parts, so it is
 * immune to server timezone and DST.
 */

/** A calendar age broken into whole years, months and days. */
export interface Age {
  years: number;
  months: number;
  days: number;
}

/** Parse an ISO date (YYYY-MM-DD or full ISO) into UTC y/m/d parts. */
function parseUtcDateParts(iso: string): { y: number; m: number; d: number } | null {
  const trimmed = (iso ?? '').trim();
  if (!trimmed) return null;
  // Fast path for plain YYYY-MM-DD, avoiding Date's timezone behaviour.
  const simple = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (simple) {
    const y = Number(simple[1]);
    const m = Number(simple[2]);
    const d = Number(simple[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    // Reject impossible dates like 2026-02-30.
    if (daysInMonth(y, m) < d) return null;
    return { y, m, d };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    y: parsed.getUTCFullYear(),
    m: parsed.getUTCMonth() + 1,
    d: parsed.getUTCDate(),
  };
}

/** Days in a given 1-indexed month, leap-year aware. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Exact calendar age of someone born on `dobIso` as reckoned on `onIso`.
 *
 * Returns null when either date is unparseable, or when the "on" date is
 * before the date of birth (a nonsensical input we refuse to guess about).
 *
 * Leap-year handling: a 29 Feb birthday attains its next age on 1 MARCH in
 * non-leap years, which falls out of the day-borrow arithmetic below and
 * matches the usual Indian administrative treatment (the anniversary of a
 * date that does not exist rolls to the following day). Concretely, someone
 * born 29 Feb 2000 is 25y 11m on 28 Feb 2026 and exactly 26y on 1 Mar 2026.
 *
 * This also happens to be the candidate-favourable reading for the common
 * case of an UPPER age bar: the candidate stays a year younger for one extra
 * day compared with a 28 Feb rollover.
 */
export function ageOn(dobIso: string, onIso: string): Age | null {
  const dob = parseUtcDateParts(dobIso);
  const on = parseUtcDateParts(onIso);
  if (!dob || !on) return null;

  const dobStamp = dob.y * 10000 + dob.m * 100 + dob.d;
  const onStamp = on.y * 10000 + on.m * 100 + on.d;
  if (onStamp < dobStamp) return null;

  let years = on.y - dob.y;
  let months = on.m - dob.m;
  let days = on.d - dob.d;

  if (days < 0) {
    months -= 1;
    // Borrow from the month preceding the "on" date.
    const prevMonth = on.m === 1 ? 12 : on.m - 1;
    const prevMonthYear = on.m === 1 ? on.y - 1 : on.y;
    days += daysInMonth(prevMonthYear, prevMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days };
}

/**
 * True when `age` is greater than `limitYears` by any amount.
 *
 * Used for the upper bound, so that exactly `limitYears` + 0m + 0d passes
 * and `limitYears` + 0m + 1d fails.
 */
export function exceedsYears(age: Age, limitYears: number): boolean {
  if (age.years > limitYears) return true;
  if (age.years < limitYears) return false;
  return age.months > 0 || age.days > 0;
}

/** True when `age` has reached at least `minYears` complete years. */
export function meetsMinimumYears(age: Age, minYears: number): boolean {
  return age.years >= minYears;
}

/** Human-readable age, e.g. "24 years 3 months". */
export function formatAge(age: Age): string {
  const parts: string[] = [`${age.years} year${age.years === 1 ? '' : 's'}`];
  if (age.months > 0) parts.push(`${age.months} month${age.months === 1 ? '' : 's'}`);
  // Only surface days when the age is very tight, to keep the UI readable.
  if (age.years === 0 && age.months === 0) {
    parts.push(`${age.days} day${age.days === 1 ? '' : 's'}`);
  }
  return parts.join(' ');
}

/**
 * Resolve the applicable upper-age relaxation in years.
 *
 * Relaxation is genuinely messy in Indian recruitment: some notifications
 * stack SC + PwBD, others cap the combination, others define bespoke slabs.
 * Blindly summing every applicable row would produce confidently wrong
 * verdicts, so the resolution order is deliberately conservative:
 *
 *   1. An exact combination key present in the table always wins
 *      (e.g. "SC+PWBD": 15). This is the notification speaking explicitly.
 *   2. Otherwise take the single LARGEST applicable relaxation.
 *   3. If more than one relaxation applies and no explicit combination key
 *      exists, report `ambiguous` so the caller can downgrade the verdict to
 *      CONDITIONALLY_ELIGIBLE rather than assert a pass.
 *
 * Token matching is case-insensitive and tolerant of `-`/`_` differences so
 * "OBC-NCL" and "OBC_NCL" resolve to the same row.
 */
export interface RelaxationResolution {
  years: number;
  /** Tokens that matched a relaxation row. */
  appliedTokens: string[];
  /** True when several relaxations applied without an explicit combination. */
  ambiguous: boolean;
  /** The exact combination key used, when one matched. */
  combinationKey?: string;
}

function normaliseToken(token: string): string {
  return token.trim().toUpperCase().replace(/[-\s]+/g, '_');
}

export function resolveRelaxation(
  table: Record<string, number> | undefined,
  candidateTokens: string[],
): RelaxationResolution {
  if (!table || Object.keys(table).length === 0) {
    return { years: 0, appliedTokens: [], ambiguous: false };
  }

  // Index the table by normalised key, keeping combination keys separate.
  const singles = new Map<string, number>();
  const combos = new Map<string, { years: number; parts: Set<string>; original: string }>();
  for (const [rawKey, years] of Object.entries(table)) {
    if (typeof years !== 'number' || !Number.isFinite(years)) continue;
    if (rawKey.includes('+')) {
      const parts = new Set(rawKey.split('+').map(normaliseToken).filter(Boolean));
      combos.set(
        [...parts].sort().join('+'),
        { years, parts, original: rawKey },
      );
    } else {
      singles.set(normaliseToken(rawKey), years);
    }
  }

  const tokens = candidateTokens.map(normaliseToken).filter(Boolean);
  const tokenSet = new Set(tokens);

  // 1. Exact combination match — prefer the most specific (largest) combo
  //    whose parts are all held by the candidate.
  let bestCombo: { years: number; key: string; size: number } | null = null;
  for (const [key, combo] of combos) {
    const allHeld = [...combo.parts].every((p) => tokenSet.has(p));
    if (!allHeld) continue;
    if (!bestCombo || combo.parts.size > bestCombo.size) {
      bestCombo = { years: combo.years, key: combo.original, size: combo.parts.size };
    }
  }

  // 2. Single-token matches.
  const applied: string[] = [];
  let maxSingle = 0;
  for (const token of tokenSet) {
    const years = singles.get(token);
    if (years === undefined) continue;
    applied.push(token);
    if (years > maxSingle) maxSingle = years;
  }

  if (bestCombo) {
    return {
      years: bestCombo.years,
      appliedTokens: applied.length > 0 ? applied : [bestCombo.key],
      ambiguous: false,
      combinationKey: bestCombo.key,
    };
  }

  // Only relaxations that are actually greater than zero can create ambiguity.
  const effective = applied.filter((t) => (singles.get(t) ?? 0) > 0);
  return {
    years: maxSingle,
    appliedTokens: applied,
    ambiguous: effective.length > 1,
  };
}
