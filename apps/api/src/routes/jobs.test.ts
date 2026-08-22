/**
 * Route-level tests for the Jobs feature.
 *
 * These exercise the wiring the pure-engine tests cannot: the store
 * contracts, the profileVersion/cache interaction, the consent gate, the
 * feed ordering, and the fit-vs-eligibility split by sector.
 *
 * The Hono app is driven through `app.request()` with a stubbed auth
 * middleware, so no Firebase is involved.
 */

import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Job } from '@nexigrate/shared';
import { InMemoryCareerProfileStore, profileCompleteness, emptyProfile } from '../lib/careerProfileStore.js';
import { InMemoryJobRepository, InMemorySavedJobStore } from '../lib/jobStore.js';
import { EligibilityCache } from '../lib/eligibilityCache.js';
import { makeJobsRoutes } from './jobs.js';

const USER = 'user-1';

function baseJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'j1',
    sector: 'CENTRAL_GOVT',
    organization: 'Staff Selection Commission',
    title: 'Assistant Section Officer',
    locations: ['All India'],
    state: null,
    employmentType: 'FULL_TIME',
    applicationDeadline: '2026-12-01T00:00:00.000Z',
    officialJobUrl: 'https://ssc.gov.in/notice/1',
    officialApplyUrl: 'https://ssc.gov.in/apply/1',
    eligibilityRules: {},
    sourceId: 'ssc',
    sourceTrustLevel: 'LEVEL_1',
    sourceHash: 'hash-1',
    version: 1,
    status: 'OPEN',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function harness() {
  const profiles = new InMemoryCareerProfileStore();
  const jobs = new InMemoryJobRepository();
  const saved = new InMemorySavedJobStore();
  const cache = new EligibilityCache();
  const logger = { info: () => {}, warn: () => {}, error: () => {} };

  const app = new Hono();
  // Stub the auth middleware the real app installs on /v1.
  app.use('*', async (c, next) => {
    c.set('principal' as never, { userId: USER, email: 'a@b.com' } as never);
    await next();
  });
  app.route('/', makeJobsRoutes({ profiles, jobs, saved, cache, logger }));

  return { app, profiles, jobs, saved, cache };
}

async function json(res: Response): Promise<any> {
  return res.json();
}

describe('GET /career-profile', () => {
  it('returns an empty profile with 0% completeness for a new user', async () => {
    const { app } = harness();
    const res = await app.request('/career-profile');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.profile.profileVersion).toBe(0);
    expect(body.profile.education).toEqual([]);
    expect(body.completeness.percent).toBe(0);
    expect(body.completeness.missing.length).toBeGreaterThan(0);
  });

  it('lists the highest-impact missing field first', async () => {
    const { app } = harness();
    const body = await json(await app.request('/career-profile'));
    const weights = body.completeness.missing.map((m: { weight: number }) => m.weight);
    expect(weights).toEqual([...weights].sort((a: number, b: number) => b - a));
  });
});

