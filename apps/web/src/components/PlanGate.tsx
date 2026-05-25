'use client';
import { useRouter } from 'next/navigation';

interface PlanGateProps {
  requiredPlan?: 'scholar' | 'aspirant' | 'achiever';
  currentPlan: string;
  dailyMcqUsed?: number;
  dailyMcqLimit?: number;
  children: React.ReactNode;
}

export function PlanGate({ requiredPlan, currentPlan, dailyMcqUsed = 0, dailyMcqLimit = 10, children }: PlanGateProps) {
  const router = useRouter();
  const planOrder = ['free', 'scholar', 'aspirant', 'achiever'];
  const currentIdx = planOrder.indexOf(currentPlan);
  const requiredIdx = requiredPlan ? planOrder.indexOf(requiredPlan) : -1;

  // Check plan level
  if (requiredPlan && currentIdx < requiredIdx) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <span className="text-4xl">🔒</span>
        <h3 className="font-serif mt-4 text-lg font-bold text-ink-900 dark:text-paper-50">Upgrade Required</h3>
        <p className="mt-2 text-sm text-muted-500">This feature requires the {requiredPlan} plan or above.</p>
        <button onClick={() => router.push('/upgrade')} className="btn-primary mt-4">Upgrade Now</button>
      </div>
    );
  }

  // Check daily MCQ limit for free users
  if (currentPlan === 'free' && dailyMcqUsed >= dailyMcqLimit) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <span className="text-4xl">⏳</span>
        <h3 className="font-serif mt-4 text-lg font-bold text-ink-900 dark:text-paper-50">Daily Limit Reached</h3>
        <p className="mt-2 text-sm text-muted-500">You&apos;ve used {dailyMcqUsed}/{dailyMcqLimit} free MCQs today. Upgrade for unlimited access.</p>
        <button onClick={() => router.push('/upgrade')} className="btn-primary mt-4">Upgrade Now</button>
      </div>
    );
  }

  return <>{children}</>;
}
