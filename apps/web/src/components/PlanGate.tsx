'use client';

/**
 * Feature-aware plan gate (Part 4 audit).
 *
 *   <PlanGate feature="PYQ_ACCESS" fallback={<UpgradePrompt/>}>
 *     <PyqPaper />
 *   </PlanGate>
 *
 * Reads the signed-in user's plan from the shared user context (`useUser`) and
 * checks the feature against the PLANS matrix from `@nexigrate/shared`. If the
 * user's plan doesn't include the feature it renders `fallback` (a built-in
 * upgrade prompt by default) instead of the children. This is the PROACTIVE
 * gate; the backend planGate is always the source of truth and the global
 * <UpgradeGate/> handles REACTIVE limits (counts/credits) returned at runtime.
 *
 * Note: credit-metered features (chapters, mock tests, AI tutor) are
 * considered "accessible" for Free users because they pay with credits — those
 * are limited reactively (credit balance) rather than hidden up front.
 */

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PLANS, type PlanId, type PlanFeatures } from '@nexigrate/shared';
import { useUser } from '~/lib/userStore';

export type PlanFeatureKey =
  | 'DAILY_MCQ' | 'MOCK_TEST' | 'AI_CHAT' | 'AI_IMAGE' | 'CURRENT_AFFAIRS'
  | 'CHAPTER_ACCESS' | 'ESSAY_GRADING' | 'MULTI_EXAM' | 'PYQ_ACCESS'
  | 'REVISION' | 'ADVANCED_ANALYTICS' | 'DOWNLOAD_NOTES';

/** Mirrors the backend planGate semantics for a proactive client-side check. */
export function planHasFeature(features: PlanFeatures, feature: PlanFeatureKey): boolean {
  const credits = !!features.creditDeduction; // Free pays credits for these
  const num = (n: number | undefined) => (typeof n === 'number' ? n : 0);
  switch (feature) {
    case 'PYQ_ACCESS': return !!features.pyqAccess;
    case 'REVISION': return features.revisionAccess !== false;
    case 'CURRENT_AFFAIRS': return !!features.currentAffairs;
    case 'AI_CHAT': return num(features.aiTutorPerDay) !== 0 || credits;
    case 'MOCK_TEST': return features.mockTests !== 0 || credits;
    case 'CHAPTER_ACCESS': return features.chaptersPerDay !== 0 || credits;
    case 'DAILY_MCQ': return features.dailyMCQ !== 0;
    case 'ESSAY_GRADING': return !!features.essayGrading && num(features.essaysPerDay) !== 0;
    case 'AI_IMAGE': return num(features.imagesPerDay) !== 0;
    case 'MULTI_EXAM': { const m = num(features.maxExams) || 1; return m === -1 || m > 1; }
    case 'ADVANCED_ANALYTICS':
    case 'DOWNLOAD_NOTES':
    default: return true;
  }
}

const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  DAILY_MCQ: 'daily practice MCQs', MOCK_TEST: 'mock tests', AI_CHAT: 'the AI tutor',
  AI_IMAGE: 'AI images', CURRENT_AFFAIRS: 'current affairs', CHAPTER_ACCESS: 'chapters',
  ESSAY_GRADING: 'essay grading', MULTI_EXAM: 'multiple exams', PYQ_ACCESS: 'previous-year papers',
  REVISION: 'revision', ADVANCED_ANALYTICS: 'advanced analytics', DOWNLOAD_NOTES: 'downloads',
};

interface PlanGateProps {
  feature: PlanFeatureKey;
  children: ReactNode;
  /** Custom UI to show when the plan doesn't include the feature. */
  fallback?: ReactNode;
}

export function PlanGate({ feature, children, fallback }: PlanGateProps) {
  const { user } = useUser();
  const planId = (user?.plan ?? 'free') as PlanId;
  const features = (PLANS[planId] ?? PLANS.free).features;

  if (planHasFeature(features, feature)) return <>{children}</>;
  return <>{fallback ?? <UpgradePrompt feature={feature} />}</>;
}

/** Default fallback — a compact upgrade card. */
export function UpgradePrompt({ feature }: { feature: PlanFeatureKey }) {
  const router = useRouter();
  const label = FEATURE_LABELS[feature] ?? 'this feature';
  return (
    <div className="paper-card mx-auto max-w-sm p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ember-500/15 text-ember-500">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h3 className="mt-3 font-serif text-base font-bold text-ink-900">Premium feature</h3>
      <p className="mt-1 text-sm text-muted-500">Upgrade your plan to unlock {label}.</p>
      <button onClick={() => router.push('/upgrade')} className="btn-primary mt-4 w-full">Upgrade Plan</button>
    </div>
  );
}