describe('PATCH /career-profile', () => {
  it('persists a patch and bumps profileVersion', async () => {
    const { app } = harness();
    const res = await app.request('/career-profile', {
      method: 'PATCH',
      body: JSON.stringify({ dateOfBirth: '2002-01-15' }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.profile.dateOfBirth).toBe('2002-01-15');
    expect(body.profile.profileVersion).toBe(1);
  });

  it('bumps the version on every subsequent write', async () => {
    const { app } = harness();
    await app.request('/career-profile', { method: 'PATCH', body: JSON.stringify({ dateOfBirth: '2002-01-15' }) });
    const second = await json(
      await app.request('/career-profile', { method: 'PATCH', body: JSON.stringify({ nationality: 'Indian' }) }),
    );
    expect(second.profile.profileVersion).toBe(2);
    // Earlier fields survive the merge.
    expect(second.profile.dateOfBirth).toBe('2002-01-15');
  });

  it('rejects a malformed date of birth', async () => {
    const { app } = harness();
    const res = await app.request('/career-profile', {
      method: 'PATCH',
      body: JSON.stringify({ dateOfBirth: '15-01-2002' }),
    });
    expect(res.status).toBe(400);
  });

  it('normalises degree and discipline to canonical slugs on write', async () => {
    const { app } = harness();
    const body = await json(
      await app.request('/career-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          education: [{ level: 'BACHELORS', degree: 'B.E.', discipline: 'Computer Science & Engineering', completed: true }],
        }),
      }),
    );
    expect(body.profile.education[0].degreeFamily).toBe('BE_BTECH');
    expect(body.profile.education[0].disciplineSlug).toBe('computer-science');
    expect(body.profile.education[0].id).toBeTruthy();
  });

  it('normalises skills through the alias table', async () => {
    const { app } = harness();
    const body = await json(
      await app.request('/career-profile', {
        method: 'PATCH',
        body: JSON.stringify({ skills: ['React.js', 'JS', 'MS Excel'] }),
      }),
    );
    expect(body.profile.skills).toEqual(['react', 'javascript', 'excel']);
  });

  it('replaces array fields wholesale so a row can be deleted', async () => {
    const { app } = harness();
    await app.request('/career-profile', {
      method: 'PATCH',
      body: JSON.stringify({ skills: ['react', 'aws'] }),
    });
    const body = await json(
      await app.request('/career-profile', { method: 'PATCH', body: JSON.stringify({ skills: ['react'] }) }),
    );
    expect(body.profile.skills).toEqual(['react']);
  });

  describe('sensitive-data consent gate', () => {
    it('refuses category without consent', async () => {
      const { app } = harness();
      const res = await app.request('/career-profile', {
        method: 'PATCH',
        body: JSON.stringify({ category: 'SC' }),
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toMatch(/consent/i);
    });

    it('accepts category when consent is granted in the same request', async () => {
      const { app } = harness();
      const res = await app.request('/career-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          category: 'SC',
          sensitiveDataConsent: { granted: true, purpose: 'eligibility matching' },
        }),
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.profile.category).toBe('SC');
      // The server stamps the consent timestamp.
      expect(body.profile.sensitiveDataConsent.grantedAt).toBeTruthy();
    });

    it('accepts category on later writes once consent is on record', async () => {
      const { app } = harness();
      await app.request('/career-profile', {
        method: 'PATCH',
        body: JSON.stringify({ sensitiveDataConsent: { granted: true, purpose: 'eligibility matching' } }),
      });
      const res = await app.request('/career-profile', {
        method: 'PATCH',
        body: JSON.stringify({ category: 'ST' }),
      });
      expect(res.status).toBe(200);
      expect((await json(res)).profile.category).toBe('ST');
    });

    it('does not gate non-sensitive fields', async () => {
      const { app } = harness();
      const res = await app.request('/career-profile', {
        method: 'PATCH',
        body: JSON.stringify({ domicileState: 'rajasthan' }),
      });
      expect(res.status).toBe(200);
    });
  });
});

describe('DELETE /career-profile', () => {
  it('erases the stored profile', async () => {
    const { app, profiles } = harness();
    await app.request('/career-profile', { method: 'PATCH', body: JSON.stringify({ dateOfBirth: '2002-01-15' }) });
    expect(await profiles.get(USER)).not.toBeNull();
    const res = await app.request('/career-profile', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await profiles.get(USER)).toBeNull();
  });
});

