/**
 * Private-sector fit scoring.
 *
 * Private job descriptions are written loosely: "required", "preferred",
 * "good to have", "bonus points for". Treating all of that as statutory
 * criteria would mark almost everyone NOT_ELIGIBLE for a role they'd
 * genuinely get shortlisted for.
 *
 * So private roles produce TWO independent answers:
 *
 *   canApply  — do you clear the MANDATORY bar? (a real yes/no)
 *   score     — how well do you fit, 0-100, with every component shown
 *
 * A missing *preferred* skill lowers the score and is listed separately. It
 * NEVER makes `canApply` false. And the score is never presented without its
 * breakdown, because "72%" on its own is not actionable.
 */

import type {
  CareerProfile,
  EligibilityRules,
  FitBand,
  FitComponent,
  FitResult,
  FitWeights,
  Job,
} from '../types/jobs.js';
import { DEFAULT_FIT_WEIGHTS, QUALIFICATION_RANK } from '../types/jobs.js';
import { normaliseSkills } from './normalise.js';

/** Total experience in months, merging overlapping roles. */
function totalExperienceMonths(profile: CareerProfile, nowIso: string): number {
  const spans = profile.experience
    .map((r) => ({ start: r.startDate, end: r.current || !r.endDate ? nowIso : r.endDate }))
    .filter((s) => s.start && s.end && s.end > s.start)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (spans.length === 0) return 0;

  const merged: Array<{ start: string; end: string }> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      if (span.end > last.end) last.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }
  return merged.reduce((sum, s) => {
    const a = new Date(s.start);
    const b = new Date(s.end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return sum;
    let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
    if (b.getUTCDate() < a.getUTCDate()) months -= 1;
    return sum + Math.max(0, months);
  }, 0);
}

function bandFor(score: number): FitBand {
  if (score >= 80) return 'STRONG';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'POSSIBLE';
  return 'WEAK';
}

export interface FitOptions {
  now?: Date;
  /** Override component weights. Normalised internally if they don't sum to 1. */
  weights?: Partial<FitWeights>;
}

/**
 * Score a candidate against a private role.
 *
 * Components that the job says nothing about are dropped and their weight is
 * redistributed, so a JD with no location preference doesn't silently cost
 * every candidate 5 points.
 */
