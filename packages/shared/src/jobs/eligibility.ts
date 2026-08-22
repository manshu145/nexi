/**
 * Deterministic eligibility rule engine.
 *
 * This is the heart of the Jobs feature and it is intentionally boring: a
 * pure function from (profile, rules) to a verdict plus a per-rule
 * explanation. No I/O, no LLM, no clock dependency beyond an injectable
 * `now`. That means:
 *
 *   - The same inputs always yield the same verdict (auditable).
 *   - Evaluating a feed of 300 jobs costs microseconds, not API calls.
 *   - The verdict can be recomputed years later and still be defensible.
 *
 * ── Why AI is not in this path ────────────────────────────────────────────
 * An LLM may READ a notification and propose an `EligibilityRules` object at
 * ingestion time (once per job version). It must never be asked "is this
 * person eligible?", because that answer would be unexplainable,
 * irreproducible, and would cost money per user per job.
 *
 * ── The four non-obvious statuses ────────────────────────────────────────
 * A naive engine returns eligible/not-eligible and is wrong constantly. The
 * interesting cases are the ones where we must NOT assert:
 *
 *   PROFILE_INCOMPLETE      we don't know something about the candidate
 *   CONDITIONALLY_ELIGIBLE  we don't know something about the world
 *                           (e.g. "equivalent qualifications accepted
 *                           subject to authority approval")
 *   MANUAL_REVIEW           we don't trust our own reading of the document
 *
 * Precedence is deliberate: a hard FAIL always wins (telling someone they
 * are eligible when an age bar excludes them is the worst outcome), then
 * MANUAL_REVIEW, then PROFILE_INCOMPLETE, then CONDITIONAL, then ELIGIBLE.
 */

import type {
  CandidateFlag,
  CareerProfile,
  EducationRecord,
  EducationRule,
  EligibilityResult,
  EligibilityRules,
  EligibilityStatus,
  ExperienceRecord,
  Job,
  QualificationLevel,
  RuleEvaluation,
  RuleStatus,
  SourceEvidence,
} from '../types/jobs.js';
import { QUALIFICATION_RANK, isStatutorySector } from '../types/jobs.js';
import { ageOn, exceedsYears, formatAge, meetsMinimumYears, resolveRelaxation } from './age.js';
import { effectivePercentage, normaliseDegree, normaliseDiscipline, normaliseSkills } from './normalise.js';

// ─────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────