describe('GET /jobs feed', () => {
  beforeEach(() => {});

  it('returns cards with an eligibility verdict attached', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob()]);
    const body = await json(await app.request('/'));
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].eligibility.status).toBeTruthy();
    expect(body.jobs[0].officialJobUrl).toBe('https://ssc.gov.in/notice/1');
  });

  it('omits the verbose per-rule table from list responses', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob()]);
    const body = await json(await app.request('/'));
    expect(body.jobs[0].eligibility.rules).toBeUndefined();
  });

  it('computes daysLeft from the deadline', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob({ applicationDeadline: '2099-01-01T00:00:00.000Z' })]);
    const body = await json(await app.request('/'));
    expect(body.jobs[0].daysLeft).toBeGreaterThan(0);
  });

  it('reports null daysLeft when no deadline is published', async () => {
    const { app, jobs } = harness();
    const j = baseJob();
    delete j.applicationDeadline;
    jobs.seed([j]);
    const body = await json(await app.request('/'));
    expect(body.jobs[0].daysLeft).toBeNull();
  });

  it('excludes closed vacancies from the feed', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob({ jobId: 'open', status: 'OPEN' }), baseJob({ jobId: 'closed', status: 'CLOSED' })]);
    const body = await json(await app.request('/'));
    expect(body.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['open']);
  });

  it('filters by sector', async () => {
    const { app, jobs } = harness();
    jobs.seed([
      baseJob({ jobId: 'govt', sector: 'CENTRAL_GOVT' }),
      baseJob({ jobId: 'priv', sector: 'PRIVATE' }),
    ]);
    const body = await json(await app.request('/?sector=PRIVATE'));
    expect(body.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['priv']);
  });

  it('filters to eligible-only on request', async () => {
    const { app, jobs, profiles } = harness();
    await profiles.update(USER, { dateOfBirth: '2002-01-15' });
    jobs.seed([
      baseJob({ jobId: 'ok', eligibilityRules: { age: { maxYears: 30, cutoffDate: '2026-08-01' } } }),
      baseJob({ jobId: 'too-old', eligibilityRules: { age: { maxYears: 20, cutoffDate: '2026-08-01' } } }),
    ]);
    const all = await json(await app.request('/'));
    const filtered = await json(await app.request('/?eligibleOnly=true'));
    expect(all.jobs).toHaveLength(2);
    expect(filtered.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['ok']);
  });

  it('searches title and organization', async () => {
    const { app, jobs } = harness();
    jobs.seed([
      baseJob({ jobId: 'a', title: 'Junior Engineer' }),
      baseJob({ jobId: 'b', title: 'Assistant Section Officer' }),
    ]);
    const body = await json(await app.request('/?search=engineer'));
    expect(body.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['a']);
  });
});

describe('GET /for-you', () => {
  it('orders actionable vacancies before barred ones', async () => {
    const { app, jobs, profiles } = harness();
    await profiles.update(USER, { dateOfBirth: '2002-01-15' });
    jobs.seed([
      baseJob({
        jobId: 'barred',
        applicationDeadline: '2026-09-01T00:00:00.000Z',
        eligibilityRules: { age: { maxYears: 20, cutoffDate: '2026-08-01' } },
      }),
      baseJob({
        jobId: 'eligible',
        applicationDeadline: '2026-11-01T00:00:00.000Z',
        eligibilityRules: { age: { maxYears: 30, cutoffDate: '2026-08-01' } },
      }),
    ]);
    const body = await json(await app.request('/for-you'));
    // 'eligible' has a LATER deadline but must still rank first.
    expect(body.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['eligible', 'barred']);
  });

  it('returns the dashboard summary counts', async () => {
    const { app, jobs, profiles } = harness();
    await profiles.update(USER, { dateOfBirth: '2002-01-15' });
    jobs.seed([
      baseJob({ jobId: 'a', eligibilityRules: { age: { maxYears: 30, cutoffDate: '2026-08-01' } } }),
      baseJob({ jobId: 'b', eligibilityRules: { age: { maxYears: 20, cutoffDate: '2026-08-01' } } }),
      baseJob({ jobId: 'c', eligibilityRules: { examScores: [{ exam: 'GATE', minScore: 400 }] } }),
    ]);
    const body = await json(await app.request('/for-you'));
    expect(body.summary.total).toBe(3);
    expect(body.summary.eligible).toBe(1);
    expect(body.summary.notEligible).toBe(1);
    expect(body.summary.needsProfile).toBe(1);
  });

  it('hides jobs the user marked not-interested', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob({ jobId: 'a' }), baseJob({ jobId: 'b' })]);
    await app.request('/a/application-status', {
      method: 'POST',
      body: JSON.stringify({ status: 'NOT_INTERESTED' }),
    });
    const body = await json(await app.request('/for-you'));
    expect(body.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['b']);
  });
});