export function evaluateFit(
  profile: CareerProfile,
  rules: EligibilityRules,
  job: Pick<Job, 'workPreference' | 'locations' | 'state'> | undefined,
  options: FitOptions = {},
): FitResult {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const weights: FitWeights = { ...DEFAULT_FIT_WEIGHTS, ...(options.weights ?? {}) };

  const mandatory = normaliseSkills(rules.mandatorySkills);
  const preferred = normaliseSkills(rules.preferredSkills);
  const held = normaliseSkills(profile.skills);

  const matched: string[] = [];
  const missing: string[] = [];
  const preferredMissing: string[] = [];
  const blockingReasons: string[] = [];
  const missingProfileFields: string[] = [];

  const components: FitComponent[] = [];

  // ── Mandatory requirements ────────────────────────────────────────────
  let mandatoryScore = 1;
  if (mandatory.length > 0) {
    if (held.length === 0) {
      missingProfileFields.push('skills');
      mandatoryScore = 0;
    } else {
      const hits = mandatory.filter((s) => held.includes(s));
      const misses = mandatory.filter((s) => !held.includes(s));
      matched.push(...hits);
      missing.push(...misses);
      mandatoryScore = mandatory.length === 0 ? 1 : hits.length / mandatory.length;
      if (misses.length > 0) {
        blockingReasons.push(`Missing mandatory requirement: ${misses.join(', ')}`);
      }
    }
    components.push({
      component: 'mandatory',
      label: 'Mandatory requirements',
      score: mandatoryScore,
      weight: weights.mandatory,
      detail:
        mandatory.length > 0
          ? `${matched.length}/${mandatory.length} mandatory requirements met`
          : undefined,
    });
  }

  // ── Relevant skills breadth (mandatory + preferred pool) ─────────────
  const skillPool = [...new Set([...mandatory, ...preferred])];
  if (skillPool.length > 0) {
    const hits = skillPool.filter((s) => held.includes(s));
    components.push({
      component: 'skills',
      label: 'Skills overlap',
      score: hits.length / skillPool.length,
      weight: weights.skills,
      detail: `${hits.length}/${skillPool.length} listed skills matched`,
    });
  }

  // ── Experience ────────────────────────────────────────────────────────
  const expRule = rules.experience;
  if (expRule?.minTotalMonths !== undefined || expRule?.minRelevantMonths !== undefined) {
    const needed = expRule.minTotalMonths ?? expRule.minRelevantMonths ?? 0;
    const have = totalExperienceMonths(profile, nowIso);
    if (profile.experience.length === 0) missingProfileFields.push('experience');
    // Cap at 1 — exceeding the requirement is fine but not extra credit.
    const score = needed <= 0 ? 1 : Math.min(1, have / needed);
    components.push({
      component: 'experience',
      label: 'Experience',
      score,
      weight: weights.experience,
      detail: `${Math.floor(have / 12)}y ${have % 12}m of ${Math.floor(needed / 12)}y ${needed % 12}m required`,
    });
    // Mandatory experience shortfall genuinely blocks a private application.
    if (needed > 0 && have < needed) {
      blockingReasons.push(
        `Experience required: ${Math.floor(needed / 12)} year(s); you have ${Math.floor(have / 12)} year(s)`,
      );
    }
  }

  // ── Education ─────────────────────────────────────────────────────────
  const eduRule = rules.education;
  if (eduRule && eduRule.kind === 'QUALIFICATION') {
    const need = QUALIFICATION_RANK[eduRule.level] ?? 0;
    const best = profile.education.reduce(
      (max, e) => Math.max(max, QUALIFICATION_RANK[e.level] ?? 0),
      0,
    );
    if (profile.education.length === 0) missingProfileFields.push('education');
    const score = best === 0 ? 0 : best >= need ? 1 : 0.5;
    components.push({
      component: 'education',
      label: 'Education',
      score,
      weight: weights.education,
    });
  }

  // ── Location / work mode ──────────────────────────────────────────────
  if (job && (job.workPreference || (job.locations?.length ?? 0) > 0)) {
    let score = 0.5; // neutral when we can't tell
    const prefs = profile.workPreference ?? [];
    if (job.workPreference === 'REMOTE') {
      score = prefs.includes('REMOTE') || prefs.length === 0 ? 1 : 0.75;
    } else if (job.locations?.length) {
      const wanted = (profile.preferredLocations ?? []).map((l) => l.toLowerCase());
      const jobLocs = job.locations.map((l) => l.toLowerCase());
      const overlap = wanted.some((w) => jobLocs.some((j) => j.includes(w) || w.includes(j)));
      if (overlap) score = 1;
      else if (profile.willingToRelocate) score = 0.75;
      else if (wanted.length === 0) score = 0.5;
      else score = 0.25;
    }
    components.push({
      component: 'location',
      label: 'Location / work mode',
      score,
      weight: weights.location,
    });
  }

  // ── Preferred-only extras ─────────────────────────────────────────────
  if (preferred.length > 0) {
    const hits = preferred.filter((s) => held.includes(s));
    const misses = preferred.filter((s) => !held.includes(s));
    preferredMissing.push(...misses);
    components.push({
      component: 'preferred',
      label: 'Preferred qualifications',
      score: hits.length / preferred.length,
      weight: weights.preferred,
      detail: misses.length > 0 ? `Preferred but missing: ${misses.join(', ')}` : 'All preferred items matched',
    });
  }

  // ── Weighted total, renormalised over present components ─────────────
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const raw =
    totalWeight > 0
      ? components.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight
      : 0;
  const score = Math.round(raw * 100);

  return {
    canApply: blockingReasons.length === 0,
    score,
    band: bandFor(score),
    matched,
    missing,
    preferredMissing,
    components,
    blockingReasons,
    missingProfileFields: [...new Set(missingProfileFields)],
  };
}
