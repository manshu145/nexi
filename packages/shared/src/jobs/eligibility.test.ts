import { describe, expect, it } from 'vitest';
import type {
  CareerProfile,
  EducationRecord,
  EligibilityRules,
  ExperienceRecord,
  RuleCode,
  RuleEvaluation,
} from '../types/jobs.js';
import { eligibilityCacheKey, evaluateEligibility } from './eligibility.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

const NOW = new Date('2026-08-22T00:00:00.000Z');

function profile(overrides: Partial<CareerProfile> = {}): CareerProfile {
  return {
    userId: 'u1',
    dateOfBirth: '2002-01-15',
    nationality: 'Indian',
    category: 'GENERAL',
    domicileState: 'rajasthan',
    education: [],
    experience: [],
    skills: [],
    exams: [],
    profileVersion: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function degree(overrides: Partial<EducationRecord> = {}): EducationRecord {
  return {
    id: 'e1',
    level: 'BACHELORS',
    degree: 'B.Tech',
    discipline: 'Computer Science',
    graduationYear: 2024,
    percentage: 74,
    completed: true,
    ...overrides,
  };
}

function role(overrides: Partial<ExperienceRecord> = {}): ExperienceRecord {
  return {
    id: 'x1',
    role: 'Software Engineer',
    startDate: '2024-07-01',
    endDate: '2026-07-01',
    employmentType: 'FULL_TIME',
    ...overrides,
  };
}

/** Evaluate against a statutory sector by default. */
function run(p: CareerProfile, rules: EligibilityRules, jobVersion = 1) {
  return evaluateEligibility(p, rules, { jobVersion, sector: 'CENTRAL_GOVT' }, { now: NOW });
}

function ruleFor(rules: RuleEvaluation[], code: RuleCode): RuleEvaluation {
  const found = rules.find((r) => r.rule === code);
  if (!found) throw new Error(`no evaluation for rule ${code}`);
  return found;
}

// ── Overall behaviour ────────────────────────────────────────────────────

describe('evaluateEligibility — contract', () => {
  it('always returns a per-rule breakdown, never a bare verdict', () => {
    const result = run(profile(), {});
    expect(result.rules.length).toBeGreaterThan(0);
    for (const r of result.rules) {
      expect(r.required).toBeTruthy();
      expect(r.candidate).toBeTruthy();
      expect(r.status).toBeTruthy();
    }
  });

  it('echoes both cache-key versions so a stale verdict is detectable', () => {
    const result = run(profile({ profileVersion: 7 }), {}, 3);
    expect(result.profileVersion).toBe(7);
    expect(result.jobVersion).toBe(3);
  });

  it('reports ELIGIBLE for a statutory job with no stated requirements', () => {
    expect(run(profile(), {}).status).toBe('ELIGIBLE');
  });

  it('marks every unstated rule NOT_APPLICABLE rather than inventing a restriction', () => {
    const result = run(profile(), {});
    expect(ruleFor(result.rules, 'DOMICILE').status).toBe('NOT_APPLICABLE');
    expect(ruleFor(result.rules, 'PHYSICAL').status).toBe('NOT_APPLICABLE');
    expect(ruleFor(result.rules, 'GENDER').status).toBe('NOT_APPLICABLE');
  });

  it('honours the MANUAL_REVIEW flag from the extractor', () => {
    const result = run(profile(), {
      needsManualReview: true,
      manualReviewReason: 'Notification wording ambiguous',
    });
    expect(result.status).toBe('MANUAL_REVIEW');
    expect(result.warnings).toContain('Notification wording ambiguous');
  });

  it('lets a hard FAIL outrank MANUAL_REVIEW', () => {
    // Being told "eligible" (or even "under review") when an age bar
    // excludes you is the worst possible outcome, so FAIL must win.
    const result = run(profile({ dateOfBirth: '1980-01-01' }), {
      needsManualReview: true,
      age: { maxYears: 27, cutoffDate: '2026-08-01' },
    });
    expect(result.status).toBe('NOT_ELIGIBLE');
  });

  it('does not claim a statutory verdict for a private role', () => {
    const result = evaluateEligibility(
      profile({ education: [degree()] }),
      { education: { kind: 'QUALIFICATION', level: 'BACHELORS' } },
      { jobVersion: 1, sector: 'PRIVATE' },
      { now: NOW },
    );
    expect(result.status).toBe('CONDITIONALLY_ELIGIBLE');
    expect(result.warnings.join(' ')).toMatch(/employer decides/i);
  });
});

// ── AGE ──────────────────────────────────────────────────────────────────

describe('AGE', () => {
  it('passes inside the window', () => {
    const result = run(profile({ dateOfBirth: '2002-01-15' }), {
      age: { minYears: 18, maxYears: 27, cutoffDate: '2026-08-01' },
    });
    expect(result.status).toBe('ELIGIBLE');
    expect(ruleFor(result.rules, 'AGE').status).toBe('PASS');
  });

  it('passes on the exact maximum-age anniversary', () => {
    // Turns exactly 27 on the cutoff date.
    const result = run(profile({ dateOfBirth: '1999-08-01' }), {
      age: { maxYears: 27, cutoffDate: '2026-08-01' },
    });
    expect(ruleFor(result.rules, 'AGE').status).toBe('PASS');
    expect(result.status).toBe('ELIGIBLE');
  });

  it('fails one day past the maximum age', () => {
    const result = run(profile({ dateOfBirth: '1999-07-31' }), {
      age: { maxYears: 27, cutoffDate: '2026-08-01' },
    });
    expect(ruleFor(result.rules, 'AGE').status).toBe('FAIL');
    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.join(' ')).toMatch(/Maximum age is 27/);
  });

  it('fails below the minimum age', () => {
    const result = run(profile({ dateOfBirth: '2012-01-01' }), {
      age: { minYears: 18, cutoffDate: '2026-08-01' },
    });
    expect(ruleFor(result.rules, 'AGE').status).toBe('FAIL');
    expect(result.blockingReasons.join(' ')).toMatch(/Minimum age is 18/);
  });

  it('reckons age on the cutoff date, not today', () => {
    // On 2026-08-22 (now) this candidate is 27y 0m 21d — over the bar.
    // On the 2026-08-01 cutoff they are exactly 27 — within it.
    const dob = '1999-08-01';
    const withCutoff = run(profile({ dateOfBirth: dob }), {
      age: { maxYears: 27, cutoffDate: '2026-08-01' },
    });
    const withoutCutoff = run(profile({ dateOfBirth: dob }), {
      age: { maxYears: 27 },
    });
    expect(ruleFor(withCutoff.rules, 'AGE').status).toBe('PASS');
    expect(ruleFor(withoutCutoff.rules, 'AGE').status).toBe('FAIL');
  });

  it('warns when the notification omits a cutoff date', () => {
    const result = run(profile(), { age: { maxYears: 40 } });
    expect(result.warnings.join(' ')).toMatch(/did not state an age cutoff/i);
  });

  it('falls back to the application deadline as the cutoff', () => {
    const result = evaluateEligibility(
      profile({ dateOfBirth: '1999-08-01' }),
      { age: { maxYears: 27 } },
      { jobVersion: 1, sector: 'CENTRAL_GOVT', applicationDeadline: '2026-08-01T23:59:00.000Z' },
      { now: NOW },
    );
    expect(ruleFor(result.rules, 'AGE').status).toBe('PASS');
    expect(ruleFor(result.rules, 'AGE').required).toContain('2026-08-01');
  });

  it('asks for the date of birth instead of guessing', () => {
    const p = profile();
    delete p.dateOfBirth;
    const result = run(p, { age: { maxYears: 27, cutoffDate: '2026-08-01' } });
    expect(result.status).toBe('PROFILE_INCOMPLETE');
    expect(result.missingProfileFields).toContain('dateOfBirth');
  });

  it('applies category age relaxation to admit an otherwise-barred candidate', () => {
    const rules: EligibilityRules = {
      age: { maxYears: 27, cutoffDate: '2026-08-01', relaxationYears: { SC: 5, OBC_NCL: 3 } },
    };
    const dob = '1997-01-01'; // 29 on cutoff — over 27, under 32
    expect(run(profile({ dateOfBirth: dob, category: 'GENERAL' }), rules).status).toBe('NOT_ELIGIBLE');
    expect(run(profile({ dateOfBirth: dob, category: 'SC' }), rules).status).toBe('ELIGIBLE');
  });

  it('shows the relaxed limit in the required text', () => {
    const result = run(profile({ dateOfBirth: '1997-01-01', category: 'SC' }), {
      age: { maxYears: 27, cutoffDate: '2026-08-01', relaxationYears: { SC: 5 } },
    });
    expect(ruleFor(result.rules, 'AGE').required).toContain('relaxed max 32');
  });

  it('still fails when even the relaxed limit is exceeded', () => {
    const result = run(profile({ dateOfBirth: '1985-01-01', category: 'SC' }), {
      age: { maxYears: 27, cutoffDate: '2026-08-01', relaxationYears: { SC: 5 } },
    });
    expect(result.status).toBe('NOT_ELIGIBLE');
  });

  it('downgrades to CONDITIONAL when several relaxations could combine', () => {
    const result = run(
      profile({ dateOfBirth: '2002-01-15', category: 'SC', flags: ['PWBD'] }),
      { age: { maxYears: 27, cutoffDate: '2026-08-01', relaxationYears: { SC: 5, PWBD: 10 } } },
    );
    expect(ruleFor(result.rules, 'AGE').status).toBe('CONDITIONAL');
    expect(result.status).toBe('CONDITIONALLY_ELIGIBLE');
  });

  it('is confident again when the notification states the combination explicitly', () => {
    const result = run(
      profile({ dateOfBirth: '2002-01-15', category: 'SC', flags: ['PWBD'] }),
      {
        age: {
          maxYears: 27,
          cutoffDate: '2026-08-01',
          relaxationYears: { SC: 5, PWBD: 10, 'SC+PWBD': 15 },
        },
      },
    );
    expect(ruleFor(result.rules, 'AGE').status).toBe('PASS');
  });

  it('downgrades to CONDITIONAL when relaxation is flagged complex', () => {
    const result = run(profile(), {
      age: { maxYears: 40, cutoffDate: '2026-08-01', relaxationComplex: true },
    });
    expect(ruleFor(result.rules, 'AGE').status).toBe('CONDITIONAL');
  });
});

// ── EDUCATION ────────────────────────────────────────────────────────────

describe('EDUCATION', () => {
  it('passes an exact level match', () => {
    const result = run(profile({ education: [degree()] }), {
      education: { kind: 'QUALIFICATION', level: 'BACHELORS' },
    });
    expect(ruleFor(result.rules, 'EDUCATION').status).toBe('PASS');
  });

  it('fails when the candidate is below the required level', () => {
    const result = run(profile({ education: [degree({ level: 'CLASS_12', degree: undefined })] }), {
      education: { kind: 'QUALIFICATION', level: 'BACHELORS' },
    });
    expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    expect(result.status).toBe('NOT_ELIGIBLE');
  });

  it('accepts a higher qualification only when orHigher is set', () => {
    const masters = profile({ education: [degree({ level: 'MASTERS', degree: 'M.Tech' })] });
    const strict = run(masters, { education: { kind: 'QUALIFICATION', level: 'BACHELORS' } });
    const lenient = run(masters, {
      education: { kind: 'QUALIFICATION', level: 'BACHELORS', orHigher: true },
    });
    expect(ruleFor(strict.rules, 'EDUCATION').status).toBe('FAIL');
    expect(ruleFor(lenient.rules, 'EDUCATION').status).toBe('PASS');
  });

  it('never lets an OTHER-level qualification satisfy an orHigher comparison', () => {
    const result = run(profile({ education: [degree({ level: 'OTHER', degree: 'Certificate' })] }), {
      education: { kind: 'QUALIFICATION', level: 'BACHELORS', orHigher: true },
    });
    expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
  });

  it('asks for qualifications when none are recorded', () => {
    const result = run(profile(), { education: { kind: 'QUALIFICATION', level: 'BACHELORS' } });
    expect(result.status).toBe('PROFILE_INCOMPLETE');
    expect(result.missingProfileFields).toContain('education');
  });

  describe('discipline matching', () => {
    it('matches through the normaliser despite different wording', () => {
      const result = run(
        profile({ education: [degree({ discipline: 'Computer Science & Engineering' })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['CSE'] } },
      );
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('PASS');
    });

    it('fails on the wrong stream', () => {
      const result = run(profile({ education: [degree({ discipline: 'Computer Science' })] }), {
        education: { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['civil'] },
      });
      const edu = ruleFor(result.rules, 'EDUCATION');
      expect(edu.status).toBe('FAIL');
      expect(edu.detail).toMatch(/requires civil/i);
    });

    it('asks for the stream when it is missing', () => {
      const result = run(
        profile({ education: [degree({ discipline: undefined, disciplineSlug: undefined })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['civil'] } },
      );
      expect(result.status).toBe('PROFILE_INCOMPLETE');
      expect(result.missingProfileFields).toContain('education.discipline');
    });
  });

  describe('degree family matching', () => {
    it('treats B.E. and B.Tech as the same family', () => {
      const result = run(profile({ education: [degree({ degree: 'B.E.' })] }), {
        education: { kind: 'QUALIFICATION', level: 'BACHELORS', degreeFamilies: ['BE_BTECH'] },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('PASS');
    });

    it('fails a genuinely different degree family', () => {
      const result = run(profile({ education: [degree({ degree: 'B.Com' })] }), {
        education: { kind: 'QUALIFICATION', level: 'BACHELORS', degreeFamilies: ['BE_BTECH'] },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });

    it('reports CONDITIONAL — not FAIL — when equivalents are permitted', () => {
      const result = run(profile({ education: [degree({ degree: 'B.Sc' })] }), {
        education: {
          kind: 'QUALIFICATION',
          level: 'BACHELORS',
          degreeFamilies: ['BE_BTECH'],
          equivalentAllowed: true,
        },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('CONDITIONAL');
      expect(result.status).toBe('CONDITIONALLY_ELIGIBLE');
    });

    it('reports CONDITIONAL for an unrecognised degree rather than failing it', () => {
      const result = run(
        profile({ education: [degree({ degree: 'Shastri (Sanskrit)', degreeFamily: undefined })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', degreeFamilies: ['BE_BTECH'] } },
      );
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('CONDITIONAL');
    });
  });

  describe('minimum marks', () => {
    it('passes at exactly the threshold', () => {
      const result = run(profile({ education: [degree({ percentage: 60 })] }), {
        education: { kind: 'QUALIFICATION', level: 'BACHELORS', minPercentage: 60 },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('PASS');
    });

    it('fails just below the threshold', () => {
      const result = run(profile({ education: [degree({ percentage: 59.9 })] }), {
        education: { kind: 'QUALIFICATION', level: 'BACHELORS', minPercentage: 60 },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });

    it('derives a percentage from CGPA and says so', () => {
      // 6.0 CGPA × 9.5 = 57% → below a 60% bar.
      const result = run(
        profile({ education: [degree({ percentage: undefined, cgpa: 6.0 })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', minPercentage: 60 } },
      );
      const edu = ruleFor(result.rules, 'EDUCATION');
      expect(edu.status).toBe('FAIL');
      expect(edu.candidate).toMatch(/converted from CGPA/);
    });

    it('honours a university-specific CGPA scale', () => {
      const result = run(
        profile({ education: [degree({ percentage: undefined, cgpa: 6.5, cgpaScale: 10 })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', minPercentage: 60 } },
      );
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('PASS');
    });

    it('asks for marks when neither percentage nor CGPA is present', () => {
      const result = run(
        profile({ education: [degree({ percentage: undefined, cgpa: undefined })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', minPercentage: 60 } },
      );
      expect(result.status).toBe('PROFILE_INCOMPLETE');
      expect(result.missingProfileFields).toContain('education.percentage');
    });

    it('checks a CGPA floor directly', () => {
      const result = run(profile({ education: [degree({ cgpa: 6.0 })] }), {
        education: { kind: 'QUALIFICATION', level: 'BACHELORS', minCgpa: 7 },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });
  });

  describe('result awaited / completion', () => {
    it('fails a pending result when completion is mandatory', () => {
      const result = run(
        profile({ education: [degree({ completed: false, resultAwaited: true })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', mustBeCompleted: true } },
      );
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });

    it('reports CONDITIONAL for a pending result when completion is not mandated', () => {
      const result = run(
        profile({ education: [degree({ completed: false, resultAwaited: true })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS' } },
      );
      const edu = ruleFor(result.rules, 'EDUCATION');
      expect(edu.status).toBe('CONDITIONAL');
      expect(edu.detail).toMatch(/final-year/i);
    });

    it('enforces a result-declared-before date', () => {
      const late = run(
        profile({ education: [degree({ resultDate: '2026-09-01' })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', completedBefore: '2026-08-01' } },
      );
      const intime = run(
        profile({ education: [degree({ resultDate: '2026-07-01' })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', completedBefore: '2026-08-01' } },
      );
      expect(ruleFor(late.rules, 'EDUCATION').status).toBe('FAIL');
      expect(ruleFor(intime.rules, 'EDUCATION').status).toBe('PASS');
    });

    it('asks for the result date when a deadline applies', () => {
      const result = run(
        profile({ education: [degree({ resultDate: undefined })] }),
        { education: { kind: 'QUALIFICATION', level: 'BACHELORS', completedBefore: '2026-08-01' } },
      );
      expect(result.missingProfileFields).toContain('education.resultDate');
    });
  });

  describe('composition', () => {
    it('ANY_OF passes when one branch matches', () => {
      const result = run(profile({ education: [degree({ discipline: 'Electrical' })] }), {
        education: {
          kind: 'ANY_OF',
          of: [
            { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['civil'] },
            { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['electrical'] },
          ],
        },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('PASS');
      expect(ruleFor(result.rules, 'EDUCATION').required).toContain('OR');
    });

    it('ANY_OF fails when no branch matches', () => {
      const result = run(profile({ education: [degree({ discipline: 'Computer Science' })] }), {
        education: {
          kind: 'ANY_OF',
          of: [
            { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['civil'] },
            { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['electrical'] },
          ],
        },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });

    it('ALL_OF requires every branch', () => {
      const rules: EligibilityRules = {
        education: {
          kind: 'ALL_OF',
          of: [
            { kind: 'QUALIFICATION', level: 'BACHELORS' },
            { kind: 'SUBJECT_AT_LEVEL', level: 'CLASS_12', subject: 'Mathematics' },
          ],
        },
      };
      const without = run(profile({ education: [degree()] }), rules);
      const with12 = run(
        profile({
          education: [
            degree(),
            { id: 'e2', level: 'CLASS_12', completed: true, subjects: ['Physics', 'Mathematics'] },
          ],
        }),
        rules,
      );
      // Missing 12th record → we ask, we don't fail.
      expect(ruleFor(without.rules, 'EDUCATION').status).toBe('UNKNOWN');
      expect(ruleFor(with12.rules, 'EDUCATION').status).toBe('PASS');
    });

    it('ALL_OF surfaces a FAIL ahead of an UNKNOWN', () => {
      const result = run(profile({ education: [degree({ level: 'CLASS_10' })] }), {
        education: {
          kind: 'ALL_OF',
          of: [
            { kind: 'QUALIFICATION', level: 'BACHELORS' },
            { kind: 'SUBJECT_AT_LEVEL', level: 'CLASS_12', subject: 'Mathematics' },
          ],
        },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });

    it('NOT inverts a passing branch into an exclusion', () => {
      const result = run(profile({ education: [degree()] }), {
        education: { kind: 'NOT', of: { kind: 'QUALIFICATION', level: 'BACHELORS' } },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });

    it('NOT leaves an indeterminate branch indeterminate', () => {
      const result = run(profile(), {
        education: { kind: 'NOT', of: { kind: 'QUALIFICATION', level: 'BACHELORS' } },
      });
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('UNKNOWN');
    });

    it('SUBJECT_AT_LEVEL asks when subjects are not recorded', () => {
      const result = run(
        profile({ education: [{ id: 'e2', level: 'CLASS_12', completed: true }] }),
        { education: { kind: 'SUBJECT_AT_LEVEL', level: 'CLASS_12', subject: 'Mathematics' } },
      );
      expect(result.missingProfileFields).toContain('education.subjects');
    });

    it('SUBJECT_AT_LEVEL fails when the subject was not studied', () => {
      const result = run(
        profile({
          education: [{ id: 'e2', level: 'CLASS_12', completed: true, subjects: ['History'] }],
        }),
        { education: { kind: 'SUBJECT_AT_LEVEL', level: 'CLASS_12', subject: 'Mathematics' } },
      );
      expect(ruleFor(result.rules, 'EDUCATION').status).toBe('FAIL');
    });
  });

  it('accepts when any one of several held qualifications satisfies the rule', () => {
    const result = run(
      profile({
        education: [
          degree({ id: 'a', degree: 'B.Com', discipline: 'Commerce' }),
          degree({ id: 'b', degree: 'B.Tech', discipline: 'Computer Science' }),
        ],
      }),
      { education: { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['computer-science'] } },
    );
    expect(ruleFor(result.rules, 'EDUCATION').status).toBe('PASS');
  });
});

// ── EXPERIENCE ───────────────────────────────────────────────────────────

describe('EXPERIENCE', () => {
  it('passes at exactly the minimum', () => {
    const result = run(
      profile({ experience: [role({ startDate: '2024-08-01', endDate: '2026-08-01' })] }),
      { experience: { minTotalMonths: 24 } },
    );
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('PASS');
  });

  it('fails below the minimum', () => {
    const result = run(
      profile({ experience: [role({ startDate: '2025-08-01', endDate: '2026-08-01' })] }),
      { experience: { minTotalMonths: 24 } },
    );
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('FAIL');
    expect(result.blockingReasons.join(' ')).toMatch(/requires 2 years/);
  });

  it('asks for experience rather than failing an empty profile', () => {
    const result = run(profile(), { experience: { minTotalMonths: 24 } });
    expect(result.status).toBe('PROFILE_INCOMPLETE');
    expect(result.missingProfileFields).toContain('experience');
  });

  it('does not double-count overlapping roles', () => {
    // Two concurrent 12-month roles are 12 months of experience, not 24.
    const result = run(
      profile({
        experience: [
          role({ id: 'a', startDate: '2025-01-01', endDate: '2026-01-01' }),
          role({ id: 'b', startDate: '2025-01-01', endDate: '2026-01-01' }),
        ],
      }),
      { experience: { minTotalMonths: 24 } },
    );
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('FAIL');
  });

  it('merges partially overlapping roles into a single span', () => {
    const result = run(
      profile({
        experience: [
          role({ id: 'a', startDate: '2024-01-01', endDate: '2025-06-01' }),
          role({ id: 'b', startDate: '2025-01-01', endDate: '2026-01-01' }),
        ],
      }),
      { experience: { minTotalMonths: 24 } },
    );
    // 2024-01 → 2026-01 is 24 months.
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('PASS');
  });

  it('treats a current role as running until now', () => {
    const result = run(
      profile({ experience: [role({ startDate: '2024-08-01', endDate: undefined, current: true })] }),
      { experience: { minTotalMonths: 24 } },
    );
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('PASS');
  });

  it('counts only skill-relevant experience when the rule asks for it', () => {
    const result = run(
      profile({
        experience: [
          role({ id: 'a', startDate: '2022-01-01', endDate: '2024-01-01', skills: ['Excel'] }),
          role({ id: 'b', startDate: '2024-01-01', endDate: '2025-01-01', skills: ['React'] }),
        ],
      }),
      { experience: { minRelevantMonths: 24, relevantSkills: ['react'] } },
    );
    // Only 12 of the 36 months are React work.
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('FAIL');
    expect(result.blockingReasons.join(' ')).toMatch(/relevant experience/);
  });

  it('counts sector-relevant experience', () => {
    const result = run(
      profile({
        experience: [role({ startDate: '2024-01-01', endDate: '2026-01-01', sector: 'Banking' })],
      }),
      { experience: { minRelevantMonths: 24, relevantSectors: ['banking'] } },
    );
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('PASS');
  });

  it('counts only post-qualification experience when required', () => {
    const result = run(
      profile({
        education: [degree({ graduationYear: 2024 })], // treated as 2024-12-31
        experience: [role({ startDate: '2022-01-01', endDate: '2026-01-01' })],
      }),
      { experience: { minTotalMonths: 12, postQualificationOnly: true } },
    );
    // The role started before graduation, so nothing counts.
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('FAIL');
  });

  it('prefers an exact result date over the graduation year', () => {
    const result = run(
      profile({
        education: [degree({ graduationYear: 2024, resultDate: '2024-06-01' })],
        experience: [role({ startDate: '2024-07-01', endDate: '2026-07-01' })],
      }),
      { experience: { minTotalMonths: 24, postQualificationOnly: true } },
    );
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('PASS');
  });

  it('asks for a graduation year when post-qualification experience is required', () => {
    const result = run(
      profile({
        education: [degree({ graduationYear: undefined, resultDate: undefined })],
        experience: [role()],
      }),
      { experience: { minTotalMonths: 12, postQualificationOnly: true } },
    );
    expect(result.missingProfileFields).toContain('education.graduationYear');
  });

  it('checks managerial experience separately', () => {
    const result = run(
      profile({
        experience: [role({ startDate: '2024-01-01', endDate: '2026-01-01', managerial: false })],
      }),
      { experience: { minManagerialMonths: 12 } },
    );
    expect(ruleFor(result.rules, 'EXPERIENCE').status).toBe('FAIL');
  });
});

// ── DOMICILE ─────────────────────────────────────────────────────────────

describe('DOMICILE', () => {
  it('is not applicable for ANY', () => {
    const result = run(profile(), { domicile: { mode: 'ANY' } });
    expect(ruleFor(result.rules, 'DOMICILE').status).toBe('NOT_APPLICABLE');
  });

  it('passes a matching state', () => {
    const result = run(profile({ domicileState: 'rajasthan' }), {
      domicile: { mode: 'STATE_ONLY', state: 'rajasthan' },
    });
    expect(ruleFor(result.rules, 'DOMICILE').status).toBe('PASS');
  });

  it('fails a non-matching state', () => {
    const result = run(profile({ domicileState: 'bihar' }), {
      domicile: { mode: 'STATE_ONLY', state: 'rajasthan' },
    });
    expect(ruleFor(result.rules, 'DOMICILE').status).toBe('FAIL');
    expect(result.status).toBe('NOT_ELIGIBLE');
  });

  it('asks for domicile when it is missing', () => {
    const p = profile();
    delete p.domicileState;
    const result = run(p, { domicile: { mode: 'STATE_ONLY', state: 'rajasthan' } });
    expect(result.status).toBe('PROFILE_INCOMPLETE');
    expect(result.missingProfileFields).toContain('domicileState');
  });

  it('treats PREFERENCE_ONLY as a pass with a caveat, never a bar', () => {
    const result = run(profile({ domicileState: 'bihar' }), {
      domicile: { mode: 'PREFERENCE_ONLY', state: 'rajasthan' },
    });
    const dom = ruleFor(result.rules, 'DOMICILE');
    expect(dom.status).toBe('PASS');
    expect(dom.detail).toMatch(/not a bar/i);
    expect(result.status).toBe('ELIGIBLE');
  });

  it('treats LOCAL_RESERVATION as conditional', () => {
    const result = run(profile({ domicileState: 'bihar' }), {
      domicile: { mode: 'LOCAL_RESERVATION', state: 'rajasthan' },
    });
    expect(ruleFor(result.rules, 'DOMICILE').status).toBe('CONDITIONAL');
    expect(result.status).toBe('CONDITIONALLY_ELIGIBLE');
  });

  it('checks district when DISTRICT_ONLY', () => {
    const ok = run(profile({ domicileDistrict: 'jaipur' }), {
      domicile: { mode: 'DISTRICT_ONLY', district: 'jaipur' },
    });
    const bad = run(profile({ domicileDistrict: 'kota' }), {
      domicile: { mode: 'DISTRICT_ONLY', district: 'jaipur' },
    });
    expect(ruleFor(ok.rules, 'DOMICILE').status).toBe('PASS');
    expect(ruleFor(bad.rules, 'DOMICILE').status).toBe('FAIL');
  });
});

// ── Other scalar rules ───────────────────────────────────────────────────

describe('NATIONALITY / CATEGORY / GENDER', () => {
  it('passes a permitted nationality case-insensitively', () => {
    const result = run(profile({ nationality: 'indian' }), { nationalities: ['Indian'] });
    expect(ruleFor(result.rules, 'NATIONALITY').status).toBe('PASS');
  });

  it('fails a non-permitted nationality', () => {
    const result = run(profile({ nationality: 'Nepali' }), { nationalities: ['Indian'] });
    expect(ruleFor(result.rules, 'NATIONALITY').status).toBe('FAIL');
  });

  it('enforces a category-restricted vacancy', () => {
    const result = run(profile({ category: 'GENERAL' }), { restrictedToCategories: ['SC', 'ST'] });
    expect(ruleFor(result.rules, 'CATEGORY').status).toBe('FAIL');
  });

  it('enforces a gender-restricted vacancy', () => {
    const result = run(profile({ gender: 'MALE' }), { restrictedToGender: ['FEMALE'] });
    expect(ruleFor(result.rules, 'GENDER').status).toBe('FAIL');
  });

  it('treats PREFER_NOT_TO_SAY as unknown for a gender-restricted vacancy', () => {
    const result = run(profile({ gender: 'PREFER_NOT_TO_SAY' }), { restrictedToGender: ['FEMALE'] });
    expect(ruleFor(result.rules, 'GENDER').status).toBe('UNKNOWN');
    expect(result.missingProfileFields).toContain('gender');
  });
});

describe('EXAM_SCORE', () => {
  it('asks for the score with an actionable prompt', () => {
    const result = run(profile(), { examScores: [{ exam: 'GATE', minScore: 400 }] });
    const rule = ruleFor(result.rules, 'EXAM_SCORE');
    expect(rule.status).toBe('UNKNOWN');
    expect(rule.detail).toMatch(/requires a valid GATE score/i);
    expect(result.status).toBe('PROFILE_INCOMPLETE');
  });

  it('passes a sufficient score', () => {
    const result = run(
      profile({ exams: [{ id: 'g1', exam: 'GATE', score: 550, year: 2025 }] }),
      { examScores: [{ exam: 'GATE', minScore: 400 }] },
    );
    expect(ruleFor(result.rules, 'EXAM_SCORE').status).toBe('PASS');
  });

  it('fails an insufficient score', () => {
    const result = run(
      profile({ exams: [{ id: 'g1', exam: 'GATE', score: 300, year: 2025 }] }),
      { examScores: [{ exam: 'GATE', minScore: 400 }] },
    );
    expect(ruleFor(result.rules, 'EXAM_SCORE').status).toBe('FAIL');
  });

  it('rejects a score from a year the notification does not accept', () => {
    const result = run(
      profile({ exams: [{ id: 'g1', exam: 'GATE', score: 550, year: 2020 }] }),
      { examScores: [{ exam: 'GATE', minScore: 400, acceptedYears: [2025, 2026] }] },
    );
    expect(ruleFor(result.rules, 'EXAM_SCORE').status).toBe('FAIL');
  });

  it('rejects an expired score', () => {
    const result = run(
      profile({ exams: [{ id: 'g1', exam: 'GATE', score: 550, validUntil: '2025-01-01' }] }),
      { examScores: [{ exam: 'GATE', minScore: 400, validOn: '2026-08-01' }] },
    );
    expect(ruleFor(result.rules, 'EXAM_SCORE').status).toBe('FAIL');
  });

  it('accepts when any one of several attempts qualifies', () => {
    const result = run(
      profile({
        exams: [
          { id: 'a', exam: 'GATE', score: 300, year: 2024 },
          { id: 'b', exam: 'GATE', score: 600, year: 2025 },
        ],
      }),
      { examScores: [{ exam: 'GATE', minScore: 400 }] },
    );
    expect(ruleFor(result.rules, 'EXAM_SCORE').status).toBe('PASS');
  });

  it('checks rank and percentile bounds', () => {
    const byRank = run(
      profile({ exams: [{ id: 'a', exam: 'GATE', rank: 5000 }] }),
      { examScores: [{ exam: 'GATE', maxRank: 1000 }] },
    );
    const byPercentile = run(
      profile({ exams: [{ id: 'a', exam: 'CAT', percentile: 80 }] }),
      { examScores: [{ exam: 'CAT', minPercentile: 90 }] },
    );
    expect(ruleFor(byRank.rules, 'EXAM_SCORE').status).toBe('FAIL');
    expect(ruleFor(byPercentile.rules, 'EXAM_SCORE').status).toBe('FAIL');
  });
});

describe('PHYSICAL / SPEED / LICENCE / LANGUAGE', () => {
  it('applies a gender-specific height standard', () => {
    const rules: EligibilityRules = { physical: { minHeightCm: { MALE: 165, FEMALE: 150 } } };
    const male = run(profile({ gender: 'MALE', physical: { heightCm: 160 } }), rules);
    const female = run(profile({ gender: 'FEMALE', physical: { heightCm: 160 } }), rules);
    expect(ruleFor(male.rules, 'PHYSICAL').status).toBe('FAIL');
    expect(ruleFor(female.rules, 'PHYSICAL').status).toBe('PASS');
  });

  it('asks for measurements when a physical standard applies', () => {
    const result = run(profile({ gender: 'MALE' }), { physical: { minHeightCm: { MALE: 165 } } });
    expect(result.missingProfileFields).toContain('physical.heightCm');
  });

  it('checks chest expansion as a delta', () => {
    const result = run(
      profile({ gender: 'MALE', physical: { chestCm: 80, chestExpandedCm: 82 } }),
      { physical: { minChestCm: 78, minChestExpansionCm: 5 } },
    );
    expect(ruleFor(result.rules, 'PHYSICAL').status).toBe('FAIL');
  });

  it('checks typing speed', () => {
    const slow = run(profile({ speeds: { typingWpmEnglish: 25 } }), {
      speeds: { minTypingWpmEnglish: 35 },
    });
    const fast = run(profile({ speeds: { typingWpmEnglish: 40 } }), {
      speeds: { minTypingWpmEnglish: 35 },
    });
    expect(ruleFor(slow.rules, 'SPEED').status).toBe('FAIL');
    expect(ruleFor(fast.rules, 'SPEED').status).toBe('PASS');
  });

  it('asks for a typing speed with an actionable prompt', () => {
    const result = run(profile(), { speeds: { minTypingWpmEnglish: 35 } });
    const rule = ruleFor(result.rules, 'SPEED');
    expect(rule.status).toBe('UNKNOWN');
    expect(rule.detail).toMatch(/typing.*speed/i);
  });

  it('checks a driving licence and its class', () => {
    const none = run(profile({ hasDrivingLicence: false }), { requiresDrivingLicence: true });
    const wrong = run(
      profile({ hasDrivingLicence: true, drivingLicenceClasses: ['LMV'] }),
      { requiresDrivingLicence: true, drivingLicenceClasses: ['HMV'] },
    );
    const right = run(
      profile({ hasDrivingLicence: true, drivingLicenceClasses: ['HMV'] }),
      { requiresDrivingLicence: true, drivingLicenceClasses: ['HMV'] },
    );
    expect(ruleFor(none.rules, 'DRIVING_LICENCE').status).toBe('FAIL');
    expect(ruleFor(wrong.rules, 'DRIVING_LICENCE').status).toBe('FAIL');
    expect(ruleFor(right.rules, 'DRIVING_LICENCE').status).toBe('PASS');
  });

  it('checks required languages', () => {
    const result = run(profile({ languages: ['english'] }), { requiredLanguages: ['Kannada'] });
    const rule = ruleFor(result.rules, 'LANGUAGE');
    expect(rule.status).toBe('FAIL');
    expect(rule.detail).toMatch(/Kannada/);
  });

  it('checks employment-exchange registration', () => {
    const result = run(profile({ employmentExchangeRegistered: false }), {
      requiresEmploymentExchangeRegistration: true,
    });
    expect(ruleFor(result.rules, 'EMPLOYMENT_EXCHANGE').status).toBe('FAIL');
  });
});

describe('MANDATORY_SKILLS', () => {
  it('passes when all mandatory skills are held, matching through aliases', () => {
    const result = run(profile({ skills: ['React.js', 'JS'] }), {
      mandatorySkills: ['react', 'javascript'],
    });
    expect(ruleFor(result.rules, 'MANDATORY_SKILLS').status).toBe('PASS');
  });

  it('fails and names the missing skills', () => {
    const result = run(profile({ skills: ['React'] }), {
      mandatorySkills: ['react', 'aws'],
    });
    const rule = ruleFor(result.rules, 'MANDATORY_SKILLS');
    expect(rule.status).toBe('FAIL');
    expect(rule.detail).toMatch(/aws/);
  });

  it('asks for skills when none are recorded', () => {
    const result = run(profile(), { mandatorySkills: ['react'] });
    expect(result.missingProfileFields).toContain('skills');
  });
});

// ── Status precedence ────────────────────────────────────────────────────

describe('status precedence', () => {
  it('FAIL beats UNKNOWN', () => {
    const result = run(profile({ dateOfBirth: '1980-01-01' }), {
      age: { maxYears: 27, cutoffDate: '2026-08-01' },
      examScores: [{ exam: 'GATE', minScore: 400 }], // UNKNOWN
    });
    expect(result.status).toBe('NOT_ELIGIBLE');
  });

  it('UNKNOWN beats CONDITIONAL', () => {
    const result = run(profile({ domicileState: 'bihar' }), {
      domicile: { mode: 'LOCAL_RESERVATION', state: 'rajasthan' }, // CONDITIONAL
      examScores: [{ exam: 'GATE', minScore: 400 }], // UNKNOWN
    });
    expect(result.status).toBe('PROFILE_INCOMPLETE');
  });

  it('collects every blocking reason, not just the first', () => {
    const result = run(profile({ dateOfBirth: '1980-01-01', domicileState: 'bihar' }), {
      age: { maxYears: 27, cutoffDate: '2026-08-01' },
      domicile: { mode: 'STATE_ONLY', state: 'rajasthan' },
    });
    expect(result.blockingReasons.length).toBe(2);
  });

  it('de-duplicates warnings', () => {
    const result = run(profile(), { age: { maxYears: 40 } });
    expect(new Set(result.warnings).size).toBe(result.warnings.length);
  });
});

// ── Cache key ────────────────────────────────────────────────────────────

describe('eligibilityCacheKey', () => {
  it('embeds both versions so either change invalidates the entry', () => {
    expect(eligibilityCacheKey('u1', 2, 'j1', 5)).toBe('u1:2:j1:5');
    expect(eligibilityCacheKey('u1', 3, 'j1', 5)).not.toBe(eligibilityCacheKey('u1', 2, 'j1', 5));
    expect(eligibilityCacheKey('u1', 2, 'j1', 6)).not.toBe(eligibilityCacheKey('u1', 2, 'j1', 5));
  });
});

// ── End-to-end scenario from the product spec ───────────────────────────

describe('spec scenario', () => {
  const candidate = profile({
    dateOfBirth: '2002-01-15', // 24 on the 2026-08-01 cutoff
    domicileState: 'rajasthan',
    category: 'GENERAL',
    education: [degree({ degree: 'B.Tech', discipline: 'Computer Science', graduationYear: 2025, percentage: 74 })],
    experience: [role({ startDate: '2025-07-01', endDate: '2026-07-01' })],
    skills: ['React', 'JavaScript', 'SQL'],
  });

  it('is eligible for a graduate post open to all India', () => {
    const result = run(candidate, {
      age: { minYears: 18, maxYears: 27, cutoffDate: '2026-08-01' },
      education: { kind: 'QUALIFICATION', level: 'BACHELORS' },
      nationalities: ['Indian'],
      domicile: { mode: 'ANY' },
    });
    expect(result.status).toBe('ELIGIBLE');
    expect(result.blockingReasons).toEqual([]);
    const age = ruleFor(result.rules, 'AGE');
    expect(age.candidate).toContain('24 years');
  });

  it('is not eligible for a civil-engineering post and says exactly why', () => {
    const result = run(candidate, {
      education: {
        kind: 'ANY_OF',
        of: [
          { kind: 'QUALIFICATION', level: 'DIPLOMA', disciplines: ['civil'] },
          { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['civil'] },
        ],
      },
    });
    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.join(' ')).toMatch(/qualifications accepted/i);
  });

  it('needs the GATE score for a PSU graduate-engineer post', () => {
    const result = run(candidate, {
      age: { maxYears: 27, cutoffDate: '2026-08-01' },
      education: { kind: 'QUALIFICATION', level: 'BACHELORS', disciplines: ['computer-science'] },
      examScores: [{ exam: 'GATE', minScore: 400, acceptedYears: [2026] }],
    });
    expect(result.status).toBe('PROFILE_INCOMPLETE');
    expect(result.missingProfileFields).toContain('exams.GATE');
  });

  it('is not eligible for a sub-inspector post on age and physical grounds', () => {
    const result = run(
      { ...candidate, dateOfBirth: '1995-01-01', gender: 'MALE', physical: { heightCm: 160 } },
      {
        age: { maxYears: 25, cutoffDate: '2026-08-01' },
        physical: { minHeightCm: { MALE: 168 } },
      },
    );
    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.length).toBe(2);
  });
});