describe('sector drives eligibility vs fit', () => {
  it('attaches a fit score for a private role but not a statutory one', async () => {
    const { app, jobs, profiles } = harness();
    await profiles.update(USER, { skills: ['React'] });
    jobs.seed([
      baseJob({ jobId: 'govt', sector: 'CENTRAL_GOVT', eligibilityRules: { mandatorySkills: ['react'] } }),
      baseJob({ jobId: 'priv', sector: 'PRIVATE', eligibilityRules: { mandatorySkills: ['react'] } }),
    ]);
    const body = await json(await app.request('/'));
    const govt = body.jobs.find((j: { jobId: string }) => j.jobId === 'govt');
    const priv = body.jobs.find((j: { jobId: string }) => j.jobId === 'priv');
    expect(govt.fit).toBeUndefined();
    expect(priv.fit).toBeDefined();
    expect(priv.fit.score).toBeGreaterThan(0);
  });

  it('does not block a private application for a missing preferred skill', async () => {
    const { app, jobs, profiles } = harness();
    await profiles.update(USER, { skills: ['React'] });
    jobs.seed([
      baseJob({
        jobId: 'priv',
        sector: 'PRIVATE',
        eligibilityRules: { mandatorySkills: ['react'], preferredSkills: ['kubernetes'] },
      }),
    ]);
    const body = await json(await app.request('/priv'));
    expect(body.fit.canApply).toBe(true);
    expect(body.fit.preferredMissing).toEqual(['kubernetes']);
  });
});

describe('GET /:jobId and /:jobId/eligibility', () => {
  it('returns the full per-rule table on the detail endpoint', async () => {
    const { app, jobs, profiles } = harness();
    await profiles.update(USER, { dateOfBirth: '2002-01-15' });
    jobs.seed([baseJob({ eligibilityRules: { age: { minYears: 18, maxYears: 27, cutoffDate: '2026-08-01' } } })]);
    const body = await json(await app.request('/j1/eligibility'));
    expect(body.eligibility.rules.length).toBeGreaterThan(0);
    const age = body.eligibility.rules.find((r: { rule: string }) => r.rule === 'AGE');
    expect(age.status).toBe('PASS');
    expect(age.required).toContain('2026-08-01');
    expect(age.candidate).toContain('24 years');
  });

  it('surfaces provenance so the UI can label trust', async () => {
    const { app, jobs } = harness();
    jobs.seed([
      baseJob({
        sourceTrustLevel: 'LEVEL_4',
        sourceDocuments: [{ kind: 'NOTIFICATION', url: 'https://example.com/n.pdf' }],
      }),
    ]);
    const body = await json(await app.request('/j1/eligibility'));
    expect(body.sourceTrustLevel).toBe('LEVEL_4');
    expect(body.sourceDocuments).toHaveLength(1);
  });

  it('404s for an unknown job', async () => {
    const { app } = harness();
    expect((await app.request('/nope')).status).toBe(404);
    expect((await app.request('/nope/eligibility')).status).toBe(404);
  });

  it('does not capture static routes as a jobId', async () => {
    const { app } = harness();
    // If ordering were wrong these would 404 as "job not found".
    expect((await app.request('/saved')).status).toBe(200);
    expect((await app.request('/for-you')).status).toBe(200);
    expect((await app.request('/career-profile')).status).toBe(200);
  });
});

