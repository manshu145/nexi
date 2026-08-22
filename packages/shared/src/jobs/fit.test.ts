import { describe, expect, it } from 'vitest';
import type { CareerProfile, EligibilityRules } from '../types/jobs.js';
import { evaluateFit } from './fit.js';

const NOW = new Date('2026-08-22T00:00:00.000Z');

function profile(overrides: Partial<CareerProfile> = {}): CareerProfile {
  return {
    userId: 'u1',
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

function fit(p: CareerProfile, rules: EligibilityRules, job?: Parameters<typeof evaluateFit>[2]) {
  return evaluateFit(p, rules, job, { now: NOW });
}

describe('evaluateFit — the mandatory/preferred distinction', () => {
  it('lets a candidate apply when every mandatory skill is held', () => {
    const result = fit(profile({ skills: ['React', 'JavaScript'] }), {
      mandatorySkills: ['react', 'javascript'],
    });
    expect(result.canApply).toBe(true);
    expect(result.blockingReasons).toEqual([]);
  });

  it('blocks only on a missing MANDATORY requirement', () => {
    const result = fit(profile({ skills: ['React'] }), {
      mandatorySkills: ['react', 'aws'],
    });
    expect(result.canApply).toBe(false);
    expect(result.missing).toContain('aws');
    expect(result.blockingReasons.join(' ')).toMatch(/aws/);
  });

  it('NEVER blocks on a missing preferred skill — the core private-job rule', () => {
    const result = fit(profile({ skills: ['React'] }), {
      mandatorySkills: ['react'],
      preferredSkills: ['graphql', 'kubernetes'],
    });
    expect(result.canApply).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.preferredMissing).toEqual(['graphql', 'kubernetes']);
  });

  it('lists preferred gaps separately from mandatory gaps', () => {
    const result = fit(profile({ skills: ['React'] }), {
      mandatorySkills: ['react', 'typescript'],
      preferredSkills: ['aws'],
    });
    expect(result.missing).toContain('typescript');
    expect(result.missing).not.toContain('aws');
    expect(result.preferredMissing).toEqual(['aws']);
  });

  it('matches skills through the alias normaliser', () => {
    const result = fit(profile({ skills: ['React.js', 'JS', 'MS Excel'] }), {
      mandatorySkills: ['react', 'javascript', 'excel'],
    });
    expect(result.canApply).toBe(true);
    expect(result.score).toBeGreaterThan(80);
  });
});

describe('evaluateFit — scoring', () => {
  it('scores a perfect match at 100 and bands it STRONG', () => {
    const result = fit(
      profile({
        skills: ['React', 'TypeScript'],
        education: [{ id: 'e1', level: 'BACHELORS', completed: true }],
        experience: [{ id: 'x1', role: 'Dev', startDate: '2022-01-01', endDate: '2026-01-01', employmentType: 'FULL_TIME' }],
        preferredLocations: ['Bengaluru'],
      }),
      {
        mandatorySkills: ['react', 'typescript'],
        experience: { minTotalMonths: 24 },
        education: { kind: 'QUALIFICATION', level: 'BACHELORS' },
      },
      { locations: ['Bengaluru'], state: null, workPreference: 'ONSITE' },
    );
    expect(result.score).toBe(100);
    expect(result.band).toBe('STRONG');
  });

  it('always returns an explainable component breakdown, never a bare number', () => {
    const result = fit(profile({ skills: ['React'] }), {
      mandatorySkills: ['react', 'aws'],
      preferredSkills: ['graphql'],
    });
    expect(result.components.length).toBeGreaterThan(0);
    for (const c of result.components) {
      expect(c.label).toBeTruthy();
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
    }
  });

  it('bands scores into the documented ranges', () => {
    const strong = fit(profile({ skills: ['a', 'b', 'c', 'd', 'e'] }), {
      mandatorySkills: ['a', 'b', 'c', 'd', 'e'],
    });
    const weak = fit(profile({ skills: [] }), { mandatorySkills: ['a', 'b', 'c', 'd', 'e'] });
    expect(strong.band).toBe('STRONG');
    expect(weak.band).toBe('WEAK');
  });

  it('redistributes weight so an unstated component costs nothing', () => {
    // Only mandatory skills are stated; a full match must still score 100
    // rather than losing the weight of absent components.
    const result = fit(profile({ skills: ['React'] }), { mandatorySkills: ['react'] });
    expect(result.score).toBe(100);
  });

  it('caps experience credit at the requirement', () => {
    const exact = fit(
      profile({ experience: [{ id: 'x', role: 'Dev', startDate: '2024-01-01', endDate: '2026-01-01', employmentType: 'FULL_TIME' }] }),
      { experience: { minTotalMonths: 24 } },
    );
    const excess = fit(
      profile({ experience: [{ id: 'x', role: 'Dev', startDate: '2014-01-01', endDate: '2026-01-01', employmentType: 'FULL_TIME' }] }),
      { experience: { minTotalMonths: 24 } },
    );
    expect(exact.score).toBe(100);
    expect(excess.score).toBe(100);
  });

  it('flags an experience shortfall as blocking for a private role', () => {
    const result = fit(
      profile({ experience: [{ id: 'x', role: 'Dev', startDate: '2025-08-01', endDate: '2026-08-01', employmentType: 'FULL_TIME' }] }),
      { experience: { minTotalMonths: 60 } },
    );
    expect(result.canApply).toBe(false);
    expect(result.blockingReasons.join(' ')).toMatch(/5 year/);
  });

  it('does not double-count overlapping roles', () => {
    const result = fit(
      profile({
        experience: [
          { id: 'a', role: 'Dev', startDate: '2025-01-01', endDate: '2026-01-01', employmentType: 'FULL_TIME' },
          { id: 'b', role: 'Consultant', startDate: '2025-01-01', endDate: '2026-01-01', employmentType: 'CONTRACT' },
        ],
      }),
      { experience: { minTotalMonths: 24 } },
    );
    expect(result.canApply).toBe(false);
  });

  it('honours custom weights', () => {
    const p = profile({ skills: ['React'] });
    const rules: EligibilityRules = { mandatorySkills: ['react'], preferredSkills: ['aws'] };
    const defaultRun = evaluateFit(p, rules, undefined, { now: NOW });
    const preferredHeavy = evaluateFit(p, rules, undefined, {
      now: NOW,
      weights: { preferred: 0.9 },
    });
    // Weighting the (unmet) preferred component far more heavily must lower
    // the score.
    expect(preferredHeavy.score).toBeLessThan(defaultRun.score);
  });
});

describe('evaluateFit — location and work mode', () => {
  it('scores a remote role well for a remote-seeking candidate', () => {
    const result = fit(
      profile({ skills: ['React'], workPreference: ['REMOTE'] }),
      { mandatorySkills: ['react'] },
      { locations: [], state: null, workPreference: 'REMOTE' },
    );
    const loc = result.components.find((c) => c.component === 'location');
    expect(loc?.score).toBe(1);
  });

  it('rewards a matching preferred location', () => {
    const result = fit(
      profile({ skills: ['React'], preferredLocations: ['Jaipur'] }),
      { mandatorySkills: ['react'] },
      { locations: ['Jaipur'], state: 'rajasthan', workPreference: 'ONSITE' },
    );
    expect(result.components.find((c) => c.component === 'location')?.score).toBe(1);
  });

  it('partially credits a willing relocator for a non-preferred location', () => {
    const result = fit(
      profile({ skills: ['React'], preferredLocations: ['Jaipur'], willingToRelocate: true }),
      { mandatorySkills: ['react'] },
      { locations: ['Chennai'], state: 'tamil-nadu', workPreference: 'ONSITE' },
    );
    expect(result.components.find((c) => c.component === 'location')?.score).toBe(0.75);
  });

  it('penalises a location mismatch for a candidate unwilling to relocate', () => {
    const result = fit(
      profile({ skills: ['React'], preferredLocations: ['Jaipur'], willingToRelocate: false }),
      { mandatorySkills: ['react'] },
      { locations: ['Chennai'], state: 'tamil-nadu', workPreference: 'ONSITE' },
    );
    expect(result.components.find((c) => c.component === 'location')?.score).toBe(0.25);
  });
});

describe('evaluateFit — incomplete profiles', () => {
  it('reports the profile fields needed to improve the score', () => {
    const result = fit(profile(), {
      mandatorySkills: ['react'],
      experience: { minTotalMonths: 12 },
      education: { kind: 'QUALIFICATION', level: 'BACHELORS' },
    });
    expect(result.missingProfileFields).toContain('skills');
    expect(result.missingProfileFields).toContain('experience');
    expect(result.missingProfileFields).toContain('education');
  });

  it('handles a job with no stated requirements without dividing by zero', () => {
    const result = fit(profile(), {});
    expect(Number.isNaN(result.score)).toBe(false);
    expect(result.canApply).toBe(true);
  });
});
