'use client';

/**
 * Loading state components — Zero Spinners Policy.
 * Every loading experience uses meaningful skeletons + custom animations.
 */

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-5 pt-6 pb-28 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 rounded bg-paper-200" />
        <div className="h-8 w-16 rounded bg-paper-200" />
      </div>
      <div className="h-8 w-48 rounded bg-paper-200" />
      <div className="h-4 w-32 rounded bg-paper-200" />
      <div className="space-y-3">
        <div className="h-20 w-full rounded-xl bg-paper-200" />
        <div className="h-20 w-full rounded-xl bg-paper-200" />
        <div className="h-20 w-full rounded-xl bg-paper-200" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="paper-card p-5 space-y-3 animate-pulse">
      <div className="h-4 w-1/3 rounded bg-paper-200" />
      <div className="h-3 w-2/3 rounded bg-paper-200" />
      <div className="h-3 w-1/2 rounded bg-paper-200" />
    </div>
  );
}

export function ChapterSkeleton() {
  return (
    <div className="kindle-frame">
      <div className="kindle-header animate-pulse">
        <div className="h-6 w-6 rounded bg-paper-200" />
        <div className="h-4 w-32 rounded bg-paper-200" />
        <div className="flex gap-2">
          <div className="h-6 w-12 rounded bg-paper-200" />
          <div className="h-6 w-16 rounded bg-paper-200" />
        </div>
      </div>
      <div className="flex-1 p-6 space-y-4 animate-pulse">
        <div className="h-6 w-3/4 rounded bg-paper-200" />
        <div className="h-4 w-full rounded bg-paper-200" />
        <div className="h-4 w-full rounded bg-paper-200" />
        <div className="h-4 w-5/6 rounded bg-paper-200" />
        <div className="h-4 w-full rounded bg-paper-200" />
        <div className="h-4 w-2/3 rounded bg-paper-200" />
        <div className="h-6 w-1/2 rounded bg-paper-200 mt-6" />
        <div className="h-4 w-full rounded bg-paper-200" />
        <div className="h-4 w-full rounded bg-paper-200" />
        <div className="h-4 w-3/4 rounded bg-paper-200" />
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4 animate-pulse">
      <div className="flex justify-end"><div className="h-10 w-48 rounded-2xl bg-paper-200" /></div>
      <div className="flex justify-start"><div className="h-20 w-64 rounded-2xl bg-paper-200" /></div>
      <div className="flex justify-end"><div className="h-10 w-36 rounded-2xl bg-paper-200" /></div>
      <div className="flex justify-start"><div className="h-16 w-56 rounded-2xl bg-paper-200" /></div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="paper-card p-4 space-y-2">
          <div className="h-3 w-16 rounded bg-paper-200" />
          <div className="h-7 w-12 rounded bg-paper-200" />
          <div className="h-3 w-20 rounded bg-paper-200" />
        </div>
      ))}
    </div>
  );
}

export function QuizSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-5 pt-6 space-y-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-paper-200" />
      <div className="paper-card p-5 space-y-4">
        <div className="h-5 w-full rounded bg-paper-200" />
        <div className="h-4 w-4/5 rounded bg-paper-200" />
        <div className="space-y-2 mt-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 w-full rounded-xl bg-paper-200" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function NewsCardSkeleton() {
  return (
    <div className="paper-card p-4 space-y-2 animate-pulse">
      <div className="h-4 w-3/4 rounded bg-paper-200" />
      <div className="h-3 w-full rounded bg-paper-200" />
      <div className="h-3 w-full rounded bg-paper-200" />
      <div className="h-3 w-2/3 rounded bg-paper-200" />
    </div>
  );
}

export function VisualizerSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-pulse">
      <div className="h-32 w-48 rounded-xl bg-gradient-to-br from-paper-200 to-paper-300 dark:from-ink-700 dark:to-ink-600" />
      <p className="mt-4 text-sm text-muted-500">Generating visualization...</p>
    </div>
  );
}