describe('save + application tracking', () => {
  it('saves and lists a job', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob()]);
    const saveRes = await app.request('/j1/save', { method: 'POST' });
    expect(saveRes.status).toBe(200);
    const body = await json(await app.request('/saved'));
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].applicationStatus).toBe('SAVED');
  });

  it('unsaves a job', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob()]);
    await app.request('/j1/save', { method: 'POST' });
    await app.request('/j1/save', { method: 'DELETE' });
    expect((await json(await app.request('/saved'))).jobs).toHaveLength(0);
  });

  it('advances the funnel and stamps appliedAt once', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob()]);
    const applied = await json(
      await app.request('/j1/application-status', { method: 'POST', body: JSON.stringify({ status: 'APPLIED' }) }),
    );
    expect(applied.record.appliedAt).toBeTruthy();
    const firstAppliedAt = applied.record.appliedAt;

    const later = await json(
      await app.request('/j1/application-status', {
        method: 'POST',
        body: JSON.stringify({ status: 'EXAM_SCHEDULED' }),
      }),
    );
    // appliedAt must remain stable through later stages.
    expect(later.record.appliedAt).toBe(firstAppliedAt);
    expect(later.record.status).toBe('EXAM_SCHEDULED');
  });

  it('rejects an unknown status', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob()]);
    const res = await app.request('/j1/application-status', {
      method: 'POST',
      body: JSON.stringify({ status: 'HIRED_MAYBE' }),
    });
    expect(res.status).toBe(400);
  });

  it('filters the tracker by status', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob({ jobId: 'a' }), baseJob({ jobId: 'b' })]);
    await app.request('/a/save', { method: 'POST' });
    await app.request('/b/application-status', { method: 'POST', body: JSON.stringify({ status: 'APPLIED' }) });
    const body = await json(await app.request('/saved?status=APPLIED'));
    expect(body.jobs.map((j: { jobId: string }) => j.jobId)).toEqual(['b']);
  });

  it('skips tracker rows whose job has been removed', async () => {
    const { app, jobs, saved } = harness();
    jobs.seed([baseJob()]);
    await app.request('/j1/save', { method: 'POST' });
    await saved.setStatus(USER, 'deleted-job', 'APPLIED');
    const body = await json(await app.request('/saved'));
    expect(body.jobs).toHaveLength(1);
  });
});

describe('eligibility cache', () => {
  it('serves a repeat request from cache', async () => {
    const { app, jobs, cache } = harness();
    jobs.seed([baseJob()]);
    await app.request('/j1/eligibility');
    const afterFirst = cache.stats();
    await app.request('/j1/eligibility');
    const afterSecond = cache.stats();
    expect(afterSecond.hits).toBe(afterFirst.hits + 1);
  });

  it('does not serve a stale verdict after a profile edit', async () => {
    const { app, jobs } = harness();
    jobs.seed([baseJob({ eligibilityRules: { age: { maxYears: 27, cutoffDate: '2026-08-01' } } })]);

    // No DOB → we ask rather than assert.
    const before = await json(await app.request('/j1/eligibility'));
    expect(before.eligibility.status).toBe('PROFILE_INCOMPLETE');

    // Supplying the DOB bumps profileVersion, which changes the cache key.
    await app.request('/career-profile', {
      method: 'PATCH',
      body: JSON.stringify({ dateOfBirth: '2002-01-15' }),
    });
    const after = await json(await app.request('/j1/eligibility'));
    expect(after.eligibility.status).toBe('ELIGIBLE');
  });

  it('does not serve a stale verdict after a job version bump', async () => {
    const { app, jobs, profiles } = harness();
    await profiles.update(USER, { dateOfBirth: '2002-01-15' });
    jobs.seed([baseJob({ eligibilityRules: { age: { maxYears: 30, cutoffDate: '2026-08-01' } } })]);
    expect((await json(await app.request('/j1/eligibility'))).eligibility.status).toBe('ELIGIBLE');

    // A corrigendum tightens the age bar.
    await jobs.upsert(
      baseJob({
        sourceHash: 'hash-2',
        eligibilityRules: { age: { maxYears: 20, cutoffDate: '2026-08-01' } },
      }),
    );
    const after = await json(await app.request('/j1/eligibility'));
    expect(after.jobVersion).toBe(2);
    expect(after.eligibility.status).toBe('NOT_ELIGIBLE');
  });
});