export interface EvaluateOptions {
  /** Injectable clock for deterministic tests. Defaults to now. */
  now?: Date;
  /**
   * Fallback cutoff date (ISO) when the notification omits one. Defaults to
   * the application deadline, then `now`. An omitted cutoff is recorded as a
   * warning because the resulting age verdict is an inference, not a quote.
   */
  ageCutoffFallback?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────

function evaluation(
  rule: RuleEvaluation['rule'],
  label: string,
  required: string,
  candidate: string,
  status: RuleStatus,
  extra?: { detail?: string; missingFields?: string[]; evidence?: SourceEvidence },
): RuleEvaluation {
  const out: RuleEvaluation = { rule, label, required, candidate, status };
  if (extra?.detail) out.detail = extra.detail;
  if (extra?.missingFields?.length) out.missingFields = extra.missingFields;
  if (extra?.evidence) out.evidence = extra.evidence;
  return out;
}

function notApplicable(rule: RuleEvaluation['rule'], label: string): RuleEvaluation {
  return evaluation(rule, label, 'No stated requirement', '—', 'NOT_APPLICABLE');
}

/** Inclusive month count between two ISO dates; 0 when unparseable/negative. */
function monthsBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end <= start) return 0;
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  // Only count a trailing partial month once the day-of-month is reached.
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function humanMonths(months: number): string {
  if (months <= 0) return 'None';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} year${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} month${m === 1 ? '' : 's'}`);
  return parts.join(' ');
}

function levelLabel(level: QualificationLevel): string {
  const labels: Record<QualificationLevel, string> = {
    CLASS_8: '8th pass',
    CLASS_10: '10th pass',
    CLASS_12: '12th pass',
    ITI: 'ITI',
    DIPLOMA: 'Diploma',
    BACHELORS: "Bachelor's degree",
    MASTERS: "Master's degree",
    PROFESSIONAL: 'Professional degree',
    PHD: 'PhD',
    OTHER: 'Other qualification',
  };
  return labels[level];
}

/** Candidate relaxation tokens: category plus any independent flags. */
function relaxationTokens(profile: CareerProfile): string[] {
  const tokens: string[] = [];
  if (profile.category) tokens.push(profile.category);
  for (const flag of profile.flags ?? []) tokens.push(flag);
  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────
// AGE
// ─────────────────────────────────────────────────────────────────────────

function evaluateAge(
  profile: CareerProfile,
  rules: EligibilityRules,
  opts: Required<Pick<EvaluateOptions, 'now'>> & { fallbackCutoff?: string },
  warnings: string[],
): RuleEvaluation {
  const rule = rules.age;
  if (!rule || (rule.minYears === undefined && rule.maxYears === undefined)) {
    return notApplicable('AGE', 'Age');
  }

  const cutoff = rule.cutoffDate ?? opts.fallbackCutoff ?? opts.now.toISOString().slice(0, 10);
  if (!rule.cutoffDate) {
    warnings.push(
      'The notification did not state an age cutoff date; age was computed against the application deadline. Verify against the official notification.',
    );
  }

  const relax = resolveRelaxation(rule.relaxationYears, relaxationTokens(profile));
  const effectiveMax = rule.maxYears !== undefined ? rule.maxYears + relax.years : undefined;

  const requiredParts: string[] = [];
  if (rule.minYears !== undefined) requiredParts.push(`min ${rule.minYears}`);
  if (rule.maxYears !== undefined) requiredParts.push(`max ${rule.maxYears}`);
  let required = `${requiredParts.join(', ')} years as on ${cutoff}`;
  if (relax.years > 0 && effectiveMax !== undefined) {
    required += ` (relaxed max ${effectiveMax} for ${relax.appliedTokens.join(' + ')})`;
  }

  if (!profile.dateOfBirth) {
    return evaluation('AGE', 'Age', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['dateOfBirth'],
      detail: 'Add your date of birth to check the age criterion.',
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }

  const age = ageOn(profile.dateOfBirth, cutoff);
  if (!age) {
    return evaluation('AGE', 'Age', required, profile.dateOfBirth, 'UNKNOWN', {
      missingFields: ['dateOfBirth'],
      detail: 'Date of birth could not be read. Please re-enter it as YYYY-MM-DD.',
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }

  const candidate = `${formatAge(age)} on ${cutoff}`;

  if (rule.minYears !== undefined && !meetsMinimumYears(age, rule.minYears)) {
    return evaluation('AGE', 'Age', required, candidate, 'FAIL', {
      detail: `Minimum age is ${rule.minYears} years as on ${cutoff}; you are ${formatAge(age)}.`,
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }

  if (effectiveMax !== undefined && exceedsYears(age, effectiveMax)) {
    return evaluation('AGE', 'Age', required, candidate, 'FAIL', {
      detail: `Maximum age is ${effectiveMax} years as on ${cutoff}; your age on that date is ${formatAge(age)}.`,
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }

  // Within limits, but flag when we could not confidently model relaxation.
  if (rule.relaxationComplex || relax.ambiguous) {
    return evaluation('AGE', 'Age', required, candidate, 'CONDITIONAL', {
      detail: rule.relaxationComplex
        ? 'This notification has complex age-relaxation rules. You appear within limits, but confirm the exact relaxation in the official notification.'
        : `More than one age relaxation may apply (${relax.appliedTokens.join(', ')}). The notification does not state whether they combine, so confirm before applying.`,
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }

  return evaluation('AGE', 'Age', required, candidate, 'PASS', {
    ...(rule.evidence ? { evidence: rule.evidence } : {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// EDUCATION
// ─────────────────────────────────────────────────────────────────────────

interface EduOutcome {
  status: RuleStatus;
  required: string;
  candidate: string;
  detail?: string;
  missingFields: string[];
  evidence?: SourceEvidence;
}

/** Does a record satisfy the level constraint of a QUALIFICATION rule? */
function levelSatisfies(
  record: EducationRecord,
  level: QualificationLevel,
  orHigher: boolean | undefined,
): boolean {
  if (record.level === level) return true;
  if (!orHigher) return false;
  const held = QUALIFICATION_RANK[record.level] ?? 0;
  const need = QUALIFICATION_RANK[level] ?? 0;
  // OTHER has rank 0 and must never satisfy an "or higher" comparison.
  if (held === 0 || need === 0) return false;
  return held >= need;
}

function evaluateEducationRule(
  node: EducationRule,
  profile: CareerProfile,
): EduOutcome {
  switch (node.kind) {
    case 'QUALIFICATION': {
      const parts: string[] = [levelLabel(node.level) + (node.orHigher ? ' or higher' : '')];
      if (node.disciplines?.length) parts.push(`in ${node.disciplines.join(' / ')}`);
      if (node.minPercentage !== undefined) parts.push(`with min ${node.minPercentage}%`);
      if (node.minCgpa !== undefined) parts.push(`with min CGPA ${node.minCgpa}`);
      const required = parts.join(' ');

      if (profile.education.length === 0) {
        return {
          status: 'UNKNOWN',
          required,
          candidate: 'No qualifications added',
          missingFields: ['education'],
          detail: 'Add your qualifications to check this requirement.',
          ...(node.evidence ? { evidence: node.evidence } : {}),
        };
      }

      const atLevel = profile.education.filter((e) => levelSatisfies(e, node.level, node.orHigher));
      if (atLevel.length === 0) {
        const held = profile.education.map((e) => e.degree || levelLabel(e.level)).join(', ');
        return {
          status: 'FAIL',
          required,
          candidate: held || 'None',
          detail: `This post requires ${required}. Your highest relevant qualification does not meet that level.`,
          missingFields: [],
          ...(node.evidence ? { evidence: node.evidence } : {}),
        };
      }

      // Track the best outcome across all qualifying records: a candidate
      // with two degrees only needs ONE to satisfy the rule.
      let bestFail: EduOutcome | null = null;
      let bestConditional: EduOutcome | null = null;
      let bestUnknown: EduOutcome | null = null;

      for (const record of atLevel) {
        const label = record.degree
          ? `${record.degree}${record.discipline ? ` (${record.discipline})` : ''}`
          : levelLabel(record.level);

        // Completion / result-awaited gating.
        if (node.mustBeCompleted && !record.completed) {
          const outcome: EduOutcome = {
            status: 'FAIL',
            required: `${required} (must be completed)`,
            candidate: `${label} — ${record.resultAwaited ? 'result awaited' : 'not completed'}`,
            detail: 'This post requires an awarded qualification; a pending result does not satisfy it.',
            missingFields: [],
            ...(node.evidence ? { evidence: node.evidence } : {}),
          };
          bestFail = bestFail ?? outcome;
          continue;
        }
        if (!node.mustBeCompleted && !record.completed) {
          // Not explicitly barred, but we cannot assert a pass either.
          const outcome: EduOutcome = {
            status: 'CONDITIONAL',
            required,
            candidate: `${label} — ${record.resultAwaited ? 'result awaited' : 'in progress'}`,
            detail:
              'Your qualification is not yet complete. Many notifications allow final-year candidates subject to producing the result by a stated date — confirm in the official notification.',
            missingFields: [],
            ...(node.evidence ? { evidence: node.evidence } : {}),
          };
          bestConditional = bestConditional ?? outcome;
          continue;
        }

        // Result-date gating.
        if (node.completedBefore) {
          if (!record.resultDate) {
            const outcome: EduOutcome = {
              status: 'UNKNOWN',
              required: `${required}, result declared on or before ${node.completedBefore}`,
              candidate: `${label} — result date not provided`,
              missingFields: ['education.resultDate'],
              detail: 'Add the date your result was declared to check this requirement.',
              ...(node.evidence ? { evidence: node.evidence } : {}),
            };
            bestUnknown = bestUnknown ?? outcome;
            continue;
          }
          if (record.resultDate > node.completedBefore) {
            const outcome: EduOutcome = {
              status: 'FAIL',
              required: `${required}, result declared on or before ${node.completedBefore}`,
              candidate: `${label} — result declared ${record.resultDate}`,
              detail: `The result must be declared on or before ${node.completedBefore}.`,
              missingFields: [],
              ...(node.evidence ? { evidence: node.evidence } : {}),
            };
            bestFail = bestFail ?? outcome;
            continue;
          }
        }

        // Degree-family gating.
        if (node.degreeFamilies?.length) {
          const family = record.degreeFamily ?? normaliseDegree(record.degree);
          if (!family) {
            const outcome: EduOutcome = {
              status: 'CONDITIONAL',
              required,
              candidate: label,
              detail:
                'We could not confidently map your degree to a recognised family. Eligibility needs manual confirmation against the notification.',
              missingFields: [],
              ...(node.evidence ? { evidence: node.evidence } : {}),
            };
            bestConditional = bestConditional ?? outcome;
            continue;
          }
          if (!node.degreeFamilies.includes(family)) {
            // The notification may permit equivalents — do not assert FAIL.
            if (node.equivalentAllowed) {
              const outcome: EduOutcome = {
                status: 'CONDITIONAL',
                required,
                candidate: label,
                detail:
                  'Your degree is not one of those explicitly listed, but this notification accepts equivalent qualifications subject to the recruiting authority’s approval.',
                missingFields: [],
                ...(node.evidence ? { evidence: node.evidence } : {}),
              };
              bestConditional = bestConditional ?? outcome;
              continue;
            }
            const outcome: EduOutcome = {
              status: 'FAIL',
              required,
              candidate: label,
              detail: 'Your degree is not among those accepted for this post.',
              missingFields: [],
              ...(node.evidence ? { evidence: node.evidence } : {}),
            };
            bestFail = bestFail ?? outcome;
            continue;
          }
        }

        // Discipline gating.
        if (node.disciplines?.length) {
          const slug = record.disciplineSlug ?? normaliseDiscipline(record.discipline);
          if (!slug) {
            const outcome: EduOutcome = {
              status: 'UNKNOWN',
              required,
              candidate: label,
              missingFields: ['education.discipline'],
              detail: 'Add the specialisation/stream of your qualification to check this requirement.',
              ...(node.evidence ? { evidence: node.evidence } : {}),
            };
            bestUnknown = bestUnknown ?? outcome;
            continue;
          }
          const wanted = node.disciplines.map((d) => normaliseDiscipline(d) ?? d);
          if (!wanted.includes(slug)) {
            if (node.equivalentAllowed) {
              const outcome: EduOutcome = {
                status: 'CONDITIONAL',
                required,
                candidate: label,
                detail:
                  'Your stream is not explicitly listed, but this notification accepts equivalent qualifications subject to approval.',
                missingFields: [],
                ...(node.evidence ? { evidence: node.evidence } : {}),
              };
              bestConditional = bestConditional ?? outcome;
              continue;
            }
            const outcome: EduOutcome = {
              status: 'FAIL',
              required,
              candidate: label,
              detail: `This post requires ${node.disciplines.join(' or ')}; your stream is ${record.discipline ?? slug}.`,
              missingFields: [],
              ...(node.evidence ? { evidence: node.evidence } : {}),
            };
            bestFail = bestFail ?? outcome;
            continue;
          }
        }

        // Marks gating.
        if (node.minPercentage !== undefined || node.minCgpa !== undefined) {
          if (node.minCgpa !== undefined) {
            if (typeof record.cgpa !== 'number') {
              // Fall back to percentage comparison only if a % floor exists.
              if (node.minPercentage === undefined) {
                const outcome: EduOutcome = {
                  status: 'UNKNOWN',
                  required,
                  candidate: label,
                  missingFields: ['education.cgpa'],
                  detail: 'Add your CGPA to check the minimum-marks requirement.',
                  ...(node.evidence ? { evidence: node.evidence } : {}),
                };
                bestUnknown = bestUnknown ?? outcome;
                continue;
              }
            } else if (record.cgpa < node.minCgpa) {
              const outcome: EduOutcome = {
                status: 'FAIL',
                required,
                candidate: `${label} — CGPA ${record.cgpa}`,
                detail: `Minimum CGPA required is ${node.minCgpa}.`,
                missingFields: [],
                ...(node.evidence ? { evidence: node.evidence } : {}),
              };
              bestFail = bestFail ?? outcome;
              continue;
            }
          }
          if (node.minPercentage !== undefined) {
            const pct = effectivePercentage(record);
            if (pct === null) {
              const outcome: EduOutcome = {
                status: 'UNKNOWN',
                required,
                candidate: label,
                missingFields: ['education.percentage'],
                detail: 'Add your marks (percentage or CGPA) to check the minimum-marks requirement.',
                ...(node.evidence ? { evidence: node.evidence } : {}),
              };
              bestUnknown = bestUnknown ?? outcome;
              continue;
            }
            if (pct < node.minPercentage) {
              const derived = record.percentage === undefined && record.cgpa !== undefined;
              const outcome: EduOutcome = {
                status: 'FAIL',
                required,
                candidate: `${label} — ${pct.toFixed(1)}%${derived ? ' (converted from CGPA)' : ''}`,
                detail: `Minimum ${node.minPercentage}% required; you have ${pct.toFixed(1)}%.`,
                missingFields: [],
                ...(node.evidence ? { evidence: node.evidence } : {}),
              };
              bestFail = bestFail ?? outcome;
              continue;
            }
          }
        }

        // Every constraint on this record passed.
        const pct = effectivePercentage(record);
        return {
          status: 'PASS',
          required,
          candidate: `${label}${pct !== null ? ` — ${pct.toFixed(1)}%` : ''}`,
          missingFields: [],
          ...(node.evidence ? { evidence: node.evidence } : {}),
        };
      }

      // No record fully passed. Prefer the least-final explanation so the
      // candidate is told "add a field" before being told "you failed".
      return (
        bestUnknown ??
        bestConditional ??
        bestFail ?? {
          status: 'FAIL',
          required,
          candidate: 'None',
          missingFields: [],
          ...(node.evidence ? { evidence: node.evidence } : {}),
        }
      );
    }

    case 'SUBJECT_AT_LEVEL': {
      const wanted = normaliseDiscipline(node.subject) ?? node.subject.toLowerCase();
      const required = `${node.subject} studied at ${levelLabel(node.level)}`;
      const records = profile.education.filter((e) => e.level === node.level);
      if (records.length === 0) {
        return {
          status: 'UNKNOWN',
          required,
          candidate: `No ${levelLabel(node.level)} record`,
          missingFields: ['education'],
          detail: `Add your ${levelLabel(node.level)} details to check this requirement.`,
          ...(node.evidence ? { evidence: node.evidence } : {}),
        };
      }
      const withSubjects = records.filter((r) => (r.subjects?.length ?? 0) > 0);
      if (withSubjects.length === 0) {
        return {
          status: 'UNKNOWN',
          required,
          candidate: `${levelLabel(node.level)} — subjects not provided`,
          missingFields: ['education.subjects'],
          detail: `Add the subjects you studied at ${levelLabel(node.level)} to check this requirement.`,
          ...(node.evidence ? { evidence: node.evidence } : {}),
        };
      }
      const found = withSubjects.some((r) =>
        (r.subjects ?? []).some((s) => (normaliseDiscipline(s) ?? s.toLowerCase()) === wanted),
      );
      return {
        status: found ? 'PASS' : 'FAIL',
        required,
        candidate: withSubjects.flatMap((r) => r.subjects ?? []).join(', '),
        missingFields: [],
        ...(found ? {} : { detail: `${node.subject} at ${levelLabel(node.level)} is required for this post.` }),
        ...(node.evidence ? { evidence: node.evidence } : {}),
      };
    }

    case 'ALL_OF': {
      const results = node.of.map((child) => evaluateEducationRule(child, profile));
      const fail = results.find((r) => r.status === 'FAIL');
      if (fail) return fail;
      const unknown = results.find((r) => r.status === 'UNKNOWN');
      if (unknown) return unknown;
      const conditional = results.find((r) => r.status === 'CONDITIONAL');
      if (conditional) return conditional;
      return {
        status: 'PASS',
        required: results.map((r) => r.required).join(' AND '),
        candidate: results.map((r) => r.candidate).join('; '),
        missingFields: [],
        ...(results.find((r) => r.evidence)?.evidence ? { evidence: results.find((r) => r.evidence)!.evidence } : {}),
      };
    }

    case 'ANY_OF': {
      const results = node.of.map((child) => evaluateEducationRule(child, profile));
      const pass = results.find((r) => r.status === 'PASS');
      const required = results.map((r) => r.required).join(' OR ');
      if (pass) {
        return { ...pass, required };
      }
      // No branch passed outright — surface the most recoverable explanation.
      const conditional = results.find((r) => r.status === 'CONDITIONAL');
      if (conditional) return { ...conditional, required };
      const unknown = results.find((r) => r.status === 'UNKNOWN');
      if (unknown) {
        return {
          ...unknown,
          required,
          missingFields: [...new Set(results.flatMap((r) => r.missingFields))],
        };
      }
      return {
        status: 'FAIL',
        required,
        candidate: results[0]?.candidate ?? 'None',
        detail: 'You do not hold any of the qualifications accepted for this post.',
        missingFields: [],
        ...(results.find((r) => r.evidence)?.evidence ? { evidence: results.find((r) => r.evidence)!.evidence } : {}),
      };
    }

    case 'NOT': {
      const inner = evaluateEducationRule(node.of, profile);
      // Negation of an indeterminate result is still indeterminate.
      if (inner.status === 'UNKNOWN' || inner.status === 'CONDITIONAL') return inner;
      const flipped: RuleStatus = inner.status === 'PASS' ? 'FAIL' : 'PASS';
      return {
        status: flipped,
        required: `NOT (${inner.required})`,
        candidate: inner.candidate,
        missingFields: [],
        ...(flipped === 'FAIL' ? { detail: 'This post excludes candidates holding this qualification.' } : {}),
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// EXPERIENCE
// ─────────────────────────────────────────────────────────────────────────

/** Merge overlapping date ranges so concurrent roles are not double-counted. */
function mergedMonths(records: ExperienceRecord[], nowIso: string): number {
  const spans = records
    .map((r) => ({
      start: r.startDate,
      end: r.current || !r.endDate ? nowIso : r.endDate,
    }))
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
  return merged.reduce((sum, s) => sum + monthsBetween(s.start, s.end), 0);
}

function evaluateExperience(
  profile: CareerProfile,
  rules: EligibilityRules,
  nowIso: string,
): RuleEvaluation {
  const rule = rules.experience;
  if (
    !rule ||
    (rule.minTotalMonths === undefined &&
      rule.minRelevantMonths === undefined &&
      rule.minManagerialMonths === undefined)
  ) {
    return notApplicable('EXPERIENCE', 'Experience');
  }

  const requiredParts: string[] = [];
  if (rule.minTotalMonths !== undefined) requiredParts.push(`${humanMonths(rule.minTotalMonths)} total`);
  if (rule.minRelevantMonths !== undefined) requiredParts.push(`${humanMonths(rule.minRelevantMonths)} relevant`);
  if (rule.minManagerialMonths !== undefined) requiredParts.push(`${humanMonths(rule.minManagerialMonths)} managerial`);
  if (rule.postQualificationOnly) requiredParts.push('post-qualification');
  const required = requiredParts.join(', ');

  if (profile.experience.length === 0) {
    // Zero experience is a definite FAIL against a positive requirement —
    // this is knowable without extra profile data.
    const needsAny =
      (rule.minTotalMonths ?? 0) > 0 ||
      (rule.minRelevantMonths ?? 0) > 0 ||
      (rule.minManagerialMonths ?? 0) > 0;
    if (needsAny) {
      return evaluation('EXPERIENCE', 'Experience', required, 'None added', 'UNKNOWN', {
        missingFields: ['experience'],
        detail: 'Add your work experience to confirm eligibility for this post.',
        ...(rule.evidence ? { evidence: rule.evidence } : {}),
      });
    }
    return evaluation('EXPERIENCE', 'Experience', required, 'None', 'PASS');
  }

  let considered = profile.experience;

  // Post-qualification filter: only count roles starting after the relevant
  // degree was awarded.
  if (rule.postQualificationOnly) {
    const completionDates = profile.education
      .filter((e) => e.completed)
      .map((e) => e.resultDate ?? (e.graduationYear ? `${e.graduationYear}-12-31` : undefined))
      .filter((d): d is string => !!d)
      .sort();
    const earliest = completionDates[0];
    if (!earliest) {
      return evaluation('EXPERIENCE', 'Experience', required, 'Qualification date unknown', 'UNKNOWN', {
        missingFields: ['education.graduationYear'],
        detail: 'This post counts only experience gained after your qualification. Add your graduation year.',
        ...(rule.evidence ? { evidence: rule.evidence } : {}),
      });
    }
    considered = considered.filter((r) => r.startDate >= earliest);
  }

  const totalMonths = mergedMonths(considered, nowIso);

  const relevantSkills = normaliseSkills(rule.relevantSkills);
  const relevantSectors = (rule.relevantSectors ?? []).map((s) => s.toLowerCase());
  const relevantRecords =
    relevantSkills.length === 0 && relevantSectors.length === 0
      ? considered
      : considered.filter((r) => {
          const skills = normaliseSkills(r.skills);
          const skillHit = relevantSkills.some((s) => skills.includes(s));
          const sectorHit = !!r.sector && relevantSectors.includes(r.sector.toLowerCase());
          return skillHit || sectorHit;
        });
  const relevantMonths = mergedMonths(relevantRecords, nowIso);
  const managerialMonths = mergedMonths(considered.filter((r) => r.managerial), nowIso);

  const candidate = `${humanMonths(totalMonths)} total${
    rule.minRelevantMonths !== undefined ? `, ${humanMonths(relevantMonths)} relevant` : ''
  }${rule.minManagerialMonths !== undefined ? `, ${humanMonths(managerialMonths)} managerial` : ''}`;

  if (rule.minTotalMonths !== undefined && totalMonths < rule.minTotalMonths) {
    return evaluation('EXPERIENCE', 'Experience', required, candidate, 'FAIL', {
      detail: `This post requires ${humanMonths(rule.minTotalMonths)} of experience; you have ${humanMonths(totalMonths)}.`,
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }
  if (rule.minRelevantMonths !== undefined && relevantMonths < rule.minRelevantMonths) {
    return evaluation('EXPERIENCE', 'Experience', required, candidate, 'FAIL', {
      detail: `This post requires ${humanMonths(rule.minRelevantMonths)} of relevant experience; ${humanMonths(relevantMonths)} of your experience matches.`,
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }
  if (rule.minManagerialMonths !== undefined && managerialMonths < rule.minManagerialMonths) {
    return evaluation('EXPERIENCE', 'Experience', required, candidate, 'FAIL', {
      detail: `This post requires ${humanMonths(rule.minManagerialMonths)} in a managerial role; you have ${humanMonths(managerialMonths)}.`,
      ...(rule.evidence ? { evidence: rule.evidence } : {}),
    });
  }

  return evaluation('EXPERIENCE', 'Experience', required, candidate, 'PASS', {
    ...(rule.evidence ? { evidence: rule.evidence } : {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// DOMICILE
// ─────────────────────────────────────────────────────────────────────────

function evaluateDomicile(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const rule = rules.domicile;
  if (!rule || rule.mode === 'ANY') {
    return evaluation('DOMICILE', 'Domicile', 'No restriction', profile.domicileState ?? '—', 'NOT_APPLICABLE');
  }

  const ev = rule.evidence ? { evidence: rule.evidence } : {};

  if (rule.mode === 'PREFERENCE_ONLY') {
    return evaluation(
      'DOMICILE',
      'Domicile',
      `${rule.state ?? 'Local'} candidates preferred`,
      profile.domicileState ?? 'Not provided',
      'PASS',
      {
        detail: 'Domicile is a preference for this post, not a bar — you may apply regardless.',
        ...ev,
      },
    );
  }

  if (rule.mode === 'LOCAL_RESERVATION') {
    return evaluation(
      'DOMICILE',
      'Domicile',
      `Reserved seats for ${rule.state ?? 'local'} domiciles`,
      profile.domicileState ?? 'Not provided',
      'CONDITIONAL',
      {
        detail:
          'Some seats are reserved for local domiciles. Non-local candidates may still be eligible for unreserved seats — check the notification.',
        ...ev,
      },
    );
  }

  // STATE_ONLY / DISTRICT_ONLY are genuine bars.
  if (rule.mode === 'STATE_ONLY') {
    const required = `Domicile of ${rule.state ?? 'the recruiting state'}`;
    if (!profile.domicileState) {
      return evaluation('DOMICILE', 'Domicile', required, 'Not provided', 'UNKNOWN', {
        missingFields: ['domicileState'],
        detail: 'Add your domicile state to check this requirement.',
        ...ev,
      });
    }
    const ok = !rule.state || profile.domicileState === rule.state;
    return evaluation('DOMICILE', 'Domicile', required, profile.domicileState, ok ? 'PASS' : 'FAIL', {
      ...(ok ? {} : { detail: `This post is restricted to domiciles of ${rule.state}.` }),
      ...ev,
    });
  }

  const required = `Domicile of ${rule.district ?? 'the recruiting district'}`;
  if (!profile.domicileDistrict) {
    return evaluation('DOMICILE', 'Domicile', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['domicileDistrict'],
      detail: 'Add your domicile district to check this requirement.',
      ...ev,
    });
  }
  const ok = !rule.district || profile.domicileDistrict === rule.district;
  return evaluation('DOMICILE', 'Domicile', required, profile.domicileDistrict, ok ? 'PASS' : 'FAIL', {
    ...(ok ? {} : { detail: `This post is restricted to domiciles of ${rule.district}.` }),
    ...ev,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Simpler scalar rules
// ─────────────────────────────────────────────────────────────────────────

function evaluateNationality(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const allowed = rules.nationalities;
  if (!allowed?.length) return notApplicable('NATIONALITY', 'Nationality');
  const required = allowed.join(' / ');
  if (!profile.nationality) {
    return evaluation('NATIONALITY', 'Nationality', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['nationality'],
    });
  }
  const ok = allowed.some((a) => a.toLowerCase() === profile.nationality!.toLowerCase());
  return evaluation('NATIONALITY', 'Nationality', required, profile.nationality, ok ? 'PASS' : 'FAIL', {
    ...(ok ? {} : { detail: `This post is open to ${required} nationals only.` }),
  });
}

function evaluateCategory(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const allowed = rules.restrictedToCategories;
  if (!allowed?.length) return notApplicable('CATEGORY', 'Category');
  const required = allowed.join(' / ');
  if (!profile.category) {
    return evaluation('CATEGORY', 'Category', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['category'],
    });
  }
  const ok = allowed.includes(profile.category);
  return evaluation('CATEGORY', 'Category', required, profile.category, ok ? 'PASS' : 'FAIL', {
    ...(ok ? {} : { detail: `This vacancy is restricted to ${required} candidates.` }),
  });
}

function evaluateGender(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const allowed = rules.restrictedToGender;
  if (!allowed?.length) return notApplicable('GENDER', 'Gender');
  const required = allowed.join(' / ');
  if (!profile.gender || profile.gender === 'PREFER_NOT_TO_SAY') {
    return evaluation('GENDER', 'Gender', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['gender'],
    });
  }
  const ok = allowed.includes(profile.gender);
  return evaluation('GENDER', 'Gender', required, profile.gender, ok ? 'PASS' : 'FAIL', {
    ...(ok ? {} : { detail: `This vacancy is notified for ${required} candidates.` }),
  });
}

function evaluateExamScores(
  profile: CareerProfile,
  rules: EligibilityRules,
  nowIso: string,
): RuleEvaluation[] {
  const specs = rules.examScores;
  if (!specs?.length) return [notApplicable('EXAM_SCORE', 'Qualifying exam')];

  return specs.map((spec) => {
    const bits: string[] = [spec.exam];
    if (spec.minScore !== undefined) bits.push(`score ≥ ${spec.minScore}`);
    if (spec.minPercentile !== undefined) bits.push(`percentile ≥ ${spec.minPercentile}`);
    if (spec.maxRank !== undefined) bits.push(`rank ≤ ${spec.maxRank}`);
    if (spec.acceptedYears?.length) bits.push(`year ${spec.acceptedYears.join('/')}`);
    const required = bits.join(', ');
    const ev = spec.evidence ? { evidence: spec.evidence } : {};

    const held = profile.exams.filter((e) => e.exam.toUpperCase() === spec.exam.toUpperCase());
    if (held.length === 0) {
      return evaluation('EXAM_SCORE', `${spec.exam} score`, required, 'Not provided', 'UNKNOWN', {
        missingFields: [`exams.${spec.exam}`],
        detail: `This vacancy requires a valid ${spec.exam} score. Add yours to confirm eligibility.`,
        ...ev,
      });
    }

    const validOn = spec.validOn ?? nowIso.slice(0, 10);
    let bestLabel = '';
    for (const record of held) {
      const label = [
        record.score !== undefined ? `score ${record.score}` : null,
        record.percentile !== undefined ? `percentile ${record.percentile}` : null,
        record.rank !== undefined ? `rank ${record.rank}` : null,
        record.year !== undefined ? `(${record.year})` : null,
      ]
        .filter(Boolean)
        .join(', ');
      if (!bestLabel) bestLabel = label;

      if (spec.acceptedYears?.length && (record.year === undefined || !spec.acceptedYears.includes(record.year))) continue;
      if (record.validUntil && record.validUntil < validOn) continue;
      if (spec.minScore !== undefined && (record.score === undefined || record.score < spec.minScore)) continue;
      if (spec.minPercentile !== undefined && (record.percentile === undefined || record.percentile < spec.minPercentile)) continue;
      if (spec.maxRank !== undefined && (record.rank === undefined || record.rank > spec.maxRank)) continue;

      return evaluation('EXAM_SCORE', `${spec.exam} score`, required, label || 'Qualified', 'PASS', ev);
    }

    return evaluation('EXAM_SCORE', `${spec.exam} score`, required, bestLabel || 'Provided', 'FAIL', {
      detail: `Your ${spec.exam} record does not meet the requirement (${required}).`,
      ...ev,
    });
  });
}

function evaluatePhysical(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const rule = rules.physical;
  if (!rule || (!rule.minHeightCm && rule.minChestCm === undefined && rule.minChestExpansionCm === undefined)) {
    return notApplicable('PHYSICAL', 'Physical standards');
  }
  const ev = rule.evidence ? { evidence: rule.evidence } : {};

  const gender = profile.gender === 'MALE' || profile.gender === 'FEMALE' || profile.gender === 'TRANSGENDER'
    ? profile.gender
    : undefined;
  const neededHeight = rule.minHeightCm && gender ? rule.minHeightCm[gender] : undefined;

  const reqBits: string[] = [];
  if (rule.minHeightCm) {
    reqBits.push(
      'height ' +
        Object.entries(rule.minHeightCm)
          .map(([g, cm]) => `${g.toLowerCase()} ≥ ${cm}cm`)
          .join(' / '),
    );
  }
  if (rule.minChestCm !== undefined) reqBits.push(`chest ≥ ${rule.minChestCm}cm`);
  if (rule.minChestExpansionCm !== undefined) reqBits.push(`expansion ≥ ${rule.minChestExpansionCm}cm`);
  const required = reqBits.join(', ');

  const missing: string[] = [];
  if (rule.minHeightCm && profile.physical?.heightCm === undefined) missing.push('physical.heightCm');
  if (rule.minChestCm !== undefined && profile.physical?.chestCm === undefined) missing.push('physical.chestCm');
  if (rule.minHeightCm && !gender) missing.push('gender');
  if (missing.length > 0) {
    return evaluation('PHYSICAL', 'Physical standards', required, 'Not provided', 'UNKNOWN', {
      missingFields: missing,
      detail: 'This post has physical standards. Add your measurements to check eligibility.',
      ...ev,
    });
  }

  const candidateBits: string[] = [];
  if (profile.physical?.heightCm !== undefined) candidateBits.push(`height ${profile.physical.heightCm}cm`);
  if (profile.physical?.chestCm !== undefined) candidateBits.push(`chest ${profile.physical.chestCm}cm`);
  const candidate = candidateBits.join(', ') || '—';

  if (neededHeight !== undefined && (profile.physical?.heightCm ?? 0) < neededHeight) {
    return evaluation('PHYSICAL', 'Physical standards', required, candidate, 'FAIL', {
      detail: `Minimum height for this post is ${neededHeight}cm.`,
      ...ev,
    });
  }
  if (rule.minChestCm !== undefined && (profile.physical?.chestCm ?? 0) < rule.minChestCm) {
    return evaluation('PHYSICAL', 'Physical standards', required, candidate, 'FAIL', {
      detail: `Minimum chest measurement for this post is ${rule.minChestCm}cm.`,
      ...ev,
    });
  }
  if (rule.minChestExpansionCm !== undefined) {
    const expanded = profile.physical?.chestExpandedCm;
    const base = profile.physical?.chestCm;
    if (expanded === undefined || base === undefined) {
      return evaluation('PHYSICAL', 'Physical standards', required, candidate, 'UNKNOWN', {
        missingFields: ['physical.chestExpandedCm'],
        ...ev,
      });
    }
    if (expanded - base < rule.minChestExpansionCm) {
      return evaluation('PHYSICAL', 'Physical standards', required, candidate, 'FAIL', {
        detail: `Minimum chest expansion for this post is ${rule.minChestExpansionCm}cm.`,
        ...ev,
      });
    }
  }

  return evaluation('PHYSICAL', 'Physical standards', required, candidate, 'PASS', ev);
}

function evaluateSpeeds(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const rule = rules.speeds;
  if (
    !rule ||
    (rule.minTypingWpmEnglish === undefined &&
      rule.minTypingWpmHindi === undefined &&
      rule.minShorthandWpm === undefined)
  ) {
    return notApplicable('SPEED', 'Typing / shorthand');
  }
  const ev = rule.evidence ? { evidence: rule.evidence } : {};

  const reqBits: string[] = [];
  if (rule.minTypingWpmEnglish !== undefined) reqBits.push(`English typing ≥ ${rule.minTypingWpmEnglish} wpm`);
  if (rule.minTypingWpmHindi !== undefined) reqBits.push(`Hindi typing ≥ ${rule.minTypingWpmHindi} wpm`);
  if (rule.minShorthandWpm !== undefined) reqBits.push(`shorthand ≥ ${rule.minShorthandWpm} wpm`);
  const required = reqBits.join(', ');

  const checks: Array<{ need: number | undefined; have: number | undefined; field: string; label: string }> = [
    { need: rule.minTypingWpmEnglish, have: profile.speeds?.typingWpmEnglish, field: 'speeds.typingWpmEnglish', label: 'English typing' },
    { need: rule.minTypingWpmHindi, have: profile.speeds?.typingWpmHindi, field: 'speeds.typingWpmHindi', label: 'Hindi typing' },
    { need: rule.minShorthandWpm, have: profile.speeds?.shorthandWpm, field: 'speeds.shorthandWpm', label: 'Shorthand' },
  ];

  const missing = checks.filter((c) => c.need !== undefined && c.have === undefined).map((c) => c.field);
  if (missing.length > 0) {
    return evaluation('SPEED', 'Typing / shorthand', required, 'Not provided', 'UNKNOWN', {
      missingFields: missing,
      detail: 'This post requires a typing/shorthand speed. Add yours to check eligibility.',
      ...ev,
    });
  }

  const candidate = checks
    .filter((c) => c.have !== undefined)
    .map((c) => `${c.label} ${c.have} wpm`)
    .join(', ') || '—';

  for (const c of checks) {
    if (c.need !== undefined && (c.have ?? 0) < c.need) {
      return evaluation('SPEED', 'Typing / shorthand', required, candidate, 'FAIL', {
        detail: `${c.label} speed must be at least ${c.need} wpm.`,
        ...ev,
      });
    }
  }
  return evaluation('SPEED', 'Typing / shorthand', required, candidate, 'PASS', ev);
}

function evaluateLicence(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  if (!rules.requiresDrivingLicence) return notApplicable('DRIVING_LICENCE', 'Driving licence');
  const classes = rules.drivingLicenceClasses;
  const required = classes?.length ? `Driving licence (${classes.join('/')})` : 'Valid driving licence';
  if (profile.hasDrivingLicence === undefined) {
    return evaluation('DRIVING_LICENCE', 'Driving licence', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['hasDrivingLicence'],
      detail: 'This post requires a driving licence. Confirm whether you hold one.',
    });
  }
  if (!profile.hasDrivingLicence) {
    return evaluation('DRIVING_LICENCE', 'Driving licence', required, 'None', 'FAIL', {
      detail: 'A valid driving licence is required for this post.',
    });
  }
  if (classes?.length) {
    const held = profile.drivingLicenceClasses ?? [];
    if (held.length === 0) {
      return evaluation('DRIVING_LICENCE', 'Driving licence', required, 'Licence held, class unknown', 'UNKNOWN', {
        missingFields: ['drivingLicenceClasses'],
      });
    }
    const ok = classes.some((c) => held.includes(c));
    return evaluation('DRIVING_LICENCE', 'Driving licence', required, held.join(', '), ok ? 'PASS' : 'FAIL', {
      ...(ok ? {} : { detail: `This post requires a ${classes.join(' or ')} class licence.` }),
    });
  }
  return evaluation('DRIVING_LICENCE', 'Driving licence', required, 'Held', 'PASS');
}

function evaluateLanguages(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const needed = rules.requiredLanguages;
  if (!needed?.length) return notApplicable('LANGUAGE', 'Language');
  const required = needed.join(', ');
  const held = profile.languages;
  if (!held?.length) {
    return evaluation('LANGUAGE', 'Language', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['languages'],
      detail: 'This post requires specific language proficiency. Add the languages you know.',
    });
  }
  const lower = held.map((l) => l.toLowerCase());
  const missing = needed.filter((n) => !lower.includes(n.toLowerCase()));
  return evaluation('LANGUAGE', 'Language', required, held.join(', '), missing.length === 0 ? 'PASS' : 'FAIL', {
    ...(missing.length === 0 ? {} : { detail: `Proficiency required in: ${missing.join(', ')}.` }),
  });
}

function evaluateEmploymentExchange(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  if (!rules.requiresEmploymentExchangeRegistration) {
    return notApplicable('EMPLOYMENT_EXCHANGE', 'Employment exchange');
  }
  const required = 'Employment exchange registration';
  if (profile.employmentExchangeRegistered === undefined) {
    return evaluation('EMPLOYMENT_EXCHANGE', 'Employment exchange', required, 'Not provided', 'UNKNOWN', {
      missingFields: ['employmentExchangeRegistered'],
    });
  }
  return evaluation(
    'EMPLOYMENT_EXCHANGE',
    'Employment exchange',
    required,
    profile.employmentExchangeRegistered ? 'Registered' : 'Not registered',
    profile.employmentExchangeRegistered ? 'PASS' : 'FAIL',
    {
      ...(profile.employmentExchangeRegistered
        ? {}
        : { detail: 'Registration with the employment exchange is required for this post.' }),
    },
  );
}

function evaluateMandatorySkills(profile: CareerProfile, rules: EligibilityRules): RuleEvaluation {
  const needed = normaliseSkills(rules.mandatorySkills);
  if (needed.length === 0) return notApplicable('MANDATORY_SKILLS', 'Required skills');
  const required = (rules.mandatorySkills ?? []).join(', ');
  const held = normaliseSkills(profile.skills);
  if (held.length === 0) {
    return evaluation('MANDATORY_SKILLS', 'Required skills', required, 'None added', 'UNKNOWN', {
      missingFields: ['skills'],
      detail: 'Add your skills to check this requirement.',
    });
  }
  const missing = needed.filter((s) => !held.includes(s));
  return evaluation(
    'MANDATORY_SKILLS',
    'Required skills',
    required,
    profile.skills.join(', '),
    missing.length === 0 ? 'PASS' : 'FAIL',
    { ...(missing.length === 0 ? {} : { detail: `Missing mandatory skills: ${missing.join(', ')}.` }) },
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a candidate against one vacancy's structured rules.
 *
 * Pure and synchronous by design — safe to call in a tight loop over a
 * filtered candidate set, on the server or in the browser.
 */
export function evaluateEligibility(
  profile: CareerProfile,
  rules: EligibilityRules,
  meta: { jobVersion: number; sector?: string; applicationDeadline?: string },
  options: EvaluateOptions = {},
): EligibilityResult {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const warnings: string[] = [];

  const fallbackCutoff =
    options.ageCutoffFallback ??
    (meta.applicationDeadline ? meta.applicationDeadline.slice(0, 10) : undefined);

  const rulesOut: RuleEvaluation[] = [
    evaluateAge(profile, rules, { now, ...(fallbackCutoff ? { fallbackCutoff } : {}) }, warnings),
    rules.education
      ? (() => {
          const r = evaluateEducationRule(rules.education, profile);
          return evaluation('EDUCATION', 'Education', r.required, r.candidate, r.status, {
            ...(r.detail ? { detail: r.detail } : {}),
            ...(r.missingFields.length ? { missingFields: r.missingFields } : {}),
            ...(r.evidence ? { evidence: r.evidence } : {}),
          });
        })()
      : notApplicable('EDUCATION', 'Education'),
    evaluateExperience(profile, rules, nowIso),
    evaluateDomicile(profile, rules),
    evaluateNationality(profile, rules),
    evaluateCategory(profile, rules),
    evaluateGender(profile, rules),
    ...evaluateExamScores(profile, rules, nowIso),
    evaluatePhysical(profile, rules),
    evaluateSpeeds(profile, rules),
    evaluateLicence(profile, rules),
    evaluateLanguages(profile, rules),
    evaluateEmploymentExchange(profile, rules),
    evaluateMandatorySkills(profile, rules),
  ];

  const blockingReasons: string[] = [];
  const missingProfileFields = new Set<string>();

  for (const r of rulesOut) {
    if (r.status === 'FAIL') {
      blockingReasons.push(r.detail ?? `${r.label}: required ${r.required}, you have ${r.candidate}`);
    }
    for (const f of r.missingFields ?? []) missingProfileFields.add(f);
    if (r.status === 'CONDITIONAL' && r.detail) warnings.push(r.detail);
  }

  // Status precedence. A demonstrable FAIL outranks everything: it is far
  // worse to tell a candidate they are eligible when a statutory bar
  // excludes them than to be cautious.
  let status: EligibilityStatus;
  if (rulesOut.some((r) => r.status === 'FAIL')) {
    status = 'NOT_ELIGIBLE';
  } else if (rules.needsManualReview) {
    status = 'MANUAL_REVIEW';
    if (rules.manualReviewReason) warnings.push(rules.manualReviewReason);
  } else if (rulesOut.some((r) => r.status === 'UNKNOWN')) {
    status = 'PROFILE_INCOMPLETE';
  } else if (rulesOut.some((r) => r.status === 'CONDITIONAL')) {
    status = 'CONDITIONALLY_ELIGIBLE';
  } else {
    status = 'ELIGIBLE';
  }

  // Non-statutory sectors should not claim a statutory verdict. A private
  // role with everything passing is reported as CONDITIONALLY_ELIGIBLE so
  // the UI shows a fit score rather than an eligibility guarantee.
  if (status === 'ELIGIBLE' && meta.sector && !isStatutorySector(meta.sector as never)) {
    status = 'CONDITIONALLY_ELIGIBLE';
    warnings.push(
      'This is a non-government role. You meet the stated mandatory requirements, but the employer decides shortlisting.',
    );
  }

  return {
    status,
    rules: rulesOut,
    blockingReasons,
    missingProfileFields: [...missingProfileFields],
    warnings: [...new Set(warnings)],
    evaluatedAt: nowIso,
    jobVersion: meta.jobVersion,
    profileVersion: profile.profileVersion,
  };
}

/** Convenience wrapper that reads the metadata straight off a Job record. */
export function evaluateJobEligibility(
  profile: CareerProfile,
  job: Job,
  options: EvaluateOptions = {},
): EligibilityResult {
  return evaluateEligibility(
    profile,
    job.eligibilityRules,
    {
      jobVersion: job.version,
      sector: job.sector,
      ...(job.applicationDeadline ? { applicationDeadline: job.applicationDeadline } : {}),
    },
    options,
  );
}

/**
 * Stable cache key for a verdict.
 *
 * Because it embeds both versions, a profile edit or a corrigendum
 * automatically invalidates exactly the affected entries — there is no
 * sweep to run and no risk of serving a verdict computed against stale
 * rules.
 */
export function eligibilityCacheKey(
  userId: string,
  profileVersion: number,
  jobId: string,
  jobVersion: number,
): string {
  return `${userId}:${profileVersion}:${jobId}:${jobVersion}`;
}

/** Candidate relaxation tokens — exported for admin/debug surfaces. */
export function candidateRelaxationTokens(profile: CareerProfile): CandidateFlag[] | string[] {
  return relaxationTokens(profile);
}
