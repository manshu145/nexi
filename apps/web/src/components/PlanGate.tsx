'use client';
import { useRouter } from 'next/navigation';

interface PlanGateProps {
  credits: number;
  onUseCredits: () => void;
  loading?: boolean;
}

export function PlanGate({ credits, onUseCredits, loading }: PlanGateProps) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-ink-950/60 p-4">
      <div className="paper-card w-full max-w-sm p-6 text-center shadow-2xl">
        {/* Lock icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-paper-200 dark:bg-paper-700">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-500">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2 className="mt-4 font-serif text-lg font-bold text-ink-900">Chapter Locked</h2>
        <p className="mt-2 text-sm text-muted-500">
          You&apos;ve used your free chapters. Upgrade to continue or earn more credits.
        </p>

        {/* Credits info */}
        <div className="mt-4 rounded-lg bg-paper-200 px-4 py-3 dark:bg-paper-700">
          <p className="text-xs text-muted-500">Your balance</p>
          <p className="text-lg font-bold text-ink-900">{credits} credits</p>
          <p className="text-xs text-muted-400">Opening this chapter costs 5 credits</p>
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2.5">
          {credits >= 5 && (
            <button
              onClick={onUseCredits}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Unlocking...' : 'Use 5 credits to unlock'}
            </button>
          )}
          <button
            onClick={() => router.push('/upgrade')}
            className="btn-primary w-full"
            style={credits >= 5 ? { backgroundColor: 'var(--color-paper-300)', color: 'var(--color-ink-900)', borderColor: 'var(--color-paper-300)' } : undefined}
          >
            Upgrade Plan
          </button>
          <button
            onClick={() => router.push('/profile#credits')}
            className="btn-ghost w-full text-sm"
          >
            Earn Credits
          </button>
        </div>
      </div>
    </div>
  );
}