describe('job upsert semantics', () => {
  it('creates on first sight', async () => {
    const { jobs } = harness();
    const r = await jobs.upsert(baseJob());
    expect(r).toEqual({ created: true, versionBumped: false });
  });

  it('does NOT bump the version when the source hash is unchanged', async () => {
    const { jobs } = harness();
    await jobs.upsert(baseJob());
    const r = await jobs.upsert(baseJob({ lastSeenAt: '2026-08-22T00:00:00.000Z' }));
    expect(r).toEqual({ created: false, versionBumped: false });
    expect((await jobs.getById('j1'))!.version).toBe(1);
  });

  it('bumps the version when content changes', async () => {
    const { jobs } = harness();
    await jobs.upsert(baseJob());
    const r = await jobs.upsert(baseJob({ sourceHash: 'hash-2', title: 'Revised title' }));
    expect(r.versionBumped).toBe(true);
    const stored = await jobs.getById('j1');
    expect(stored!.version).toBe(2);
    expect(stored!.title).toBe('Revised title');
    // Original creation timestamp is preserved across versions.
    expect(stored!.createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('refuses to let a lower-trust source overwrite a higher-trust record', async () => {
    const { jobs } = harness();
    await jobs.upsert(baseJob({ sourceTrustLevel: 'LEVEL_1', title: 'Official title' }));
    const r = await jobs.upsert(
      baseJob({
        sourceTrustLevel: 'LEVEL_4',
        sourceHash: 'hash-scraped',
        title: 'Scraped clickbait title',
        eligibilityRules: { age: { maxYears: 99 } },
      }),
    );
    expect(r.versionBumped).toBe(false);
    const stored = await jobs.getById('j1');
    expect(stored!.title).toBe('Official title');
    expect(stored!.eligibilityRules.age).toBeUndefined();
  });

  it('allows an equal-or-higher trust source to update', async () => {
    const { jobs } = harness();
    await jobs.upsert(baseJob({ sourceTrustLevel: 'LEVEL_2' }));
    const r = await jobs.upsert(
      baseJob({ sourceTrustLevel: 'LEVEL_1', sourceHash: 'hash-official', title: 'Official' }),
    );
    expect(r.versionBumped).toBe(true);
    expect((await jobs.getById('j1'))!.title).toBe('Official');
  });
});

describe('profileCompleteness', () => {
  it('reaches 100% for a fully populated profile', () => {
    const full = {
      ...emptyProfile(USER),
      dateOfBirth: '2002-01-15',
      nationality: 'Indian',
      domicileState: 'rajasthan',
      category: 'GENERAL' as const,
      education: [{ id: 'e', level: 'BACHELORS' as const, completed: true, percentage: 74 }],
      experience: [{ id: 'x', role: 'Dev', startDate: '2024-01-01', employmentType: 'FULL_TIME' as const }],
      skills: ['react'],
      preferredLocations: ['Jaipur'],
    };
    expect(profileCompleteness(full).percent).toBe(100);
    expect(profileCompleteness(full).missing).toEqual([]);
  });

  it('counts marks separately from the education record itself', () => {
    const withoutMarks = {
      ...emptyProfile(USER),
      education: [{ id: 'e', level: 'BACHELORS' as const, completed: true }],
    };
    const keys = profileCompleteness(withoutMarks).missing.map((m) => m.key);
    expect(keys).toContain('education.percentage');
    expect(keys).not.toContain('education');
  });
});
